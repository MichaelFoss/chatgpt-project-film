import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';
import { readCatalog } from './catalog-query.js';
import { readReactionState } from './reaction-cli.js';
import {
  isSupportedReactionBand,
  ratingMatchesReactionBand,
  reactionRatingBands,
} from './reaction-ratings.js';

export const reactionListUsage = [
  'Usage:',
  '  yarn reactions:list [--rating <exceptional|loved|liked|mixed|disliked|hated>]',
  '  yarn reactions:list [--exceptional|--loved|--liked|--mixed|--disliked|--hated]',
].join('\n');

export const reactionExportUsage = [
  'Usage:',
  '  yarn reactions:export [--json]',
].join('\n');

const ratingFlags = new Map([
  ['--exceptional', 'exceptional'],
  ['--loved', 'loved'],
  ['--liked', 'liked'],
  ['--mixed', 'mixed'],
  ['--disliked', 'disliked'],
  ['--hated', 'hated'],
]);

function formatMediaType(mediaType) {
  if (mediaType === 'movie') {
    return 'Movie';
  }

  if (mediaType === 'series') {
    return 'TV';
  }

  return mediaType;
}

function formatReleaseYear(releaseYear) {
  return Number.isInteger(releaseYear)
    ? String(releaseYear)
    : 'unknown';
}

function formatRating(rating) {
  return Number.isInteger(rating) ? `${rating}/10` : 'unrated';
}

function compareReactionItems(left, right) {
  return (
    left.title.localeCompare(right.title) ||
    left.canonicalId.localeCompare(right.canonicalId)
  );
}

export function parseReactionListCliArgs(args) {
  let ratingBand = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (ratingFlags.has(arg)) {
      if (ratingBand) {
        throw new CatalogBuildError(reactionListUsage);
      }

      ratingBand = ratingFlags.get(arg);
      continue;
    }

    if (arg === '--rating') {
      if (ratingBand) {
        throw new CatalogBuildError(reactionListUsage);
      }

      const value = args[index + 1];

      if (!isNonEmptyString(value) || value.startsWith('--')) {
        throw new CatalogBuildError(reactionListUsage);
      }

      if (!isSupportedReactionBand(value)) {
        throw new CatalogBuildError(reactionListUsage);
      }

      ratingBand = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--rating=')) {
      if (ratingBand) {
        throw new CatalogBuildError(reactionListUsage);
      }

      const value = arg.slice('--rating='.length);

      if (!isSupportedReactionBand(value)) {
        throw new CatalogBuildError(reactionListUsage);
      }

      ratingBand = value;
      continue;
    }

    throw new CatalogBuildError(
      arg.startsWith('--')
        ? `${reactionListUsage} Unknown flag: ${arg}`
        : reactionListUsage,
    );
  }

  return { ratingBand };
}

export function parseReactionExportCliArgs(args) {
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    throw new CatalogBuildError(
      arg.startsWith('--')
        ? `${reactionExportUsage} Unknown flag: ${arg}`
        : reactionExportUsage,
    );
  }

  return { json };
}

export function getReactionQueryItems({
  catalog,
  reactions,
  ratingBand = null,
} = {}) {
  if (
    !catalog ||
    typeof catalog !== 'object' ||
    Array.isArray(catalog)
  ) {
    throw new CatalogBuildError('catalog must be a JSON object');
  }

  if (
    !reactions ||
    typeof reactions !== 'object' ||
    Array.isArray(reactions)
  ) {
    throw new CatalogBuildError(
      'title reaction state must be a JSON object',
    );
  }

  if (ratingBand && !isSupportedReactionBand(ratingBand)) {
    throw new CatalogBuildError(reactionListUsage);
  }

  return Object.values(reactions)
    .filter((reaction) => {
      if (
        !reaction ||
        typeof reaction !== 'object' ||
        Array.isArray(reaction) ||
        !catalog[reaction.canonicalId]
      ) {
        return false;
      }

      return ratingBand
        ? ratingMatchesReactionBand(reaction.rating, ratingBand)
        : true;
    })
    .map((reaction) => {
      const item = catalog[reaction.canonicalId];

      return {
        canonicalId: reaction.canonicalId,
        title: item.title,
        releaseYear: item.releaseYear,
        mediaType: item.mediaType,
        rating: reaction.rating,
        ...(isNonEmptyString(reaction.notes)
          ? { notes: reaction.notes }
          : {}),
      };
    })
    .sort(compareReactionItems);
}

export async function listReactions({
  rootDir = process.cwd(),
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
  reactionsPath = path.join(rootDir, 'data', 'title-reactions.json'),
  ratingBand = null,
} = {}) {
  const [catalog, reactions] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionState({ rootDir, reactionsPath }),
  ]);

  return getReactionQueryItems({ catalog, reactions, ratingBand });
}

export async function exportReactions(options = {}) {
  return listReactions(options);
}

export function formatReactionQueryItems(
  items,
  { ratingBand = null } = {},
) {
  if (items.length === 0) {
    return ratingBand
      ? `No ${ratingBand} reacted titles found.`
      : 'No reacted titles found.';
  }

  return items
    .map((item) => {
      const line = [
        item.title,
        formatReleaseYear(item.releaseYear),
        formatMediaType(item.mediaType),
        item.canonicalId,
        formatRating(item.rating),
      ].join(' | ');

      return isNonEmptyString(item.notes)
        ? `${line}\n  Notes: ${item.notes}`
        : line;
    })
    .join('\n');
}

export function formatReactionExportItems(items) {
  return formatReactionQueryItems(items);
}

export function formatReactionExportJson(items) {
  return JSON.stringify(items, null, 2);
}

export function getReactionRatingOptions() {
  return Object.keys(reactionRatingBands);
}
