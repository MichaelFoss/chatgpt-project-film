import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatReactionStats,
  getReactionStats,
  getReactionStatsFromProjections,
} from '../../scripts/reaction-stats.js';

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
    title: 'Alpha',
  },
  'imdb:tt002': {
    canonicalId: 'imdb:tt002',
    mediaType: 'series',
    title: 'Beta',
  },
  'imdb:tt003': {
    canonicalId: 'imdb:tt003',
    mediaType: 'movie',
    title: 'Gamma',
  },
  'imdb:tt004': {
    canonicalId: 'imdb:tt004',
    mediaType: 'series',
    title: 'Delta',
  },
  'imdb:tt005': {
    canonicalId: 'imdb:tt005',
    mediaType: 'movie',
    title: 'Epsilon',
  },
};

function reaction(canonicalId, rating) {
  return {
    canonicalId,
    updatedAt: '2026-06-10T12:00:00.000Z',
    eventIds: [`event-${canonicalId}`],
    rating,
  };
}

function ignoredTitle(canonicalId) {
  return {
    canonicalId,
    ignoredAt: '2026-06-10T12:00:00.000Z',
    eventId: `event-ignore-${canonicalId}`,
  };
}

async function createTempProject({
  reactions = {},
  ignored = {},
  eventStreamText = '{"malformed": true\n',
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-stats-'),
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
    path.join(rootDir, 'data', 'title-ignored.json'),
    `${JSON.stringify(ignored, null, 2)}\n`,
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

describe('reaction stats command', () => {
  it('reports an empty reaction projection', () => {
    const stats = getReactionStats({ catalog, reactions: {} });

    expect(stats).toEqual({
      overall: {
        totalCatalogTitles: 5,
        totalReactedTitles: 0,
        totalIgnoredTitles: 0,
        totalEligibleUnreactedTitles: 5,
        reactionCoveragePercentage: '0.0%',
      },
      reactionDistribution: {
        exceptional: { count: 0, percentage: '0.0%' },
        loved: { count: 0, percentage: '0.0%' },
        liked: { count: 0, percentage: '0.0%' },
        mixed: { count: 0, percentage: '0.0%' },
        disliked: { count: 0, percentage: '0.0%' },
        hated: { count: 0, percentage: '0.0%' },
      },
      mediaTypes: {
        moviesReacted: 0,
        tvReacted: 0,
        moviesIgnored: 0,
        tvIgnored: 0,
        moviesEligibleUnreacted: 3,
        tvEligibleUnreacted: 2,
      },
    });
  });

  it('reports partial coverage and media type breakdowns', () => {
    const stats = getReactionStats({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8),
        'imdb:tt003': reaction('imdb:tt003', 5),
      },
    });

    expect(stats.overall).toEqual({
      totalCatalogTitles: 5,
      totalReactedTitles: 3,
      totalIgnoredTitles: 0,
      totalEligibleUnreactedTitles: 2,
      reactionCoveragePercentage: '60.0%',
    });
    expect(stats.mediaTypes).toEqual({
      moviesReacted: 2,
      tvReacted: 1,
      moviesIgnored: 0,
      tvIgnored: 0,
      moviesEligibleUnreacted: 1,
      tvEligibleUnreacted: 1,
    });
  });

  it('reports ignored and eligible-unreacted titles separately', () => {
    const stats = getReactionStats({
      catalog,
      reactions: {},
      ignored: {
        'imdb:tt001': ignoredTitle('imdb:tt001'),
        'imdb:tt002': ignoredTitle('imdb:tt002'),
      },
    });

    expect(stats.overall).toEqual({
      totalCatalogTitles: 5,
      totalReactedTitles: 0,
      totalIgnoredTitles: 2,
      totalEligibleUnreactedTitles: 3,
      reactionCoveragePercentage: '0.0%',
    });
    expect(stats.mediaTypes).toEqual({
      moviesReacted: 0,
      tvReacted: 0,
      moviesIgnored: 1,
      tvIgnored: 1,
      moviesEligibleUnreacted: 2,
      tvEligibleUnreacted: 1,
    });
  });

  it('reports mixed reacted, ignored, and eligible-unreacted catalog states', () => {
    const stats = getReactionStats({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8),
      },
      ignored: {
        'imdb:tt003': ignoredTitle('imdb:tt003'),
        'imdb:tt004': ignoredTitle('imdb:tt004'),
      },
    });

    expect(stats.overall).toEqual({
      totalCatalogTitles: 5,
      totalReactedTitles: 2,
      totalIgnoredTitles: 2,
      totalEligibleUnreactedTitles: 1,
      reactionCoveragePercentage: '40.0%',
    });
    expect(stats.mediaTypes).toEqual({
      moviesReacted: 1,
      tvReacted: 1,
      moviesIgnored: 1,
      tvIgnored: 1,
      moviesEligibleUnreacted: 1,
      tvEligibleUnreacted: 0,
    });
  });

  it('reports full coverage', () => {
    const stats = getReactionStats({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8),
        'imdb:tt003': reaction('imdb:tt003', 5),
        'imdb:tt004': reaction('imdb:tt004', 3),
        'imdb:tt005': reaction('imdb:tt005', 1),
      },
    });

    expect(stats.overall).toEqual({
      totalCatalogTitles: 5,
      totalReactedTitles: 5,
      totalIgnoredTitles: 0,
      totalEligibleUnreactedTitles: 0,
      reactionCoveragePercentage: '100.0%',
    });
    expect(stats.mediaTypes).toEqual({
      moviesReacted: 3,
      tvReacted: 2,
      moviesIgnored: 0,
      tvIgnored: 0,
      moviesEligibleUnreacted: 0,
      tvEligibleUnreacted: 0,
    });
  });

  it('keeps reaction coverage based only on reacted titles', () => {
    const stats = getReactionStats({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
      },
      ignored: {
        'imdb:tt002': ignoredTitle('imdb:tt002'),
        'imdb:tt003': ignoredTitle('imdb:tt003'),
      },
    });

    expect(stats.overall).toEqual({
      totalCatalogTitles: 5,
      totalReactedTitles: 1,
      totalIgnoredTitles: 2,
      totalEligibleUnreactedTitles: 2,
      reactionCoveragePercentage: '20.0%',
    });
  });

  it('counts canonical reaction bands and percentages in stable order', () => {
    const stats = getReactionStats({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8),
        'imdb:tt003': reaction('imdb:tt003', 5),
        'imdb:tt004': reaction('imdb:tt004', 3),
        'imdb:tt005': reaction('imdb:tt005', 1),
      },
    });

    expect(Object.keys(stats.reactionDistribution)).toEqual([
      'exceptional',
      'loved',
      'liked',
      'mixed',
      'disliked',
      'hated',
    ]);
    expect(stats.reactionDistribution).toEqual({
      exceptional: { count: 1, percentage: '20.0%' },
      loved: { count: 1, percentage: '20.0%' },
      liked: { count: 0, percentage: '0.0%' },
      mixed: { count: 1, percentage: '20.0%' },
      disliked: { count: 1, percentage: '20.0%' },
      hated: { count: 1, percentage: '20.0%' },
    });
  });

  it('formats deterministic human-readable output without terminal tables', () => {
    const stats = getReactionStats({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt002': reaction('imdb:tt002', 8),
        'imdb:tt003': reaction('imdb:tt003', 5),
      },
    });

    expect(formatReactionStats(stats)).toBe(
      [
        'Reaction statistics',
        '',
        'Overall:',
        '- Total catalog titles: 5',
        '- Total reacted titles: 3',
        '- Total ignored titles: 0',
        '- Total eligible unreacted titles: 2',
        '- Reaction coverage: 60.0%',
        '',
        'Reaction distribution:',
        '- exceptional: 1 (33.3%)',
        '- loved: 1 (33.3%)',
        '- liked: 0 (0.0%)',
        '- mixed: 1 (33.3%)',
        '- disliked: 0 (0.0%)',
        '- hated: 0 (0.0%)',
        '',
        'Media type breakdown:',
        '- Movies reacted: 2',
        '- Series reacted: 1',
        '- Movies ignored: 0',
        '- Series ignored: 0',
        '- Movies eligible unreacted: 1',
        '- Series eligible unreacted: 1',
      ].join('\n'),
    );
  });

  it('does not depend on malformed event streams during normal stats queries', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
      },
    });

    await expect(
      getReactionStatsFromProjections({ rootDir }),
    ).resolves.toMatchObject({
      overall: {
        totalCatalogTitles: 5,
        totalReactedTitles: 1,
        totalIgnoredTitles: 0,
        totalEligibleUnreactedTitles: 4,
        reactionCoveragePercentage: '20.0%',
      },
    });
  });

  it('reads ignored titles from the generated projection', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
      },
      ignored: {
        'imdb:tt002': ignoredTitle('imdb:tt002'),
      },
    });

    await expect(
      getReactionStatsFromProjections({ rootDir }),
    ).resolves.toMatchObject({
      overall: {
        totalCatalogTitles: 5,
        totalReactedTitles: 1,
        totalIgnoredTitles: 1,
        totalEligibleUnreactedTitles: 3,
        reactionCoveragePercentage: '20.0%',
      },
    });
  });

  it('prints stats from the thin CLI wrapper', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
      },
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(repositoryRootDir, 'scripts', 'reaction-stats.js')],
      { cwd: rootDir },
    );

    expect(stderr).toBe('');
    expect(stdout.trim()).toContain('Reaction statistics');
    expect(stdout).toContain('- Total reacted titles: 1');
    expect(stdout).toContain('- Total ignored titles: 0');
    expect(stdout).toContain('- Total eligible unreacted titles: 4');
    expect(stdout).not.toContain('event-');
    expect(stdout).not.toContain('eventIds');
  });
});
