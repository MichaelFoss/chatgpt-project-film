import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatReactionQueryItems,
  getReactionQueryItems,
  listReactions,
  parseReactionListCliArgs,
  reactionListUsage,
} from '../../scripts/reaction-list.js';

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
    title: 'Middle',
    releaseYear: 2005,
  },
  'imdb:tt004': {
    canonicalId: 'imdb:tt004',
    mediaType: 'movie',
    title: 'Beta',
    releaseYear: 1999,
  },
  'imdb:tt005': {
    canonicalId: 'imdb:tt005',
    mediaType: 'movie',
    title: 'Gamma',
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
    'imdb:tt005': reaction('imdb:tt005', 1),
  },
  eventStreamText = 'this is not ndjson\n',
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-query-'),
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

describe('reaction query command', () => {
  it('keeps structured usage output stable', () => {
    expect(reactionListUsage).toBe(
      [
        'Usage:',
        '  yarn reactions:list [--rating <exceptional|loved|liked|mixed|disliked|hated>]',
        '  yarn reactions:list [--exceptional|--loved|--liked|--mixed|--disliked|--hated]',
      ].join('\n'),
    );
  });

  it('lists reacted titles from projections in deterministic title order', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8, {
          notes: 'Loved the atmosphere and soundtrack.',
          reasons: ['great atmosphere', 'soundtrack'],
        }),
        'imdb:tt003': reaction('imdb:tt003', 5),
        'imdb:tt004': reaction('imdb:tt004', 3),
        'imdb:tt005': reaction('imdb:tt005', 1),
      },
    });

    const items = await listReactions({ rootDir });

    expect(items.map((item) => item.title)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Middle',
      'Zulu',
    ]);
    expect(formatReactionQueryItems(items)).toBe(
      [
        'Alpha | 2020 | Series | imdb:tt002 | 8/10',
        '  Notes: Loved the atmosphere and soundtrack.',
        '  Reasons: great atmosphere, soundtrack',
        'Beta | 1999 | Movie | imdb:tt004 | 3/10',
        'Gamma | unknown | Movie | imdb:tt005 | 1/10',
        'Middle | 2005 | Movie | imdb:tt003 | 5/10',
        'Zulu | 1964 | Movie | imdb:tt001 | 10/10',
      ].join('\n'),
    );
  });

  it('filters by each supported rating band', () => {
    const reactions = {
      'imdb:tt001': reaction('imdb:tt001', 10),
      'imdb:tt002': reaction('imdb:tt002', 9),
      'imdb:tt003': reaction('imdb:tt003', 5),
      'imdb:tt004': reaction('imdb:tt004', 4),
      'imdb:tt005': reaction('imdb:tt005', 2),
    };

    expect(
      getReactionQueryItems({
        catalog,
        reactions,
        ratingBand: 'exceptional',
      }),
    ).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt001',
        rating: 10,
      }),
    ]);
    expect(
      getReactionQueryItems({
        catalog,
        reactions,
        ratingBand: 'loved',
      }),
    ).toEqual([
      expect.objectContaining({ canonicalId: 'imdb:tt002', rating: 9 }),
    ]);
    expect(
      getReactionQueryItems({
        catalog,
        reactions,
        ratingBand: 'liked',
      }),
    ).toEqual([]);
    expect(
      getReactionQueryItems({
        catalog,
        reactions: {
          ...reactions,
          'imdb:tt002': reaction('imdb:tt002', 6),
        },
        ratingBand: 'liked',
      }),
    ).toEqual([
      expect.objectContaining({ canonicalId: 'imdb:tt002', rating: 6 }),
    ]);
    expect(
      getReactionQueryItems({
        catalog,
        reactions,
        ratingBand: 'mixed',
      }),
    ).toEqual([
      expect.objectContaining({ canonicalId: 'imdb:tt003', rating: 5 }),
    ]);
    expect(
      getReactionQueryItems({
        catalog,
        reactions,
        ratingBand: 'disliked',
      }),
    ).toEqual([
      expect.objectContaining({ canonicalId: 'imdb:tt004', rating: 4 }),
    ]);
    expect(
      getReactionQueryItems({
        catalog,
        reactions,
        ratingBand: 'hated',
      }),
    ).toEqual([
      expect.objectContaining({ canonicalId: 'imdb:tt005', rating: 2 }),
    ]);
  });

  it('parses rating filters and rejects multiple rating bands', () => {
    expect(parseReactionListCliArgs([])).toEqual({ ratingBand: null });
    expect(
      parseReactionListCliArgs(['--rating', 'exceptional']),
    ).toEqual({
      ratingBand: 'exceptional',
    });
    expect(parseReactionListCliArgs(['--rating=liked'])).toEqual({
      ratingBand: 'liked',
    });
    expect(parseReactionListCliArgs(['--mixed'])).toEqual({
      ratingBand: 'mixed',
    });
    expect(() =>
      parseReactionListCliArgs(['--liked', '--hated']),
    ).toThrow(reactionListUsage);
    expect(() =>
      parseReactionListCliArgs(['--rating', 'favorite']),
    ).toThrow(reactionListUsage);
  });

  it('reports empty results without leaking event details', () => {
    expect(formatReactionQueryItems([])).toBe(
      'No reacted titles found.',
    );
    expect(formatReactionQueryItems([], { ratingBand: 'loved' })).toBe(
      'No loved reacted titles found.',
    );
  });

  it('does not depend on the title reaction event stream for normal queries', async () => {
    const rootDir = await createTempProject({
      eventStreamText: '{"malformed": true\n',
    });

    await expect(listReactions({ rootDir })).resolves.toHaveLength(5);
  });

  it('continues to return lowercase projected reasons in query output', () => {
    const items = getReactionQueryItems({
      catalog,
      reactions: {
        'imdb:tt002': reaction('imdb:tt002', 8, {
          reasons: ['sci-fi', 'action'],
        }),
      },
    });

    expect(items[0].reasons).toEqual(['sci-fi', 'action']);
    expect(formatReactionQueryItems(items)).toContain(
      '  Reasons: sci-fi, action',
    );
  });

  it('prints human-readable CLI output without raw event fields', async () => {
    const rootDir = await createTempProject();

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        path.join(repositoryRootDir, 'scripts', 'reaction-list.js'),
        '--loved',
      ],
      { cwd: rootDir },
    );

    expect(stderr).toBe('');
    expect(stdout.trim()).toBe(
      'Alpha | 2020 | Series | imdb:tt002 | 8/10',
    );
    expect(stdout).not.toContain('event-');
    expect(stdout).not.toContain('eventIds');
    expect(stdout).not.toContain('updatedAt');
    expect(stdout).not.toContain('2026-06-10T12:00:00.000Z');
  });
});
