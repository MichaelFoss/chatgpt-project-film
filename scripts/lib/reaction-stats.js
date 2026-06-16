import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { readCatalog } from './catalog-query.js';
import {
  readReactionIgnoredState,
  readReactionState,
} from './reaction-cli.js';
import {
  ratingMatchesReactionBand,
  reactionRatingBands,
} from './reaction-ratings.js';

const reactionBands = Object.keys(reactionRatingBands);

function assertProjectionObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogBuildError(`${label} must be a JSON object`);
  }
}

function formatPercent(numerator, denominator) {
  if (denominator === 0) {
    return '0.0%';
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function isKnownReaction(reaction, catalog) {
  return (
    reaction &&
    typeof reaction === 'object' &&
    !Array.isArray(reaction) &&
    catalog[reaction.canonicalId]
  );
}

function isKnownProjectionRecord(record, catalog) {
  return (
    record &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    catalog[record.canonicalId]
  );
}

function isTvMediaType(mediaType) {
  return mediaType === 'series';
}

export function getReactionStats({
  catalog,
  reactions,
  ignored = {},
} = {}) {
  assertProjectionObject(catalog, 'catalog');
  assertProjectionObject(reactions, 'title reaction state');
  assertProjectionObject(ignored, 'ignored title state');

  const catalogItems = Object.values(catalog);
  const reactedIds = new Set();
  const ignoredIds = new Set();
  const reactionDistribution = Object.fromEntries(
    reactionBands.map((band) => [
      band,
      {
        count: 0,
        percentage: '0.0%',
      },
    ]),
  );
  const mediaTypes = {
    moviesReacted: 0,
    tvReacted: 0,
    moviesIgnored: 0,
    tvIgnored: 0,
    moviesEligibleUnreacted: 0,
    tvEligibleUnreacted: 0,
  };

  for (const reaction of Object.values(reactions)) {
    if (!isKnownReaction(reaction, catalog)) {
      continue;
    }

    reactedIds.add(reaction.canonicalId);

    for (const band of reactionBands) {
      if (ratingMatchesReactionBand(reaction.rating, band)) {
        reactionDistribution[band].count += 1;
        break;
      }
    }
  }

  for (const ignoredTitle of Object.values(ignored)) {
    if (!isKnownProjectionRecord(ignoredTitle, catalog)) {
      continue;
    }

    ignoredIds.add(ignoredTitle.canonicalId);
  }

  const totalCatalogTitles = catalogItems.length;
  const totalReactedTitles = reactedIds.size;
  const totalIgnoredTitles = ignoredIds.size;
  const totalEligibleUnreactedTitles = catalogItems.filter(
    (item) =>
      !reactedIds.has(item.canonicalId) &&
      !ignoredIds.has(item.canonicalId),
  ).length;

  for (const item of catalogItems) {
    const isReacted = reactedIds.has(item.canonicalId);
    const isIgnored = ignoredIds.has(item.canonicalId);

    if (item.mediaType === 'movie') {
      if (isReacted) {
        mediaTypes.moviesReacted += 1;
      }

      if (isIgnored) {
        mediaTypes.moviesIgnored += 1;
      }

      if (!isReacted && !isIgnored) {
        mediaTypes.moviesEligibleUnreacted += 1;
      }
      continue;
    }

    if (isTvMediaType(item.mediaType)) {
      if (isReacted) {
        mediaTypes.tvReacted += 1;
      }

      if (isIgnored) {
        mediaTypes.tvIgnored += 1;
      }

      if (!isReacted && !isIgnored) {
        mediaTypes.tvEligibleUnreacted += 1;
      }
    }
  }

  for (const band of reactionBands) {
    reactionDistribution[band].percentage = formatPercent(
      reactionDistribution[band].count,
      totalReactedTitles,
    );
  }

  return {
    overall: {
      totalCatalogTitles,
      totalReactedTitles,
      totalIgnoredTitles,
      totalEligibleUnreactedTitles,
      reactionCoveragePercentage: formatPercent(
        totalReactedTitles,
        totalCatalogTitles,
      ),
    },
    reactionDistribution,
    mediaTypes,
  };
}

export async function getReactionStatsFromProjections({
  rootDir = process.cwd(),
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
  reactionsPath = path.join(rootDir, 'data', 'title-reactions.json'),
  ignoredPath = path.join(rootDir, 'data', 'title-ignored.json'),
} = {}) {
  const [catalog, reactions, ignored] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionState({ rootDir, reactionsPath }),
    readReactionIgnoredState({ rootDir, ignoredPath }),
  ]);

  return getReactionStats({ catalog, reactions, ignored });
}

export function formatReactionStats(stats) {
  return [
    'Reaction statistics',
    '',
    'Overall:',
    `- Total catalog titles: ${stats.overall.totalCatalogTitles}`,
    `- Total reacted titles: ${stats.overall.totalReactedTitles}`,
    `- Total ignored titles: ${stats.overall.totalIgnoredTitles}`,
    `- Total eligible unreacted titles: ${stats.overall.totalEligibleUnreactedTitles}`,
    `- Reaction coverage: ${stats.overall.reactionCoveragePercentage}`,
    '',
    'Reaction distribution:',
    ...reactionBands.map((band) => {
      const entry = stats.reactionDistribution[band];
      return `- ${band}: ${entry.count} (${entry.percentage})`;
    }),
    '',
    'Media type breakdown:',
    `- Movies reacted: ${stats.mediaTypes.moviesReacted}`,
    `- Series reacted: ${stats.mediaTypes.tvReacted}`,
    `- Movies ignored: ${stats.mediaTypes.moviesIgnored}`,
    `- Series ignored: ${stats.mediaTypes.tvIgnored}`,
    `- Movies eligible unreacted: ${stats.mediaTypes.moviesEligibleUnreacted}`,
    `- Series eligible unreacted: ${stats.mediaTypes.tvEligibleUnreacted}`,
  ].join('\n');
}
