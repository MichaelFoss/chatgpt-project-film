import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGeneratedSourceDocuments,
  buildGeneratedSources,
} from '../../scripts/build-generated-sources.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-generated-sources-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  return rootDir;
}

async function writeCatalog(rootDir, catalog) {
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
  vi.unstubAllGlobals();
});

describe('buildGeneratedSources', () => {
  it('writes required generated source documents with valid frontmatter', async () => {
    const rootDir = await createTempProject();
    await writeCatalog(rootDir, {
      'imdb:tt001': {
        canonicalId: 'imdb:tt001',
        mediaType: 'movie',
        title: 'Alpha',
        releaseYear: 1999,
        genres: ['Drama'],
        ratings: {
          imdb: '8.1',
        },
      },
    });

    const files = await buildGeneratedSources({
      rootDir,
      lastUpdated: '2026-06-03',
    });

    expect(files.map((file) => path.basename(file)).sort()).toEqual([
      'catalog-by-decade.md',
      'catalog-by-genre.md',
      'catalog-discovery.md',
      'catalog-summary.md',
    ]);

    for (const file of files) {
      const parsed = matter(await fs.readFile(file, 'utf8'));

      expect(parsed.data.status).toBe('generated');
      expect(parsed.data.last_updated.toISOString().slice(0, 10)).toBe(
        '2026-06-03',
      );
      expect(parsed.data.upload_to_chatgpt).toBe(true);
      expect(parsed.data.generated_from).toEqual(['data/catalog.json']);
      expect(parsed.data.title).toEqual(expect.any(String));
    }
  });

  it('sorts genre entries deterministically by title, media type, and id', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-03',
      catalog: {
        z: {
          canonicalId: 'imdb:tt003',
          mediaType: 'series',
          title: 'Beta',
          releaseYear: 2010,
          genres: ['Drama'],
        },
        a: {
          canonicalId: 'imdb:tt001',
          mediaType: 'movie',
          title: 'Alpha',
          releaseYear: 2000,
          genres: ['Drama'],
        },
        b: {
          canonicalId: 'imdb:tt002',
          mediaType: 'movie',
          title: 'Alpha',
          releaseYear: 1999,
          genres: ['Drama'],
        },
      },
    });

    expect(docs['catalog-by-genre.md']).toContain(
      [
        '## Drama',
        '',
        '- Alpha (2000) - movie',
        '- Alpha (1999) - movie',
        '- Beta (2010) - series',
      ].join('\n'),
    );
  });

  it('builds empty/minimal catalog sources without placeholders from provider internals', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-03',
      catalog: {},
    });

    expect(docs['catalog-summary.md']).toContain(
      '- Total enriched catalog records: 0',
    );
    expect(docs['catalog-by-genre.md']).not.toContain('##');
    expect(docs['catalog-discovery.md']).toContain(
      '## High IMDb Ratings',
    );
    expect(docs['catalog-discovery.md']).toContain('- None');
  });

  it('groups decades using normalized catalog releaseYear only', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-03',
      catalog: {
        'imdb:tt001': {
          canonicalId: 'imdb:tt001',
          mediaType: 'movie',
          title: 'Normalized Date',
          releaseYear: 1984,
          genres: ['Sci-Fi'],
          omdb: {
            Year: '1999',
          },
        },
        'imdb:tt002': {
          canonicalId: 'imdb:tt002',
          mediaType: 'movie',
          title: 'No Normalized Date',
          genres: ['Drama'],
          omdb: {
            Year: '1977',
          },
        },
      },
    });

    expect(docs['catalog-by-decade.md']).toContain('## 1980s');
    expect(docs['catalog-by-decade.md']).toContain(
      '- Normalized Date (1984) - movie',
    );
    expect(docs['catalog-by-decade.md']).toContain(
      '## Unknown or undated',
    );
    expect(docs['catalog-by-decade.md']).toContain(
      '- No Normalized Date - movie',
    );
    expect(docs['catalog-by-decade.md']).not.toContain('1970s');
    expect(docs['catalog-by-decade.md']).not.toContain('1990s');
  });

  it('generates sources offline without provider or network calls', async () => {
    const rootDir = await createTempProject();
    const fetchImpl = vi.fn(async () => {
      throw new Error('Network access is not allowed.');
    });
    vi.stubGlobal('fetch', fetchImpl);
    await writeCatalog(rootDir, {
      'imdb:tt001': {
        canonicalId: 'imdb:tt001',
        mediaType: 'movie',
        title: 'Offline Title',
        releaseYear: 2001,
        genres: ['Adventure'],
      },
    });

    await buildGeneratedSources({
      rootDir,
      lastUpdated: '2026-06-03',
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
