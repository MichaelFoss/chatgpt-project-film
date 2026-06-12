import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { readCatalog } from './catalog-query.js';
import { readReactionState } from './reaction-cli.js';
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

function isTvMediaType(mediaType) {
  return mediaType === 'series';
}

export function getReactionStats({ catalog, reactions } = {}) {
  assertProjectionObject(catalog, 'catalog');
  assertProjectionObject(reactions, 'title reaction state');

  const catalogItems = Object.values(catalog);
  const reactedIds = new Set();
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
    moviesUnreacted: 0,
    tvUnreacted: 0,
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

  const totalCatalogTitles = catalogItems.length;
  const totalReactedTitles = reactedIds.size;
  const totalUnreactedTitles = totalCatalogTitles - totalReactedTitles;

  for (const item of catalogItems) {
    const isReacted = reactedIds.has(item.canonicalId);

    if (item.mediaType === 'movie') {
      if (isReacted) {
        mediaTypes.moviesReacted += 1;
      } else {
        mediaTypes.moviesUnreacted += 1;
      }
      continue;
    }

    if (isTvMediaType(item.mediaType)) {
      if (isReacted) {
        mediaTypes.tvReacted += 1;
      } else {
        mediaTypes.tvUnreacted += 1;
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
      totalUnreactedTitles,
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
} = {}) {
  const [catalog, reactions] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionState({ rootDir, reactionsPath }),
  ]);

  return getReactionStats({ catalog, reactions });
}

export function formatReactionStats(stats) {
  return [
    'Reaction statistics',
    '',
    'Overall:',
    `- Total catalog titles: ${stats.overall.totalCatalogTitles}`,
    `- Total reacted titles: ${stats.overall.totalReactedTitles}`,
    `- Total unreacted titles: ${stats.overall.totalUnreactedTitles}`,
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
    `- TV reacted: ${stats.mediaTypes.tvReacted}`,
    `- Movies unreacted: ${stats.mediaTypes.moviesUnreacted}`,
    `- TV unreacted: ${stats.mediaTypes.tvUnreacted}`,
  ].join('\n');
}
