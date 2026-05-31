import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatCatalogItem,
  formatCatalogItems,
  listCatalog,
  listUsage,
  parseCatalogListCliArgs,
  parseCatalogSearchCliArgs,
  parseCatalogShowCliArgs,
  searchUsage,
  searchCatalog,
  showUsage,
  showCatalogItem,
} from '../../scripts/lib/catalog-query.js';

const execFileAsync = promisify(execFile);
const tempDirs = [];
const repositoryRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const catalogFixture = {
  'imdb:tt0112573': {
    canonicalId: 'imdb:tt0112573',
    mediaType: 'movie',
    title: 'Braveheart',
    description: 'A historical epic.',
    genres: ['Biography', 'Drama', 'War'],
    people: {
      directors: ['Mel Gibson'],
      writers: ['Randall Wallace'],
      actors: ['Mel Gibson', 'Sophie Marceau'],
    },
  },
  'imdb:tt0133093': {
    canonicalId: 'imdb:tt0133093',
    mediaType: 'movie',
    title: 'The Matrix',
    description: 'A hacker discovers hidden reality.',
    genres: ['Action', 'Sci-Fi'],
    people: {
      directors: ['Lana Wachowski', 'Lilly Wachowski'],
      writers: ['Lana Wachowski', 'Lilly Wachowski'],
      actors: ['Keanu Reeves', 'Carrie-Anne Moss'],
    },
  },
  'imdb:tt0234215': {
    canonicalId: 'imdb:tt0234215',
    mediaType: 'movie',
    title: 'The Matrix Reloaded',
    genres: ['Action', 'Sci-Fi'],
    people: {
      directors: ['Lana Wachowski', 'Lilly Wachowski'],
      actors: ['Keanu Reeves', 'Laurence Fishburne'],
    },
  },
  'imdb:tt0944947': {
    canonicalId: 'imdb:tt0944947',
    mediaType: 'series',
    title: 'Game of Thrones',
    genres: ['Action', 'Adventure', 'Drama'],
    people: {
      writers: ['David Benioff', 'D.B. Weiss'],
      actors: ['Emilia Clarke', 'Peter Dinklage'],
    },
  },
  'imdb:tt3896198': {
    canonicalId: 'imdb:tt3896198',
    mediaType: 'movie',
    title: 'Guardians of the Galaxy: Vol. 2',
    genres: ['Action', 'Adventure', 'Comedy', 'Sci-Fi'],
    people: {
      directors: ['James Gunn'],
      writers: ['James Gunn'],
      actors: ['Chris Pratt', 'Zoe Saldana'],
    },
  },
};

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-query-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    `${JSON.stringify(catalogFixture, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'metadata-cache.json'),
    '{"unchanged":true}\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    '{"unchanged":true}\n',
    'utf8',
  );
  return rootDir;
}

async function readMutationSentinels(rootDir) {
  return {
    catalog: await fs.readFile(
      path.join(rootDir, 'data', 'catalog.json'),
      'utf8',
    ),
    metadataCache: await fs.readFile(
      path.join(rootDir, 'data', 'metadata-cache.json'),
      'utf8',
    ),
    events: await fs.readFile(
      path.join(rootDir, 'events', 'catalog.events.ndjson'),
      'utf8',
    ),
  };
}

function titles(items) {
  return items.map((item) => item.title);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('catalog query commands', () => {
  it('keeps structured usage output stable', () => {
    expect(listUsage).toBe(
      [
        'Usage:',
        '  yarn catalog:list [filters]',
        '',
        'Filters:',
        '  --id <pattern>',
        '  --title <pattern>',
        '  --type <movie|series>',
        '  --genre <pattern>',
        '  --person <pattern>',
        '  --director <pattern>',
        '  --writer <pattern>',
        '  --actor <pattern>',
        '',
        'Pattern Rules:',
        '  * matches zero or more characters',
        '  Matching is case-insensitive',
        '  Repeated filters of the same type are ORed',
        '  Different filter types are ANDed',
        '',
        'Options:',
        '  --json',
      ].join('\n'),
    );
    expect(showUsage).toBe(
      [
        'Usage:',
        '  yarn catalog:show <canonicalId>',
        '',
        'Options:',
        '  --json',
      ].join('\n'),
    );
    expect(showUsage).not.toContain('Pattern Rules:');
    expect(searchUsage).toBe(
      [
        'Usage:',
        '  yarn catalog:search <title>',
        '  yarn catalog:search [filters]',
        '',
        'Filters:',
        '  --id <pattern>',
        '  --title <pattern>',
        '  --type <movie|series>',
        '  --genre <pattern>',
        '  --person <pattern>',
        '  --director <pattern>',
        '  --writer <pattern>',
        '  --actor <pattern>',
        '',
        'Pattern Rules:',
        '  * matches zero or more characters',
        '  Matching is case-insensitive',
        '  Repeated filters of the same type are ORed',
        '  Different filter types are ANDed',
        '',
        'Options:',
        '  --json',
      ].join('\n'),
    );
    expect(listUsage).toContain('Pattern Rules:');
    expect(searchUsage).toContain('Pattern Rules:');
  });

  it('catalog:list reads catalog items in stable title order', async () => {
    const rootDir = await createTempProject();

    const items = await listCatalog({ rootDir });

    expect(titles(items)).toEqual([
      'Braveheart',
      'Game of Thrones',
      'Guardians of the Galaxy: Vol. 2',
      'The Matrix',
      'The Matrix Reloaded',
    ]);
  });

  it('catalog:show returns one item by canonical ID', async () => {
    const rootDir = await createTempProject();

    await expect(
      showCatalogItem({ rootDir, canonicalId: 'imdb:tt0133093' }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt0133093',
      title: 'The Matrix',
    });
    await expect(
      showCatalogItem({ rootDir, canonicalId: 'imdb:missing' }),
    ).resolves.toBeNull();
  });

  it('catalog:search treats the positional argument as a title alias', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogSearchCliArgs(['matrix']);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([
      'The Matrix',
      'The Matrix Reloaded',
    ]);
  });

  it('repeated flags are ORed and different flags are ANDed', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogSearchCliArgs([
      '--genre',
      'Drama',
      '--genre',
      'Sci-Fi',
      '--media-type',
      'movie',
      '--actor',
      'Keanu Reeves',
    ]);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([
      'The Matrix',
      'The Matrix Reloaded',
    ]);
  });

  it('supports equals-form genre filters and ORs repeated values', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogSearchCliArgs([
      '--genre=Sci-Fi',
      '--genre=War',
      '--type=movie',
    ]);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([
      'Braveheart',
      'Guardians of the Galaxy: Vol. 2',
      'The Matrix',
      'The Matrix Reloaded',
    ]);
  });

  it('supports --type=movie and --id=imdb:* filters', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogListCliArgs([
      '--id=imdb:*',
      '--type=movie',
    ]);

    const items = await listCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([
      'Braveheart',
      'Guardians of the Galaxy: Vol. 2',
      'The Matrix',
      'The Matrix Reloaded',
    ]);
  });

  it('keeps --media-type=movie as a compatibility alias', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogListCliArgs(['--media-type=movie']);

    const items = await listCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([
      'Braveheart',
      'Guardians of the Galaxy: Vol. 2',
      'The Matrix',
      'The Matrix Reloaded',
    ]);
  });

  it('wildcard patterns use * and remain case-insensitive', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogSearchCliArgs([
      '--title',
      '*THRONES',
      '--person',
      'd.b.*',
    ]);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual(['Game of Thrones']);
  });

  it('supports quoted title values with spaces and punctuation', async () => {
    const rootDir = await createTempProject();
    const title = 'Guardians of the Galaxy: Vol. 2';
    const { filters } = parseCatalogSearchCliArgs(['--title', title]);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([title]);
  });

  it('supports equals-form title values with spaces and punctuation', async () => {
    const rootDir = await createTempProject();
    const title = 'Guardians of the Galaxy: Vol. 2';
    const { filters } = parseCatalogSearchCliArgs([`--title=${title}`]);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([title]);
  });

  it('supports positional title search with spaces and punctuation', async () => {
    const rootDir = await createTempProject();
    const title = 'Guardians of the Galaxy: Vol. 2';
    const { filters } = parseCatalogSearchCliArgs([title]);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual([title]);
  });

  it('supports quoted wildcard title values with punctuation', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogSearchCliArgs([
      '--title=Guardians*Vol. 2',
    ]);

    const items = await searchCatalog({ rootDir, filters });

    expect(titles(items)).toEqual(['Guardians of the Galaxy: Vol. 2']);
  });

  it('filters IDs, roles, and media types', async () => {
    const rootDir = await createTempProject();
    const { filters } = parseCatalogListCliArgs([
      '--id',
      'imdb:tt0*',
      '--director',
      'Mel Gibson',
      '--writer',
      'Randall Wallace',
      '--media-type',
      'movie',
    ]);

    const items = await listCatalog({ rootDir, filters });

    expect(titles(items)).toEqual(['Braveheart']);
  });

  it('formats text and JSON-compatible results', async () => {
    const rootDir = await createTempProject();
    const item = await showCatalogItem({
      rootDir,
      canonicalId: 'imdb:tt0112573',
    });

    expect(formatCatalogItem(item)).toContain(
      [
        'Braveheart (movie)',
        '- canonicalId: imdb:tt0112573',
        '- genres: Biography, Drama, War',
      ].join('\n'),
    );
    expect(formatCatalogItems([item])).toBe(
      'imdb:tt0112573 | movie | Braveheart',
    );
    expect(JSON.parse(JSON.stringify([item], null, 2))).toEqual([item]);
  });

  it('CLI --json emits parseable JSON', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-search.js',
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, 'matrix', '--json'],
      { cwd: rootDir },
    );

    expect(titles(JSON.parse(stdout))).toEqual([
      'The Matrix',
      'The Matrix Reloaded',
    ]);
  });

  it('catalog:search without criteria fails with usage output', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-search.js',
    );

    await expect(
      execFileAsync(process.execPath, [scriptPath], { cwd: rootDir }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: `${searchUsage}\n`,
    });
  });

  it('catalog:search --json without criteria fails with usage output', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-search.js',
    );

    await expect(
      execFileAsync(process.execPath, [scriptPath, '--json'], {
        cwd: rootDir,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: `${searchUsage}\n`,
    });
  });

  it('catalog:list invalid invocation fails with usage output', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-list.js',
    );

    await expect(
      execFileAsync(process.execPath, [scriptPath, 'matrix'], {
        cwd: rootDir,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: `${listUsage}\n`,
    });
  });

  it('catalog:show invalid invocation fails with usage output', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-show.js',
    );

    await expect(
      execFileAsync(process.execPath, [scriptPath], { cwd: rootDir }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: `${showUsage}\n`,
    });
  });

  it('catalog:search matrix succeeds from the CLI', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-search.js',
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, 'matrix'],
      { cwd: rootDir },
    );

    expect(stdout).toContain('imdb:tt0133093 | movie | The Matrix');
    expect(stdout).toContain(
      'imdb:tt0234215 | movie | The Matrix Reloaded',
    );
  });

  it('catalog:search --genre=Drama succeeds from the CLI', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-search.js',
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, '--genre=Drama'],
      { cwd: rootDir },
    );

    expect(stdout).toContain('imdb:tt0112573 | movie | Braveheart');
    expect(stdout).toContain(
      'imdb:tt0944947 | series | Game of Thrones',
    );
  });

  it('catalog:show --json emits null for missing items', async () => {
    const rootDir = await createTempProject();
    const scriptPath = path.join(
      repositoryRootDir,
      'scripts',
      'catalog-show.js',
    );

    await expect(
      execFileAsync(
        process.execPath,
        [scriptPath, 'imdb:missing', '--json'],
        { cwd: rootDir },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stdout: 'null\n',
    });
  });

  it('does not mutate events, metadata cache, or catalog files', async () => {
    const rootDir = await createTempProject();
    const before = await readMutationSentinels(rootDir);
    const { filters } = parseCatalogSearchCliArgs(['matrix']);

    await listCatalog({ rootDir });
    await searchCatalog({ rootDir, filters });
    await showCatalogItem({ rootDir, canonicalId: 'imdb:tt0133093' });

    expect(await readMutationSentinels(rootDir)).toEqual(before);
  });

  it('rejects invalid CLI arguments', () => {
    expect(() => parseCatalogShowCliArgs([])).toThrow(showUsage);
    expect(() =>
      parseCatalogShowCliArgs(['id', '--title', 'x']),
    ).toThrow('Unknown flag: --title');
    expect(() => parseCatalogListCliArgs(['matrix'])).toThrow(
      listUsage,
    );
    expect(() => parseCatalogSearchCliArgs(['--title'])).toThrow(
      searchUsage,
    );
    expect(() => parseCatalogSearchCliArgs([])).toThrow(searchUsage);
    expect(() => parseCatalogSearchCliArgs(['--json'])).toThrow(
      searchUsage,
    );
    expect(parseCatalogSearchCliArgs(['matrix']).json).toBe(false);
    expect(
      parseCatalogSearchCliArgs(['--genre=Drama']).filters.genre,
    ).toEqual(['Drama']);
  });
});
