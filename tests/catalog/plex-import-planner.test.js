import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPlexPlanningItem,
  extractImdbIdFromPlexGuids,
  planPlexPlanningItems,
} from '../../scripts/lib/plex-import-planner.js';

const tempDirs = [];

async function createTempProject({
  events = [],
  metadataCache = {},
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
});
