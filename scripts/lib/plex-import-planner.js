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

export async function planPlexPlanningItems({ client }) {
  const movieSummaries = await client.fetchMovieSummaries();
  const plannedItems = [];
  const needsReviewItems = [];

  for (const summary of movieSummaries) {
    const metadata = await client.fetchMovieMetadata(summary.ratingKey);
    const planningResult = createPlexPlanningItem(metadata);

    if (planningResult.status === 'importable') {
      plannedItems.push(planningResult.item);
    } else {
      needsReviewItems.push(planningResult.item);
    }
  }

  return {
    moviesScanned: movieSummaries.length,
    plannedItems,
    needsReviewItems,
  };
}
