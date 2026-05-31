import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  planPlexImport,
  readPlexConfig,
  validatePlexConfig,
} from '../../scripts/plex-plan.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-plex-cli-'),
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

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('plex:plan scaffolding', () => {
  it('reads Plex configuration from the environment', () => {
    expect(
      readPlexConfig({
        PLEX_URL: ' http://localhost:32400 ',
        PLEX_TOKEN: ' token ',
      }),
    ).toEqual({
      plexUrl: 'http://localhost:32400',
      plexToken: 'token',
    });
  });

  it('fails fast when Plex configuration is missing', () => {
    expect(() =>
      validatePlexConfig({ plexUrl: '', plexToken: '' }),
    ).toThrow(
      'Missing required Plex configuration: PLEX_URL, PLEX_TOKEN.',
    );

    expect(() =>
      validatePlexConfig({
        plexUrl: 'http://localhost:32400',
        plexToken: '',
      }),
    ).toThrow('Missing required Plex configuration: PLEX_TOKEN.');
  });

  it('returns transitional planning output when configuration is present', async () => {
    const rootDir = await createTempProject();
    const requestedPaths = [];

    await expect(
      planPlexImport({
        env: {
          PLEX_URL: 'http://localhost:32400',
          PLEX_TOKEN: 'token',
        },
        rootDir,
        fetchImpl: async (url) => {
          requestedPaths.push(url.pathname);

          if (url.pathname === '/library/sections') {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  MediaContainer: {
                    Directory: [
                      { key: '1', title: 'Movies', type: 'movie' },
                    ],
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
                      {
                        ratingKey: '100',
                        title: 'Braveheart',
                        year: 1995,
                      },
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
                      Guid: [
                        { id: 'imdb://tt0112573' },
                        { id: 'tmdb://197' },
                      ],
                    },
                  ],
                },
              };
            },
          };
        },
      }),
    ).resolves.toBe(
      [
        'Movies scanned: 1',
        '',
        'Importable: 1',
        'Needs review: 0',
        '',
        'Already represented: 0',
        'Would add: 1',
        '',
        JSON.stringify(
          {
            moviesScanned: 1,
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
            alreadyRepresentedItems: [],
          },
          null,
          2,
        ),
      ].join('\n'),
    );

    expect(requestedPaths).toEqual([
      '/library/sections',
      '/library/sections/1/all',
      '/library/metadata/100',
    ]);
  });
});
