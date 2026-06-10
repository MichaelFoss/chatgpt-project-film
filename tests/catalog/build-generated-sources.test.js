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
      'catalog-coverage-summary.md',
      'catalog-critical-highlights.md',
      'catalog-genres-action-adventure.md',
      'catalog-genres-comedy-family-animation-romance.md',
      'catalog-genres-documentary-biography-history-music-sport-war-western.md',
      'catalog-genres-drama-crime-thriller-mystery.md',
      'catalog-genres-sci-fi-fantasy-horror.md',
      'catalog-genres-uncategorized.md',
      'catalog-summary.md',
      'catalog-title-index-a-f.md',
      'catalog-title-index-g-m.md',
      'catalog-title-index-n-z.md',
      'title-reactions-summary.md',
    ]);

    for (const file of files) {
      const parsed = matter(await fs.readFile(file, 'utf8'));

      expect(parsed.data.status).toBe('generated');
      expect(parsed.data.last_updated.toISOString().slice(0, 10)).toBe(
        '2026-06-03',
      );
      expect(parsed.data.upload_to_chatgpt).toBe(
        path.basename(file) !== 'catalog-coverage-summary.md',
      );
      expect(parsed.data.generated_from).toEqual(
        path.basename(file) === 'title-reactions-summary.md'
          ? ['data/title-reactions.json', 'data/catalog.json']
          : ['data/catalog.json'],
      );
      expect(parsed.data.title).toEqual(expect.any(String));
    }
  });

  it('sorts title index entries deterministically by title, media type, and id', () => {
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

    expect(docs['catalog-title-index-a-f.md']).toContain(
      [
        '## Titles',
        '',
        '- Alpha (2000) - movie - Drama - IMDb: tt001',
        '- Alpha (1999) - movie - Drama - IMDb: tt002',
        '- Beta (2010) - series - Drama - IMDb: tt003',
      ].join('\n'),
    );
  });

  it('generates deterministic document content for identical catalog data', () => {
    const input = {
      z: {
        canonicalId: 'imdb:tt003',
        mediaType: 'movie',
        title: 'Zulu',
        releaseYear: 2003,
        genres: ['Action'],
      },
      a: {
        canonicalId: 'imdb:tt001',
        mediaType: 'movie',
        title: 'Alpha',
        releaseYear: 2001,
        genres: ['Drama'],
        ratings: {
          imdb: '8.2',
        },
      },
    };

    expect(
      buildGeneratedSourceDocuments({
        lastUpdated: '2026-06-03',
        catalog: input,
      }),
    ).toEqual(
      buildGeneratedSourceDocuments({
        lastUpdated: '2026-06-03',
        catalog: input,
      }),
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
    expect(docs['catalog-genres-action-adventure.md']).toContain(
      '## Action',
    );
    expect(docs['catalog-genres-action-adventure.md']).toContain(
      '- None',
    );
    expect(docs['catalog-critical-highlights.md']).toContain(
      '## Strongest IMDb Ratings',
    );
    expect(docs['catalog-critical-highlights.md']).toContain('- None');
    expect(docs['catalog-coverage-summary.md']).toContain(
      'upload_to_chatgpt: false',
    );
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

  it('partitions title indexes by stable title ranges', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-03',
      catalog: {
        alpha: {
          canonicalId: 'imdb:tt001',
          mediaType: 'movie',
          title: 'Alpha',
          releaseYear: 2000,
          genres: ['Drama'],
        },
        gamma: {
          canonicalId: 'imdb:tt002',
          mediaType: 'movie',
          title: 'Gamma',
          releaseYear: 2001,
          genres: ['Comedy'],
        },
        november: {
          canonicalId: 'imdb:tt003',
          mediaType: 'movie',
          title: 'November',
          releaseYear: 2002,
          genres: ['Action'],
        },
      },
    });

    expect(docs['catalog-title-index-a-f.md']).toContain(
      '- Alpha (2000) - movie - Drama - IMDb: tt001',
    );
    expect(docs['catalog-title-index-a-f.md']).not.toContain('Gamma');
    expect(docs['catalog-title-index-g-m.md']).toContain(
      '- Gamma (2001) - movie - Comedy - IMDb: tt002',
    );
    expect(docs['catalog-title-index-g-m.md']).not.toContain('Alpha');
    expect(docs['catalog-title-index-n-z.md']).toContain(
      '- November (2002) - movie - Action - IMDb: tt003',
    );
  });

  it('partitions genre family documents deterministically and keeps unmatched genres', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-03',
      catalog: {
        action: {
          canonicalId: 'imdb:tt001',
          mediaType: 'movie',
          title: 'Action Title',
          releaseYear: 2000,
          genres: ['Action'],
        },
        drama: {
          canonicalId: 'imdb:tt002',
          mediaType: 'movie',
          title: 'Drama Title',
          releaseYear: 2001,
          genres: ['Drama'],
        },
        short: {
          canonicalId: 'imdb:tt003',
          mediaType: 'movie',
          title: 'Short Title',
          releaseYear: 2002,
          genres: ['Short'],
        },
        noGenre: {
          canonicalId: 'imdb:tt004',
          mediaType: 'movie',
          title: 'No Genre Title',
          releaseYear: 2003,
          genres: [],
        },
      },
    });

    expect(docs['catalog-genres-action-adventure.md']).toContain(
      '- Action Title (2000) - movie',
    );
    expect(docs['catalog-genres-action-adventure.md']).not.toContain(
      'Drama Title',
    );
    expect(
      docs['catalog-genres-drama-crime-thriller-mystery.md'],
    ).toContain('- Drama Title (2001) - movie');
    expect(docs['catalog-genres-uncategorized.md']).toContain(
      '## Uncategorized',
    );
    expect(docs['catalog-genres-uncategorized.md']).toContain(
      '- No Genre Title (2003) - movie',
    );
    expect(docs['catalog-genres-uncategorized.md']).toContain(
      '## Short',
    );
    expect(docs['catalog-genres-uncategorized.md']).toContain(
      '- Short Title (2002) - movie',
    );
  });

  it('adds ownership caveats to ownership-oriented generated documents', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-03',
      catalog: {},
    });
    const ownershipFiles = Object.keys(docs).filter((filename) => {
      return (
        filename.startsWith('catalog-title-index-') ||
        filename.startsWith('catalog-genres-')
      );
    });

    for (const filename of ownershipFiles) {
      expect(docs[filename]).toContain(
        'Ownership does not imply watched status, liked status, or recommendation strength.',
      );
    }
  });

  it('removes superseded generated source files during builds', async () => {
    const rootDir = await createTempProject();
    const outputDir = path.join(rootDir, 'sources', 'generated');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'catalog-by-genre.md'),
      'stale',
      'utf8',
    );
    await fs.writeFile(
      path.join(outputDir, 'catalog-discovery.md'),
      'stale',
      'utf8',
    );
    await writeCatalog(rootDir, {});

    await buildGeneratedSources({
      rootDir,
      lastUpdated: '2026-06-03',
    });

    await expect(
      fs.access(path.join(outputDir, 'catalog-by-genre.md')),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(outputDir, 'catalog-discovery.md')),
    ).rejects.toThrow();
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
