import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importPlex,
  parsePlexImportCliArgs,
} from '../../scripts/plex-import.js';
import { planPlexImport } from '../../scripts/plex-plan.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-plex-import-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    '',
    'utf8',
  );
  return rootDir;
}

function createPlexMovieFetch(movies, metadataByRatingKey) {
  return async (url) => {
    if (url.pathname === '/library/sections') {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            MediaContainer: {
              Directory: [{ key: '1', title: 'Movies', type: 'movie' }],
            },
          };
        },
      };
    }

    if (url.pathname === '/library/sections/1/all') {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            MediaContainer: {
              Metadata: movies,
            },
          };
        },
      };
    }

    const metadataMatch = url.pathname.match(
      /^\/library\/metadata\/([^/]+)$/,
    );
    const metadata = metadataMatch
      ? metadataByRatingKey[metadataMatch[1]]
      : null;

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          MediaContainer: {
            Metadata: metadata ? [metadata] : [],
          },
        };
      },
    };
  };
}

function createBraveheartFetch() {
  return createPlexMovieFetch(
    [{ ratingKey: '100', title: 'Braveheart', year: 1995 }],
    {
      100: {
        ratingKey: '100',
        title: 'Braveheart',
        type: 'movie',
        year: 1995,
        Guid: [{ id: 'imdb://tt0112573' }],
      },
    },
  );
}

