import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  exportReactions,
  formatReactionExportItems,
  formatReactionExportJson,
  parseReactionExportCliArgs,
  reactionExportUsage,
} from '../../scripts/reaction-export.js';

const execFileAsync = promisify(execFile);
const tempDirs = [];
const repositoryRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const catalog = {
  'imdb:tt001': {
    canonicalId: 'imdb:tt001',
    mediaType: 'movie',
    title: 'Zulu',
    releaseYear: 1964,
  },
  'imdb:tt002': {
    canonicalId: 'imdb:tt002',
    mediaType: 'series',
    title: 'Alpha',
    releaseYear: 2020,
  },
  'imdb:tt003': {
    canonicalId: 'imdb:tt003',
    mediaType: 'movie',
    title: 'Alpha',
    releaseYear: 2005,
  },
  'imdb:tt004': {
    canonicalId: 'imdb:tt004',
    mediaType: 'movie',
    title: 'Beta',
    releaseYear: 1999,
  },
};

function reaction(canonicalId, rating, overrides = {}) {
  return {
    canonicalId,
    updatedAt: '2026-06-10T12:00:00.000Z',
    eventIds: [`event-${canonicalId}`],
    rating,
    ...overrides,
  };
}

async function createTempProject({
  reactions = {
    'imdb:tt001': reaction('imdb:tt001', 10),
    'imdb:tt002': reaction('imdb:tt002', 8),
    'imdb:tt003': reaction('imdb:tt003', 5),
    'imdb:tt004': reaction('imdb:tt004', 3),
  },
  eventStreamText = '{"malformed": true\n',
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-export-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'title-reactions.json'),
    `${JSON.stringify(reactions, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
    eventStreamText,
    'utf8',
  );
  return rootDir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('reaction export command', () => {
  it('parses only the JSON flag', () => {
    expect(parseReactionExportCliArgs([])).toEqual({ json: false });
    expect(parseReactionExportCliArgs(['--json'])).toEqual({
      json: true,
    });
    expect(() => parseReactionExportCliArgs(['--liked'])).toThrow(
      `${reactionExportUsage} Unknown flag: --liked`,
    );
    expect(() => parseReactionExportCliArgs(['extra'])).toThrow(
      reactionExportUsage,
    );
  });

  it('exports empty projections with clear human-readable output', async () => {
    const rootDir = await createTempProject({ reactions: {} });

    const items = await exportReactions({ rootDir });

    expect(items).toEqual([]);
    expect(formatReactionExportItems(items)).toBe(
      'No reacted titles found.',
    );
    expect(formatReactionExportJson(items)).toBe('[]');
  });

  it('exports human-readable data in deterministic title order', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8, {
          notes: 'Loved the atmosphere and soundtrack.',
          reasons: ['Great Atmosphere', 'soundtrack'],
        }),
        'imdb:tt003': reaction('imdb:tt003', 5),
        'imdb:tt004': reaction('imdb:tt004', 3),
      },
    });

    const items = await exportReactions({ rootDir });

    expect(items.map((item) => item.canonicalId)).toEqual([
      'imdb:tt002',
      'imdb:tt003',
      'imdb:tt004',
      'imdb:tt001',
    ]);
    expect(formatReactionExportItems(items)).toBe(
      [
        'Alpha | 2020 | TV | imdb:tt002 | 8/10',
        '  Notes: Loved the atmosphere and soundtrack.',
        '  Reasons: Great Atmosphere, soundtrack',
        'Alpha | 2005 | Movie | imdb:tt003 | 5/10',
        'Beta | 1999 | Movie | imdb:tt004 | 3/10',
        'Zulu | 1964 | Movie | imdb:tt001 | 10/10',
      ].join('\n'),
    );
  });

  it('exports deterministic JSON with only allowed fields', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8, {
          notes: 'Loved the atmosphere and soundtrack.',
          reasons: ['Great Atmosphere', 'soundtrack'],
        }),
        'imdb:tt003': reaction('imdb:tt003', 5),
        'imdb:tt004': reaction('imdb:tt004', 3),
      },
    });

    const items = await exportReactions({ rootDir });
    const parsed = JSON.parse(formatReactionExportJson(items));

    expect(parsed[0]).toEqual({
      canonicalId: 'imdb:tt002',
      title: 'Alpha',
      releaseYear: 2020,
      mediaType: 'series',
      rating: 8,
      notes: 'Loved the atmosphere and soundtrack.',
      reasons: ['Great Atmosphere', 'soundtrack'],
    });
    expect(Object.keys(parsed[0])).toEqual([
      'canonicalId',
      'title',
      'releaseYear',
      'mediaType',
      'rating',
      'notes',
      'reasons',
    ]);
    expect(parsed[1]).toEqual({
      canonicalId: 'imdb:tt003',
      title: 'Alpha',
      releaseYear: 2005,
      mediaType: 'movie',
      rating: 5,
    });
    expect(formatReactionExportJson(items)).not.toContain('eventIds');
    expect(formatReactionExportJson(items)).not.toContain('updatedAt');
    expect(formatReactionExportJson(items)).not.toContain('event-');
    expect(formatReactionExportJson(items)).not.toContain(
      '2026-06-10T12:00:00.000Z',
    );
  });

  it('does not depend on malformed event streams during export', async () => {
    const rootDir = await createTempProject({
      eventStreamText: 'not valid ndjson\n',
    });

    await expect(exportReactions({ rootDir })).resolves.toHaveLength(4);
  });

  it('prints human-readable CLI output', async () => {
    const rootDir = await createTempProject();

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(repositoryRootDir, 'scripts', 'reaction-export.js')],
      { cwd: rootDir },
    );

    expect(stderr).toBe('');
    expect(stdout.trim()).toBe(
      [
        'Alpha | 2020 | TV | imdb:tt002 | 8/10',
        'Alpha | 2005 | Movie | imdb:tt003 | 5/10',
        'Beta | 1999 | Movie | imdb:tt004 | 3/10',
        'Zulu | 1964 | Movie | imdb:tt001 | 10/10',
      ].join('\n'),
    );
    expect(stdout).not.toContain('eventIds');
    expect(stdout).not.toContain('updatedAt');
  });

  it('prints machine-readable JSON CLI output without extra text', async () => {
    const rootDir = await createTempProject();

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        path.join(repositoryRootDir, 'scripts', 'reaction-export.js'),
        '--json',
      ],
      { cwd: rootDir },
    );

    expect(stderr).toBe('');
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toEqual({
      canonicalId: 'imdb:tt002',
      title: 'Alpha',
      releaseYear: 2020,
      mediaType: 'series',
      rating: 8,
    });
    expect(stdout.trim().startsWith('[')).toBe(true);
    expect(stdout).not.toContain('eventIds');
    expect(stdout).not.toContain('updatedAt');
  });
});
