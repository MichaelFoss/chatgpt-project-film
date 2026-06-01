import { importCatalogItems } from './catalog-importer.js';
import {
  createPlexReviewLookup,
  readPlexReviewMap,
  resolvePlexReviewMapItem,
} from './plex-review-map.js';

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

export function createPlexPlanningItemWithReviewMap(
  item,
  reviewLookup,
) {
  const nativeCanonicalId = extractImdbIdFromPlexGuids(item.guids);
  const reviewDecision = resolvePlexReviewMapItem({
    item,
    nativeCanonicalId,
    reviewLookup,
  });

  if (reviewDecision.status === 'ignored') {
    return {
      status: 'ignored',
      item: null,
    };
  }

  if (reviewDecision.status === 'needs-review') {
    return {
      status: 'needs-review',
      item: createPlexNeedsReviewItem(item, 'Missing IMDb identifier'),
    };
  }

  return {
    status: 'importable',
    item: {
      canonicalId: reviewDecision.canonicalId,
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
  reviewMap,
  reviewMapPath,
}) {
  const resolvedReviewMap =
    reviewMap ?? (await readPlexReviewMap({ rootDir, reviewMapPath }));
  const reviewLookup = createPlexReviewLookup(resolvedReviewMap);
  const movieSummaries = await client.fetchMovieSummaries();
  const importableItems = [];
  const needsReviewItems = [];

  for (const summary of movieSummaries) {
    const metadata = await client.fetchMovieMetadata(summary.ratingKey);
    const planningResult = createPlexPlanningItemWithReviewMap(
      metadata,
      reviewLookup,
    );

    if (planningResult.status === 'importable') {
      importableItems.push(planningResult.item);
    } else if (planningResult.status === 'needs-review') {
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
