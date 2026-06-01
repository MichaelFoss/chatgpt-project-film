import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogBuildError } from '../../scripts/lib/catalog-build-error.js';
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

function createBraveheartFetch() {
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
              Metadata: [
                { ratingKey: '100', title: 'Braveheart', year: 1995 },
              ],
            },
          };
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '100',
                title: 'Braveheart',
                type: 'movie',
                year: 1995,
                Guid: [{ id: 'imdb://tt0112573' }],
              },
            ],
          },
        };
      },
    };
  };
}

afterEach(async () => {
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

  it('fails write mode with the expected CatalogBuildError', async () => {
    await expect(importPlex({ args: ['--write'] })).rejects.toThrow(
      CatalogBuildError,
    );
    await expect(importPlex({ args: ['--write'] })).rejects.toThrow(
      'Plex write mode is not yet implemented.',
    );
  });
});
