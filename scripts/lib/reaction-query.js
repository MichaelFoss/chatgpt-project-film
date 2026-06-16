import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';
import { readCatalog } from './catalog-query.js';
import {
  readReactionIgnoredState,
  readReactionState,
} from './reaction-cli.js';
import {
  isSupportedReactionBand,
  ratingMatchesReactionBand,
  reactionRatingBands,
} from './reaction-ratings.js';

export const reactionListUsage = [
  'Usage:',
  '  yarn reactions:list [--rating <exceptional|loved|liked|mixed|disliked|hated>]',
  '  yarn reactions:list [--exceptional|--loved|--liked|--mixed|--disliked|--hated]',
  '  yarn reactions:list --ignored',
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
    return 'Series';
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
  let ignored = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--ignored') {
      if (ratingBand || ignored) {
        throw new CatalogBuildError(reactionListUsage);
      }

      ignored = true;
      continue;
    }

    if (ratingFlags.has(arg)) {
      if (ratingBand || ignored) {
        throw new CatalogBuildError(reactionListUsage);
      }

      ratingBand = ratingFlags.get(arg);
      continue;
    }

    if (arg === '--rating') {
      if (ratingBand || ignored) {
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
      if (ratingBand || ignored) {
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

  return { ratingBand, ignored };
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

function assertJsonObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogBuildError(`${label} must be a JSON object`);
  }
}

function assertCatalogJoins(catalog, records) {
  const missing = Object.entries(records)
    .filter(([, record]) => {
      if (
        !record ||
        typeof record !== 'object' ||
        Array.isArray(record)
      ) {
        return false;
      }

      return !catalog[record.canonicalId];
    })
    .map(([recordKey, record]) => record.canonicalId ?? recordKey)
    .filter(isNonEmptyString)
    .sort();

  if (missing.length > 0) {
    throw new CatalogBuildError(
      `No catalog title found for canonical ID: ${missing.join(', ')}`,
    );
  }
}

function getCatalogJoinedTitleItems({ catalog, records, mapRecord }) {
  assertJsonObject(catalog, 'catalog');
  assertJsonObject(records, 'title state');
  assertCatalogJoins(catalog, records);

  return Object.values(records)
    .map((record) => {
      const item = catalog[record.canonicalId];

      return mapRecord({ record, item });
    })
    .sort(compareReactionItems);
}

export function getReactionQueryItems({
  catalog,
  reactions,
  ignored = {},
  ratingBand = null,
} = {}) {
  assertJsonObject(reactions, 'title reaction state');

  if (ratingBand && !isSupportedReactionBand(ratingBand)) {
    throw new CatalogBuildError(reactionListUsage);
  }

  const ignoredTitleIds = new Set(Object.keys(ignored ?? {}));
  const filteredReactions = Object.fromEntries(
    Object.entries(reactions).filter(([, reaction]) => {
      if (ignoredTitleIds.has(reaction?.canonicalId)) {
        return false;
      }

      return ratingBand
        ? ratingMatchesReactionBand(reaction.rating, ratingBand)
        : true;
    }),
  );

  return getCatalogJoinedTitleItems({
    catalog,
    records: filteredReactions,
    mapRecord({ record: reaction, item }) {
      return {
        canonicalId: reaction.canonicalId,
        title: item.title,
        releaseYear: item.releaseYear,
        mediaType: item.mediaType,
        rating: reaction.rating,
        ...(isNonEmptyString(reaction.notes)
          ? { notes: reaction.notes }
          : {}),
        ...(Array.isArray(reaction.reasons) &&
        reaction.reasons.length > 0
          ? { reasons: [...reaction.reasons] }
          : {}),
      };
    },
  });
}

export function getIgnoredReactionQueryItems({
  catalog,
  ignored,
} = {}) {
  assertJsonObject(ignored, 'ignored title state');

  return getCatalogJoinedTitleItems({
    catalog,
    records: ignored,
    mapRecord({ record, item }) {
      return {
        canonicalId: record.canonicalId,
        title: item.title,
        releaseYear: item.releaseYear,
        mediaType: item.mediaType,
        ...(Array.isArray(item.genres) && item.genres.length > 0
          ? { genres: [...item.genres] }
          : {}),
      };
    },
  });
}

export async function listReactions({
  rootDir = process.cwd(),
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
  reactionsPath = path.join(rootDir, 'data', 'title-reactions.json'),
  ignoredPath = path.join(rootDir, 'data', 'title-ignored.json'),
  ratingBand = null,
  ignored = false,
} = {}) {
  const [catalog, reactions, ignoredState] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionState({ rootDir, reactionsPath }),
    readReactionIgnoredState({ rootDir, ignoredPath }),
  ]);

  return ignored
    ? getIgnoredReactionQueryItems({
        catalog,
        ignored: ignoredState,
      })
    : getReactionQueryItems({
        catalog,
        reactions,
        ignored: ignoredState,
        ratingBand,
      });
}

export async function exportReactions(options = {}) {
  const {
    rootDir = process.cwd(),
    catalogPath = path.join(rootDir, 'data', 'catalog.json'),
    reactionsPath = path.join(rootDir, 'data', 'title-reactions.json'),
    ratingBand = null,
  } = options;
  const [catalog, reactions] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionState({ rootDir, reactionsPath }),
  ]);

  return getReactionQueryItems({ catalog, reactions, ratingBand });
}

export function formatReactionQueryItems(
  items,
  { ratingBand = null, ignored = false } = {},
) {
  if (items.length === 0) {
    if (ignored) {
      return 'No ignored titles found.';
    }

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
        ignored ? null : formatRating(item.rating),
        ignored && Array.isArray(item.genres) && item.genres.length > 0
          ? item.genres.join(', ')
          : null,
      ]
        .filter((value) => value !== null)
        .join(' | ');

      const detailLines = [];

      if (isNonEmptyString(item.notes)) {
        detailLines.push(`  Notes: ${item.notes}`);
      }

      if (Array.isArray(item.reasons) && item.reasons.length > 0) {
        detailLines.push(`  Reasons: ${item.reasons.join(', ')}`);
      }

      return detailLines.length > 0
        ? [line, ...detailLines].join('\n')
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
