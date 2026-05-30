import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogBuildError } from '../../scripts/lib/catalog-build-error.js';
import { buildCatalog } from '../../scripts/lib/catalog-builder.js';
import { formatReport } from '../../scripts/lib/catalog-report.js';

const tempDirs = [];
const repositoryRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const expectedBraveheartCatalogRecord = {
  canonicalId: 'imdb:tt0112573',
  mediaType: 'movie',
  title: 'Braveheart',
  description:
    'Scottish warrior William Wallace leads his countrymen in a rebellion to free his homeland from the tyranny of King Edward I of England.',
  posterUrl:
    'https://m.media-amazon.com/images/M/MV5BNGMxZDBhNGQtYTZlNi00N2UzLWI4NDEtNmUzNWM2NTdmZDA0XkEyXkFqcGc@._V1_SX300.jpg',
  genres: ['Biography', 'Drama', 'War'],
  people: {
    directors: ['Mel Gibson'],
    writers: ['Randall Wallace'],
    actors: ['Mel Gibson', 'Sophie Marceau', 'Patrick McGoohan'],
  },
  ratings: {
    imdb: '8.3',
    rottenTomatoes: {
      critics: '74%',
    },
    metacritic: '68',
  },
};

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-catalog-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  return rootDir;
}

async function writeEvents(rootDir, events) {
  const lines = events.map((event) => JSON.stringify(event)).join('\n');
  await fs.writeFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    `${lines}\n`,
    'utf8',
  );
}

async function writeRawEvents(rootDir, text) {
  await fs.writeFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    text,
    'utf8',
  );
}

async function writeMetadata(rootDir, metadataCache) {
  await fs.writeFile(
    path.join(rootDir, 'data', 'metadata-cache.json'),
    `${JSON.stringify(metadataCache, null, 2)}\n`,
    'utf8',
  );
}

async function readCatalog(rootDir) {
  const text = await fs.readFile(
    path.join(rootDir, 'data', 'catalog.json'),
    'utf8',
  );
  return JSON.parse(text);
}

async function expectNoCatalog(rootDir) {
  await expect(
    fs.access(path.join(rootDir, 'data', 'catalog.json')),
  ).rejects.toThrow();
}

