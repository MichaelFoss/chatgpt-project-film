import fs from 'node:fs/promises';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';

const supportedMediaTypes = new Set(['movie', 'series']);

function normalizeString(value) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null) {
        return false;
      }

      if (Array.isArray(item)) {
        return item.length > 0;
      }

      if (typeof item === 'object') {
        return Object.keys(item).length > 0;
      }

      return true;
    }),
  );
}

function compactCatalogItem(value) {
  const compacted = compactObject(value);
  compacted.genres = value.genres;
  return compacted;
}

function splitPeople(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }

  const normalized = normalizeString(value);

  if (!normalized || normalized === 'N/A') {
    return [];
  }

  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== 'N/A');
}

function normalizeGenres(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }

  const normalized = normalizeString(value);

  if (!normalized || normalized === 'N/A') {
    return [];
  }

  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== 'N/A');
}

function normalizeMediaType(value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();

  if (lower === 'movie') {
    return 'movie';
  }

  if (lower === 'series') {
    return 'series';
  }

  return null;
}

function optionalProviderString(value) {
  const normalized = normalizeString(value);

  if (!normalized || normalized === 'N/A') {
    return null;
  }

  return normalized;
}

export async function loadMetadataCache(metadataCachePath) {
  let text;

  try {
    text = await fs.readFile(metadataCachePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { cache: {}, missingFile: true };
    }

    throw new CatalogBuildError(
      `Unable to read metadata cache at ${metadataCachePath}: ${error.message}`,
    );
  }

  try {
    const cache = JSON.parse(text);

    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) {
      throw new Error('metadata cache must be a JSON object');
    }

    return { cache, missingFile: false };
  } catch (error) {
    throw new CatalogBuildError(
      `Invalid metadata cache JSON at ${metadataCachePath}: ${error.message}`,
    );
  }
}

function mapNormalizedMetadata(canonicalId, metadata) {
  const title = normalizeString(metadata.title);
  const mediaType = normalizeMediaType(metadata.mediaType);

  if (!title || !mediaType) {
    return null;
  }

  const people = compactObject({
    directors: splitPeople(metadata.people?.directors),
    writers: splitPeople(metadata.people?.writers),
    actors: splitPeople(metadata.people?.actors),
  });

  const ratings = compactObject({
    imdb: optionalProviderString(metadata.ratings?.imdb),
    rottenTomatoes: compactObject({
      critics: optionalProviderString(
        metadata.ratings?.rottenTomatoes?.critics,
      ),
      audience: optionalProviderString(
        metadata.ratings?.rottenTomatoes?.audience,
      ),
    }),
    metacritic: optionalProviderString(metadata.ratings?.metacritic),
  });

  return compactCatalogItem({
    canonicalId,
    mediaType,
    title,
    description: optionalProviderString(metadata.description),
    posterUrl: optionalProviderString(metadata.posterUrl),
    genres: normalizeGenres(metadata.genres),
    people,
    ratings,
  });
}

export function mapMetadataRecord(canonicalId, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }

  if (record.canonicalId !== canonicalId || record.isValid !== true) {
    return null;
  }

  const metadata = record.metadata;

  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return null;
  }

  const mapped = mapNormalizedMetadata(canonicalId, metadata);

  if (
    !mapped ||
    !isNonEmptyString(mapped.canonicalId) ||
    !supportedMediaTypes.has(mapped.mediaType) ||
    !isNonEmptyString(mapped.title) ||
    !Array.isArray(mapped.genres)
  ) {
    return null;
  }

  return mapped;
}

export function generateCatalog(catalogIds, metadataCache) {
  const missingMetadata = [];
  const invalidMetadata = [];
  const catalog = {};

  for (const canonicalId of [...catalogIds].sort()) {
    const record = metadataCache[canonicalId];

    if (!record) {
      missingMetadata.push(canonicalId);
      continue;
    }

    const item = mapMetadataRecord(canonicalId, record);

    if (!item) {
      invalidMetadata.push(canonicalId);
      continue;
    }

    catalog[canonicalId] = item;
  }

  return {
    catalog,
    missingMetadata,
    invalidMetadata,
  };
}
