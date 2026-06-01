import fs from 'node:fs/promises';
import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';

const defaultReviewMap = Object.freeze({
  ignoredItems: Object.freeze([]),
  manualMappings: Object.freeze([]),
});
const imdbIdPattern = /^tt\d{7,}$/;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validateReviewItem(item, collectionName, index) {
  if (!isObject(item)) {
    throw new CatalogBuildError(
      `Plex review map ${collectionName}[${index}] must be an object.`,
    );
  }

  if (!isNonEmptyString(item.plexRatingKey)) {
    throw new CatalogBuildError(
      `Plex review map ${collectionName}[${index}] missing required field: plexRatingKey.`,
    );
  }

  if (!isNonEmptyString(item.title)) {
    throw new CatalogBuildError(
      `Plex review map ${collectionName}[${index}] missing required field: title.`,
    );
  }

  if (!Number.isInteger(item.year)) {
    throw new CatalogBuildError(
      `Plex review map ${collectionName}[${index}] missing required field: year.`,
    );
  }

  if (Object.hasOwn(item, 'reason') && !isNonEmptyString(item.reason)) {
    throw new CatalogBuildError(
      `Plex review map ${collectionName}[${index}] reason must be a non-empty string.`,
    );
  }
}

function validateManualMapping(item, index) {
  validateReviewItem(item, 'manualMappings', index);

  if (!isNonEmptyString(item.canonicalId)) {
    throw new CatalogBuildError(
      `Plex review map manualMappings[${index}] missing required field: canonicalId.`,
    );
  }

  if (!imdbIdPattern.test(item.canonicalId)) {
    throw new CatalogBuildError(
      `Plex review map manualMappings[${index}] canonicalId must be an IMDb title ID like tt0133093.`,
    );
  }
}

function assertNoDuplicateRatingKeys(items, collectionName) {
  const seen = new Set();

  for (const item of items) {
    if (seen.has(item.plexRatingKey)) {
      throw new CatalogBuildError(
        `Plex review map ${collectionName} contains duplicate plexRatingKey: ${item.plexRatingKey}.`,
      );
    }

    seen.add(item.plexRatingKey);
  }
}

export function validatePlexReviewMap(reviewMap) {
  if (!isObject(reviewMap)) {
    throw new CatalogBuildError(
      'Plex review map must be a JSON object.',
    );
  }

  if (!Array.isArray(reviewMap.ignoredItems)) {
    throw new CatalogBuildError(
      'Plex review map ignoredItems must be an array.',
    );
  }

  if (!Array.isArray(reviewMap.manualMappings)) {
    throw new CatalogBuildError(
      'Plex review map manualMappings must be an array.',
    );
  }

  reviewMap.ignoredItems.forEach((item, index) => {
    validateReviewItem(item, 'ignoredItems', index);
  });
  reviewMap.manualMappings.forEach(validateManualMapping);
  assertNoDuplicateRatingKeys(reviewMap.ignoredItems, 'ignoredItems');
  assertNoDuplicateRatingKeys(
    reviewMap.manualMappings,
    'manualMappings',
  );

  const ignoredRatingKeys = new Set(
    reviewMap.ignoredItems.map((item) => item.plexRatingKey),
  );

  for (const item of reviewMap.manualMappings) {
    if (ignoredRatingKeys.has(item.plexRatingKey)) {
      throw new CatalogBuildError(
        `Plex review map plexRatingKey appears in both ignoredItems and manualMappings: ${item.plexRatingKey}.`,
      );
    }
  }

  return {
    ignoredItems: reviewMap.ignoredItems,
    manualMappings: reviewMap.manualMappings,
  };
}

export async function readPlexReviewMap({
  rootDir = process.cwd(),
  reviewMapPath = path.join(rootDir, 'config', 'plex-review.json'),
} = {}) {
  let text;

  try {
    text = await fs.readFile(reviewMapPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultReviewMap;
    }

    throw new CatalogBuildError(
      `Unable to read Plex review map ${reviewMapPath}: ${error.message}`,
    );
  }

  try {
    return validatePlexReviewMap(JSON.parse(text));
  } catch (error) {
    if (error instanceof CatalogBuildError) {
      throw error;
    }

    throw new CatalogBuildError(
      `Invalid Plex review map JSON at ${reviewMapPath}: ${error.message}`,
    );
  }
}

export function createPlexReviewLookup(reviewMap = defaultReviewMap) {
  const ignoredRatingKeys = new Set(
    reviewMap.ignoredItems.map((item) => item.plexRatingKey),
  );
  const manualMappingsByRatingKey = new Map(
    reviewMap.manualMappings.map((item) => [item.plexRatingKey, item]),
  );

  return {
    isIgnored(item) {
      return ignoredRatingKeys.has(item.ratingKey);
    },
    getManualMapping(item) {
      return manualMappingsByRatingKey.get(item.ratingKey) ?? null;
    },
  };
}

export function resolvePlexReviewMapItem({
  item,
  nativeCanonicalId,
  reviewLookup,
}) {
  if (reviewLookup.isIgnored(item)) {
    return {
      status: 'ignored',
    };
  }

  const manualMapping = reviewLookup.getManualMapping(item);
  const canonicalId = nativeCanonicalId ?? manualMapping?.canonicalId;

  if (!canonicalId) {
    return {
      status: 'needs-review',
    };
  }

  return {
    status: 'importable',
    canonicalId,
  };
}