async function readCatalogEvents(rootDir) {
  const text = await fs.readFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    'utf8',
  );

  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('plex:import scaffolding', () => {
  it('parses default, plan, write, and JSON modes', () => {
    expect(parsePlexImportCliArgs([])).toEqual({
      mode: 'plan',
      json: false,
    });
    expect(parsePlexImportCliArgs(['--plan'])).toEqual({
      mode: 'plan',
      json: false,
    });
    expect(parsePlexImportCliArgs(['--write'])).toEqual({
      mode: 'write',
      json: false,
    });
    expect(parsePlexImportCliArgs(['--json'])).toEqual({
      mode: 'plan',
      json: true,
    });
    expect(parsePlexImportCliArgs(['--plan', '--json'])).toEqual({
      mode: 'plan',
      json: true,
    });
    expect(() => parsePlexImportCliArgs(['--plan', '--write'])).toThrow(
      'Usage:',
    );
  });

  it('makes default mode equivalent to --plan', async () => {
    const defaultRootDir = await createTempProject();
    const planRootDir = await createTempProject();
    const env = {
      PLEX_URL: 'http://localhost:32400',
      PLEX_TOKEN: 'token',
    };

    await expect(
      importPlex({
        args: [],
        env,
        rootDir: defaultRootDir,
        fetchImpl: createBraveheartFetch(),
      }),
    ).resolves.toBe(
      await importPlex({
        args: ['--plan'],
        env,
        rootDir: planRootDir,
        fetchImpl: createBraveheartFetch(),
      }),
    );
  });

  it('reuses plex:plan planning behavior in plan mode', async () => {
    const importRootDir = await createTempProject();
    const planRootDir = await createTempProject();
    const env = {
      PLEX_URL: 'http://localhost:32400',
      PLEX_TOKEN: 'token',
    };

    await expect(
      importPlex({
        args: ['--plan'],
        env,
        rootDir: importRootDir,
        fetchImpl: createBraveheartFetch(),
      }),
    ).resolves.toBe(
      await planPlexImport({
        env,
        rootDir: planRootDir,
        fetchImpl: createBraveheartFetch(),
      }),
    );
  });

  it('supports JSON output in plan mode', async () => {
    const rootDir = await createTempProject();
    const output = await importPlex({
      args: ['--json'],
      env: {
        PLEX_URL: 'http://localhost:32400',
        PLEX_TOKEN: 'token',
      },
      rootDir,
      fetchImpl: createBraveheartFetch(),
    });

    expect(JSON.parse(output)).toEqual({
      moviesScanned: 1,
      importable: 1,
      needsReview: 0,
      alreadyRepresented: 0,
      wouldAdd: 1,
      plannedItems: [
        {
          canonicalId: 'tt0112573',
          source: 'plex',
          title: 'Braveheart',
          year: 1995,
          plexRatingKey: '100',
        },
      ],
      needsReviewItems: [],
    });
  });

  it('writes expected catalog.add events', async () => {
    const rootDir = await createTempProject();

    await importPlex({
      args: ['--write'],
      env: {
        PLEX_URL: 'http://localhost:32400',
        PLEX_TOKEN: 'token',
      },
      rootDir,
      fetchImpl: createBraveheartFetch(),
    });

    const events = await readCatalogEvents(rootDir);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'catalog.add',
      source: 'plex',
      canonicalId: 'imdb:tt0112573',
      metadataLookup: 'auto',
    });
    expect(new Date(events[0].occurredAt).toString()).not.toBe(
      'Invalid Date',
    );
  });

  it('appends zero events on a second write run', async () => {
    const rootDir = await createTempProject();
    const env = {
      PLEX_URL: 'http://localhost:32400',
      PLEX_TOKEN: 'token',
    };

    const firstOutput = await importPlex({
      args: ['--write'],
      env,
      rootDir,
      fetchImpl: createBraveheartFetch(),
    });
    const secondOutput = await importPlex({
      args: ['--write'],
      env,
      rootDir,
      fetchImpl: createBraveheartFetch(),
    });

    expect(firstOutput).toContain('Events appended: 1');
    expect(secondOutput).toContain('Events appended: 0');
    expect(secondOutput).toContain('Previously represented: 1');
    await expect(readCatalogEvents(rootDir)).resolves.toHaveLength(1);
  });

  it('does not write review-map ignored items', async () => {
    const rootDir = await createTempProject();

    await fs.mkdir(path.join(rootDir, 'config'), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, 'config', 'plex-review.json'),
      JSON.stringify({
        ignoredItems: [
          {
            plexRatingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            year: 2007,
          },
        ],
        manualMappings: [],
      }),
      'utf8',
    );

    const output = await importPlex({
      args: ['--write'],
      env: {
        PLEX_URL: 'http://localhost:32400',
        PLEX_TOKEN: 'token',
      },
      rootDir,
      fetchImpl: createPlexMovieFetch(
        [
          {
            ratingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            year: 2007,
          },
        ],
        {
          1718: {
            ratingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            type: 'movie',
            year: 2007,
            Guid: [{ id: 'imdb://tt1329665' }],
          },
        },
      ),
    });

    expect(output).toContain('Events appended: 0');
    await expect(readCatalogEvents(rootDir)).resolves.toEqual([]);
  });

  it('writes review-map manual mappings', async () => {
    const rootDir = await createTempProject();

    await fs.mkdir(path.join(rootDir, 'config'), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, 'config', 'plex-review.json'),
      JSON.stringify({
        ignoredItems: [],
        manualMappings: [
          {
            plexRatingKey: '4292',
            title: 'Samson',
            year: 2017,
            canonicalId: 'tt6951892',
          },
        ],
      }),
      'utf8',
    );

    await importPlex({
      args: ['--write'],
      env: {
        PLEX_URL: 'http://localhost:32400',
        PLEX_TOKEN: 'token',
      },
      rootDir,
      fetchImpl: createPlexMovieFetch(
        [{ ratingKey: '4292', title: 'Samson', year: 2017 }],
        {
          4292: {
            ratingKey: '4292',
            title: 'Samson',
            type: 'movie',
            year: 2017,
            Guid: [{ id: 'tmdb://4292' }],
          },
        },
      ),
    });

    await expect(readCatalogEvents(rootDir)).resolves.toMatchObject([
      {
        eventType: 'catalog.add',
        source: 'plex',
        canonicalId: 'imdb:tt6951892',
      },
    ]);
  });

  it('does not persist Plex metadata in written events', async () => {
    const rootDir = await createTempProject();

    await importPlex({
      args: ['--write'],
      env: {
        PLEX_URL: 'http://localhost:32400',
        PLEX_TOKEN: 'token',
      },
      rootDir,
      fetchImpl: createBraveheartFetch(),
    });

    const [event] = await readCatalogEvents(rootDir);

    expect(Object.keys(event).sort()).toEqual([
      'canonicalId',
      'eventType',
      'metadataLookup',
      'occurredAt',
      'source',
    ]);
    expect(event).not.toHaveProperty('plexRatingKey');
    expect(event).not.toHaveProperty('ratingKey');
    expect(event).not.toHaveProperty('guids');
    expect(event).not.toHaveProperty('Guid');
    expect(event).not.toHaveProperty('librarySectionId');
    expect(event).not.toHaveProperty('path');
    expect(event).not.toHaveProperty('title');
  });

  it('does not invoke provider or enrichment code during write', async () => {
    const rootDir = await createTempProject();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new Error('provider fetch should not be called'),
      );

    await expect(
      importPlex({
        args: ['--write'],
        env: {
          PLEX_URL: 'http://localhost:32400',
          PLEX_TOKEN: 'token',
        },
        rootDir,
        fetchImpl: createBraveheartFetch(),
      }),
    ).resolves.toContain('Events appended: 1');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('supports JSON output in write mode', async () => {
    const rootDir = await createTempProject();
    const output = await importPlex({
      args: ['--write', '--json'],
      env: {
        PLEX_URL: 'http://localhost:32400',
        PLEX_TOKEN: 'token',
      },
      rootDir,
      fetchImpl: createBraveheartFetch(),
    });

    expect(JSON.parse(output)).toEqual(
      expect.objectContaining({
        moviesScanned: 1,
        eventsAppended: 1,
        previouslyRepresented: 0,
        skippedReviewItems: 0,
      }),
    );
    expect(JSON.parse(output)).not.toHaveProperty('alreadyRepresented');
  });
});