function catalogAdd(overrides = {}) {
  return {
    eventType: 'catalog.add',
    occurredAt: '2026-05-29T00:00:00.000Z',
    source: 'manual',
    canonicalId: 'imdb:tt0112573',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('buildCatalog', () => {
  it('repository fixture builds Braveheart from metadata cache', async () => {
    const outputDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'film-catalog-output-'),
    );
    tempDirs.push(outputDir);
    const outputPath = path.join(outputDir, 'catalog.json');

    const metadataCacheText = await fs.readFile(
      path.join(repositoryRootDir, 'data', 'metadata-cache.json'),
      'utf8',
    );
    const metadataCache = JSON.parse(metadataCacheText);

    expect(metadataCache['imdb:tt0112573']).toMatchObject({
      canonicalId: 'imdb:tt0112573',
      provider: 'omdb',
      isValid: true,
      metadata: {
        Title: 'Braveheart',
        imdbID: 'tt0112573',
        Type: 'movie',
      },
    });

    const report = await buildCatalog({
      rootDir: repositoryRootDir,
      outputPath,
    });
    const catalog = JSON.parse(await fs.readFile(outputPath, 'utf8'));

    expect(report.missingMetadata).toEqual([]);
    expect(report.invalidMetadata).toEqual([]);
    expect(report.catalogRecordsWritten).toBe(1);
    expect(catalog).toEqual({
      'imdb:tt0112573': expectedBraveheartCatalogRecord,
    });
  });

  it('valid replay writes expected catalog output', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [
      catalogAdd({
        eventId: 'event-1',
        canonicalId: 'imdb:tt0112573',
      }),
      catalogAdd({
        eventId: 'event-2',
        source: 'plex',
        canonicalId: 'imdb:tt0944947',
      }),
    ]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': {
        canonicalId: 'imdb:tt0112573',
        provider: 'manual',
        isValid: true,
        lastUpdatedAt: '2026-05-29T00:00:00.000Z',
        metadata: {
          mediaType: 'movie',
          title: 'Braveheart',
          genres: ['Biography', 'Drama'],
          description: 'A historical epic.',
          posterUrl: 'https://example.test/braveheart.jpg',
          people: {
            directors: ['Mel Gibson'],
            writers: ['Randall Wallace'],
            actors: ['Mel Gibson', 'Sophie Marceau'],
          },
          ratings: {
            imdb: '8.3',
            rottenTomatoes: {
              audience: '85%',
            },
          },
        },
      },
      'imdb:tt0944947': {
        canonicalId: 'imdb:tt0944947',
        provider: 'omdb',
        isValid: true,
        lastUpdatedAt: '2026-05-29T00:00:00.000Z',
        metadata: {
          Title: 'Game of Thrones',
          Type: 'series',
          Genre: 'Action, Adventure, Drama',
          Plot: 'Noble families vie for control.',
          Poster: 'N/A',
          Director: 'N/A',
          Writer: 'David Benioff, D.B. Weiss',
          Actors: 'Emilia Clarke, Peter Dinklage',
          imdbRating: '9.2',
          Metascore: '86',
          Ratings: [
            {
              Source: 'Rotten Tomatoes',
              Value: '89%',
            },
          ],
        },
      },
    });

    const report = await buildCatalog({ rootDir });
    const catalogText = await fs.readFile(
      path.join(rootDir, 'data', 'catalog.json'),
      'utf8',
    );

    expect(report.catalogRecordsWritten).toBe(2);
    expect(catalogText.endsWith('\n')).toBe(true);
    expect(JSON.parse(catalogText)).toEqual({
      'imdb:tt0112573': {
        canonicalId: 'imdb:tt0112573',
        mediaType: 'movie',
        title: 'Braveheart',
        description: 'A historical epic.',
        posterUrl: 'https://example.test/braveheart.jpg',
        genres: ['Biography', 'Drama'],
        people: {
          directors: ['Mel Gibson'],
          writers: ['Randall Wallace'],
          actors: ['Mel Gibson', 'Sophie Marceau'],
        },
        ratings: {
          imdb: '8.3',
          rottenTomatoes: {
            audience: '85%',
          },
        },
      },
      'imdb:tt0944947': {
        canonicalId: 'imdb:tt0944947',
        mediaType: 'series',
        title: 'Game of Thrones',
        description: 'Noble families vie for control.',
        genres: ['Action', 'Adventure', 'Drama'],
        people: {
          writers: ['David Benioff', 'D.B. Weiss'],
          actors: ['Emilia Clarke', 'Peter Dinklage'],
        },
        ratings: {
          imdb: '9.2',
          rottenTomatoes: {
            critics: '89%',
          },
          metacritic: '86',
        },
      },
    });
  });

  it('duplicate eventId is fatal and does not write catalog', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [
      catalogAdd({
        eventId: 'duplicate',
        canonicalId: 'imdb:tt0112573',
      }),
      catalogAdd({
        eventId: 'duplicate',
        canonicalId: 'imdb:tt0944947',
      }),
    ]);
    await writeMetadata(rootDir, {});

    await expect(buildCatalog({ rootDir })).rejects.toThrow(
      CatalogBuildError,
    );
    await expectNoCatalog(rootDir);
  });

  it('duplicate catalog.add is non-fatal and writes one catalog item', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [
      catalogAdd({ eventId: 'event-1' }),
      catalogAdd({ eventId: 'event-2' }),
    ]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': {
        canonicalId: 'imdb:tt0112573',
        provider: 'manual',
        isValid: true,
        lastUpdatedAt: '2026-05-29T00:00:00.000Z',
        metadata: {
          mediaType: 'movie',
          title: 'Braveheart',
          genres: [],
        },
      },
    });

    const report = await buildCatalog({ rootDir });
    const catalog = await readCatalog(rootDir);

    expect(report.duplicateCatalogAddsSkipped).toBe(1);
    expect(report.catalogRecordsWritten).toBe(1);
    expect(Object.keys(catalog)).toEqual(['imdb:tt0112573']);
    expect(catalog['imdb:tt0112573'].genres).toEqual([]);
  });

  it('missing metadata is non-fatal, reports omission, and writes catalog without placeholder', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await buildCatalog({ rootDir });
    const catalog = await readCatalog(rootDir);
    const formatted = formatReport(report);

    expect(report.missingMetadata).toEqual(['imdb:tt0112573']);
    expect(report.catalogRecordsWritten).toBe(0);
    expect(catalog).toEqual({});
    expect(formatted).toContain('missing metadata: 1');
    expect(formatted).toContain('imdb:tt0112573');
  });

  it('invalid/unusable metadata is non-fatal, reports omission, and writes catalog without placeholder', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': {
        canonicalId: 'imdb:tt0112573',
        provider: 'manual',
        isValid: true,
        lastUpdatedAt: '2026-05-29T00:00:00.000Z',
        metadata: {
          mediaType: 'movie',
          genres: ['Drama'],
        },
      },
    });

    const report = await buildCatalog({ rootDir });
    const catalog = await readCatalog(rootDir);

    expect(report.invalidMetadata).toEqual(['imdb:tt0112573']);
    expect(report.catalogRecordsWritten).toBe(0);
    expect(catalog).toEqual({});
  });

  it('invalid event shape is fatal and does not write catalog', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [
      catalogAdd({
        eventType: 'watch.add',
      }),
    ]);
    await writeMetadata(rootDir, {});

    await expect(buildCatalog({ rootDir })).rejects.toThrow(
      CatalogBuildError,
    );
    await expectNoCatalog(rootDir);
  });

  it('invalid NDJSON is fatal and reports the line number', async () => {
    const rootDir = await createTempProject();
    await writeRawEvents(
      rootDir,
      `${JSON.stringify(catalogAdd())}\n{"eventType":\n`,
    );
    await writeMetadata(rootDir, {});

    await expect(buildCatalog({ rootDir })).rejects.toThrow(/line 2/);
    await expectNoCatalog(rootDir);
  });

  it('missing metadata-cache.json is non-fatal and writes an empty catalog', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);

    const report = await buildCatalog({ rootDir });
    const catalog = await readCatalog(rootDir);

    expect(report.metadataCacheMissing).toBe(true);
    expect(report.missingMetadata).toEqual(['imdb:tt0112573']);
    expect(report.catalogRecordsWritten).toBe(0);
    expect(catalog).toEqual({});
  });

  it('invalid metadata-cache JSON is fatal', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    await fs.writeFile(
      path.join(rootDir, 'data', 'metadata-cache.json'),
      '{invalid',
      'utf8',
    );

    await expect(buildCatalog({ rootDir })).rejects.toThrow(
      CatalogBuildError,
    );
    await expectNoCatalog(rootDir);
  });
});
