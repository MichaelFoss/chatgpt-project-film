import { importCatalogItems } from './catalog-importer.js';

const imdbGuidPattern = /^imdb:\/\/(tt\d{7,})$/;

function compactYear(item) {
  return item.year === null ? {} : { year: item.year };
}

export function extractImdbIdFromPlexGuids(guids = []) {
  if (!Array.isArray(guids)) {
    return null;
  }

  for (const guid of guids) {
    if (typeof guid !== 'string') {
      continue;
    }

    const match = guid.match(imdbGuidPattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

export function createPlexNeedsReviewItem(item, reason) {
  return {
    title: item.title,
    ...compactYear(item),
    plexRatingKey: item.ratingKey,
    reason,
  };
}

export function createPlexPlanningItem(item) {
  const canonicalId = extractImdbIdFromPlexGuids(item.guids);

  if (!canonicalId) {
    return {
      status: 'needs-review',
      item: createPlexNeedsReviewItem(item, 'Missing IMDb identifier'),
    };
  }

  return {
    status: 'importable',
    item: {
      canonicalId,
      source: 'plex',
      title: item.title,
      ...compactYear(item),
      plexRatingKey: item.ratingKey,
    },
  };
}

function toCatalogCanonicalId(canonicalId) {
  return canonicalId.startsWith('imdb:')
    ? canonicalId
    : `imdb:${canonicalId}`;
}

export async function planPlexPlanningItems({
  client,
  rootDir = process.cwd(),
  eventsPath,
  now,
}) {
  const movieSummaries = await client.fetchMovieSummaries();
  const importableItems = [];
  const needsReviewItems = [];

  for (const summary of movieSummaries) {
    const metadata = await client.fetchMovieMetadata(summary.ratingKey);
    const planningResult = createPlexPlanningItem(metadata);

    if (planningResult.status === 'importable') {
      importableItems.push(planningResult.item);
    } else {
      needsReviewItems.push(planningResult.item);
    }
  }

  const importReport = await importCatalogItems({
    rootDir,
    eventsPath,
    mode: 'plan',
    now,
    items: importableItems.map((item) => ({
      canonicalId: toCatalogCanonicalId(item.canonicalId),
      source: item.source,
    })),
  });
  const alreadyRepresentedIndexes = new Set(
    importReport.alreadyExistingCatalogItems.map(
      ({ index }) => index - 1,
    ),
  );
  const duplicateIndexes = new Set(
    importReport.duplicateInputItems.map(({ index }) => index - 1),
  );

  return {
    moviesScanned: movieSummaries.length,
    plannedItems: importableItems.filter(
      (_item, index) =>
        !alreadyRepresentedIndexes.has(index) &&
        !duplicateIndexes.has(index),
    ),
    needsReviewItems,
    alreadyRepresentedItems: importableItems.filter((item, index) =>
      alreadyRepresentedIndexes.has(index),
    ),
  };
}
