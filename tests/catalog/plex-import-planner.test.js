import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPlexPlanningItem,
  extractImdbIdFromPlexGuids,
  planPlexPlanningItems,
} from '../../scripts/lib/plex-import-planner.js';
import {
  readPlexReviewMap,
  validatePlexReviewMap,
} from '../../scripts/lib/plex-review-map.js';

const tempDirs = [];

async function createTempProject({
  events = [],
  metadataCache = {},
  reviewMap,
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-plex-plan-'),
  );
  tempDirs.push(rootDir);

  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });

  const eventLines = events
    .map((event) => JSON.stringify(event))
    .join('\n');
  await fs.writeFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    eventLines.length > 0 ? `${eventLines}\n` : '',
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'metadata-cache.json'),
    `${JSON.stringify(metadataCache, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    `${JSON.stringify(metadataCache, null, 2)}\n`,
    'utf8',
  );

  if (reviewMap) {
    await fs.mkdir(path.join(rootDir, 'config'), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, 'config', 'plex-review.json'),
      `${JSON.stringify(reviewMap, null, 2)}\n`,
      'utf8',
    );
  }

  return rootDir;
}

function catalogAdd(canonicalId) {
  return {
    eventType: 'catalog.add',
    occurredAt: '2026-05-29T00:00:00.000Z',
    source: 'manual',
    canonicalId,
    metadataLookup: 'auto',
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('Plex import planner', () => {
  it('extracts IMDb IDs only from exact Plex IMDb GUIDs', () => {
    expect(
      extractImdbIdFromPlexGuids([
        'tmdb://603',
        'imdb://tt0133093',
        'tvdb://123',
      ]),
    ).toBe('tt0133093');

    expect(extractImdbIdFromPlexGuids(['imdb://tt1234567'])).toBe(
      'tt1234567',
    );

    expect(
      extractImdbIdFromPlexGuids([
        'tmdb://269795',
        'tvdb://1864',
        'plex://movie/5d77683f54f42c001f8c470e',
        'tt1131724',
        'imdb://tt123456',
        'imdb://nm0000001',
        'IMDB://tt1131724',
        'imdb://tt1131724?lang=en',
      ]),
    ).toBeNull();
  });

  it('creates minimal importable Plex planning items', () => {
    expect(
      createPlexPlanningItem({
        ratingKey: '1234',
        title: 'Example Movie',
        type: 'movie',
        year: 2020,
        guids: ['imdb://tt1234567', 'tmdb://100'],
        raw: { ignored: true },
      }),
    ).toEqual({
      status: 'importable',
      item: {
        canonicalId: 'tt1234567',
        source: 'plex',
        title: 'Example Movie',
        year: 2020,
        plexRatingKey: '1234',
      },
    });
  });

  it('creates needs-review items when IMDb IDs are missing', () => {
    expect(
      createPlexPlanningItem({
        ratingKey: '1718',
        title: 'Family Guy Presents: Blue Harvest',
        type: 'movie',
        year: 2007,
        guids: ['tmdb://65334', 'tvdb://1234'],
      }),
    ).toEqual({
      status: 'needs-review',
      item: {
        title: 'Family Guy Presents: Blue Harvest',
        year: 2007,
        plexRatingKey: '1718',
        reason: 'Missing IMDb identifier',
      },
    });
  });

  it('fetches full metadata for every Plex movie summary', async () => {
    const rootDir = await createTempProject();
    const requestedRatingKeys = [];
    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            { ratingKey: '100', title: 'Braveheart', year: 1995 },
            {
              ratingKey: '1718',
              title: 'Family Guy Presents: Blue Harvest',
              year: 2007,
            },
          ];
        },
        async fetchMovieMetadata(ratingKey) {
          requestedRatingKeys.push(ratingKey);

          if (ratingKey === '100') {
            return {
              ratingKey: '100',
              title: 'Braveheart',
              type: 'movie',
              year: 1995,
              guids: ['imdb://tt0112573'],
            };
          }

          return {
            ratingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            type: 'movie',
            year: 2007,
            guids: ['tmdb://65334'],
          };
        },
      },
    });

    expect(requestedRatingKeys).toEqual(['100', '1718']);
    expect(report).toEqual({
      moviesScanned: 2,
      plannedItems: [
        {
          canonicalId: 'tt0112573',
          source: 'plex',
          title: 'Braveheart',
          year: 1995,
          plexRatingKey: '100',
        },
      ],
      needsReviewItems: [
        {
          title: 'Family Guy Presents: Blue Harvest',
          year: 2007,
          plexRatingKey: '1718',
          reason: 'Missing IMDb identifier',
        },
      ],
      alreadyRepresentedItems: [],
    });
  });

  it('classifies matching IMDb IDs as already represented from the event stream', async () => {
    const rootDir = await createTempProject({
      events: [catalogAdd('imdb:tt0112573')],
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            { ratingKey: '100', title: 'Braveheart', year: 1995 },
          ];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '100',
            title: 'Braveheart',
            type: 'movie',
            year: 1995,
            guids: ['imdb://tt0112573'],
          };
        },
      },
    });

    expect(report.plannedItems).toEqual([]);
    expect(report.alreadyRepresentedItems).toEqual([
      {
        canonicalId: 'tt0112573',
        source: 'plex',
        title: 'Braveheart',
        year: 1995,
        plexRatingKey: '100',
      },
    ]);
  });

  it('classifies new IMDb IDs as would add', async () => {
    const rootDir = await createTempProject({
      events: [catalogAdd('imdb:tt0112573')],
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            { ratingKey: '200', title: 'The Matrix', year: 1999 },
          ];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '200',
            title: 'The Matrix',
            type: 'movie',
            year: 1999,
            guids: ['imdb://tt0133093'],
          };
        },
      },
    });

    expect(report.plannedItems).toEqual([
      {
        canonicalId: 'tt0133093',
        source: 'plex',
        title: 'The Matrix',
        year: 1999,
        plexRatingKey: '200',
      },
    ]);
    expect(report.alreadyRepresentedItems).toEqual([]);
  });

  it('keeps needs-review items unaffected by event-stream comparison', async () => {
    const rootDir = await createTempProject({
      events: [catalogAdd('imdb:tt0112573')],
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            {
              ratingKey: '1718',
              title: 'Family Guy Presents: Blue Harvest',
              year: 2007,
            },
          ];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            type: 'movie',
            year: 2007,
            guids: ['tmdb://65334'],
          };
        },
      },
    });

    expect(report.plannedItems).toEqual([]);
    expect(report.alreadyRepresentedItems).toEqual([]);
    expect(report.needsReviewItems).toEqual([
      {
        title: 'Family Guy Presents: Blue Harvest',
        year: 2007,
        plexRatingKey: '1718',
        reason: 'Missing IMDb identifier',
      },
    ]);
  });

  it('does not use metadata cache or generated catalog state for matching', async () => {
    const rootDir = await createTempProject({
      metadataCache: {
        'imdb:tt0133093': {
          canonicalId: 'imdb:tt0133093',
          title: 'The Matrix',
        },
      },
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            { ratingKey: '200', title: 'The Matrix', year: 1999 },
          ];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '200',
            title: 'The Matrix',
            type: 'movie',
            year: 1999,
            guids: ['imdb://tt0133093'],
          };
        },
      },
    });

    expect(report.plannedItems).toEqual([
      {
        canonicalId: 'tt0133093',
        source: 'plex',
        title: 'The Matrix',
        year: 1999,
        plexRatingKey: '200',
      },
    ]);
    expect(report.alreadyRepresentedItems).toEqual([]);
  });

  it('treats a missing Plex review map as empty configuration', async () => {
    const rootDir = await createTempProject();

    await expect(readPlexReviewMap({ rootDir })).resolves.toEqual({
      ignoredItems: [],
      manualMappings: [],
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            {
              ratingKey: '1718',
              title: 'Family Guy Presents: Blue Harvest',
              year: 2007,
            },
          ];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            type: 'movie',
            year: 2007,
            guids: ['tmdb://65334'],
          };
        },
      },
    });

    expect(report.needsReviewItems).toEqual([
      {
        title: 'Family Guy Presents: Blue Harvest',
        year: 2007,
        plexRatingKey: '1718',
        reason: 'Missing IMDb identifier',
      },
    ]);
  });

  it('removes ignored Plex review-map items from planning output', async () => {
    const rootDir = await createTempProject({
      reviewMap: {
        ignoredItems: [
          {
            plexRatingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            year: 2007,
            reason: 'TV special',
          },
        ],
        manualMappings: [],
      },
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            {
              ratingKey: '1718',
              title: 'Family Guy Presents: Blue Harvest',
              year: 2007,
            },
          ];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            type: 'movie',
            year: 2007,
            guids: ['tmdb://65334'],
          };
        },
      },
    });

    expect(report.plannedItems).toEqual([]);
    expect(report.needsReviewItems).toEqual([]);
    expect(report.alreadyRepresentedItems).toEqual([]);
  });

  it('uses manual mappings to make Plex items importable', async () => {
    const rootDir = await createTempProject({
      reviewMap: {
        ignoredItems: [],
        manualMappings: [
          {
            plexRatingKey: '4292',
            title: 'Samson',
            year: 2017,
            canonicalId: 'tt6951892',
            reason: 'Missing IMDb GUID in Plex',
          },
        ],
      },
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [{ ratingKey: '4292', title: 'Samson', year: 2017 }];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '4292',
            title: 'Samson',
            type: 'movie',
            year: 2017,
            guids: ['tmdb://4292'],
          };
        },
      },
    });

    expect(report.plannedItems).toEqual([
      {
        canonicalId: 'tt6951892',
        source: 'plex',
        title: 'Samson',
        year: 2017,
        plexRatingKey: '4292',
      },
    ]);
    expect(report.needsReviewItems).toEqual([]);
  });

  it('keeps native IMDb GUID precedence over manual mappings', async () => {
    const rootDir = await createTempProject({
      reviewMap: {
        ignoredItems: [],
        manualMappings: [
          {
            plexRatingKey: '200',
            title: 'The Matrix',
            year: 1999,
            canonicalId: 'tt9999999',
          },
        ],
      },
    });

    const report = await planPlexPlanningItems({
      rootDir,
      client: {
        async fetchMovieSummaries() {
          return [
            { ratingKey: '200', title: 'The Matrix', year: 1999 },
          ];
        },
        async fetchMovieMetadata() {
          return {
            ratingKey: '200',
            title: 'The Matrix',
            type: 'movie',
            year: 1999,
            guids: ['imdb://tt0133093'],
          };
        },
      },
    });

    expect(report.plannedItems[0].canonicalId).toBe('tt0133093');
  });

  it('rejects duplicate Plex review-map rating keys', () => {
    expect(() =>
      validatePlexReviewMap({
        ignoredItems: [
          { plexRatingKey: '1718', title: 'Blue Harvest', year: 2007 },
          { plexRatingKey: '1718', title: 'Blue Harvest', year: 2007 },
        ],
        manualMappings: [],
      }),
    ).toThrow(
      'Plex review map ignoredItems contains duplicate plexRatingKey: 1718.',
    );

    expect(() =>
      validatePlexReviewMap({
        ignoredItems: [],
        manualMappings: [
          {
            plexRatingKey: '4292',
            title: 'Samson',
            year: 2017,
            canonicalId: 'tt6951892',
          },
          {
            plexRatingKey: '4292',
            title: 'Samson',
            year: 2017,
            canonicalId: 'tt6951892',
          },
        ],
      }),
    ).toThrow(
      'Plex review map manualMappings contains duplicate plexRatingKey: 4292.',
    );
  });

  it('rejects invalid Plex review-map fields', () => {
    expect(() =>
      validatePlexReviewMap({
        ignoredItems: [
          {
            plexRatingKey: '1718',
            title: 'Blue Harvest',
          },
        ],
        manualMappings: [],
      }),
    ).toThrow(
      'Plex review map ignoredItems[0] missing required field: year.',
    );

    expect(() =>
      validatePlexReviewMap({
        ignoredItems: [],
        manualMappings: [
          {
            plexRatingKey: '4292',
            title: 'Samson',
            year: 2017,
            canonicalId: 'imdb:tt6951892',
          },
        ],
      }),
    ).toThrow(
      'Plex review map manualMappings[0] canonicalId must be an IMDb title ID like tt0133093.',
    );

    expect(() =>
      validatePlexReviewMap({
        ignoredItems: [
          {
            plexRatingKey: '4292',
            title: 'Samson',
            year: 2017,
          },
        ],
        manualMappings: [
          {
            plexRatingKey: '4292',
            title: 'Samson',
            year: 2017,
            canonicalId: 'tt6951892',
          },
        ],
      }),
    ).toThrow(
      'Plex review map plexRatingKey appears in both ignoredItems and manualMappings: 4292.',
    );
  });
});
