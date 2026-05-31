import { CatalogBuildError } from './catalog-build-error.js';

function normalizeString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function normalizeYear(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const year = Number(value);
  return Number.isInteger(year) ? year : null;
}

function createPlexUrl({ plexUrl, path }) {
  const base = plexUrl.endsWith('/') ? plexUrl : `${plexUrl}/`;
  return new URL(path.replace(/^\//, ''), base);
}

function assertObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogBuildError(message);
  }

  return value;
}

function getMetadataArray(response, message) {
  const container = assertObject(
    assertObject(response, message).MediaContainer,
    message,
  );

  if (!Array.isArray(container.Metadata)) {
    throw new CatalogBuildError(message);
  }

  return container.Metadata;
}

function getDirectoryArray(response, message) {
  const container = assertObject(
    assertObject(response, message).MediaContainer,
    message,
  );

  if (!Array.isArray(container.Directory)) {
    throw new CatalogBuildError(message);
  }

  return container.Directory;
}

function mapMovieSummary(item) {
  assertObject(item, 'Plex movie summary is not usable.');

  const ratingKey = normalizeString(item.ratingKey);
  const title = normalizeString(item.title);

  if (!ratingKey || !title) {
    throw new CatalogBuildError(
      'Plex movie summary is missing ratingKey or title.',
    );
  }

  return {
    ratingKey,
    title,
    year: normalizeYear(item.year),
  };
}

function mapMovieMetadata(item) {
  const summary = mapMovieSummary(item);

  if (normalizeString(item.type) !== 'movie') {
    throw new CatalogBuildError(
      `Plex metadata ratingKey ${summary.ratingKey} is not a movie.`,
    );
  }

  return {
    ...summary,
    type: 'movie',
    guids: Array.isArray(item.Guid)
      ? item.Guid.map((guid) => normalizeString(guid?.id)).filter(
          Boolean,
        )
      : [],
    raw: item,
  };
}

export function createPlexClient({
  plexUrl,
  plexToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedUrl = normalizeString(plexUrl);
  const normalizedToken = normalizeString(plexToken);

  if (!normalizedUrl || !normalizedToken) {
    throw new CatalogBuildError(
      'PLEX_URL and PLEX_TOKEN are required to create a Plex client.',
    );
  }

  if (typeof fetchImpl !== 'function') {
    throw new CatalogBuildError('A fetch implementation is required.');
  }

  async function requestJson(path) {
    const url = createPlexUrl({ plexUrl: normalizedUrl, path });

    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': normalizedToken,
        },
      });
    } catch (error) {
      throw new CatalogBuildError(
        `Unable to reach Plex server: ${error.message}`,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new CatalogBuildError(
        `Plex authentication failed with status ${response.status}.`,
      );
    }

    if (!response.ok) {
      throw new CatalogBuildError(
        `Plex request failed with status ${response.status}.`,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new CatalogBuildError(
        `Plex response was not usable JSON: ${error.message}`,
      );
    }
  }

  async function getMovieLibrarySection() {
    const directories = getDirectoryArray(
      await requestJson('/library/sections'),
      'Plex library sections response is not usable.',
    );
    const movieSections = directories.filter((directory) => {
      return normalizeString(directory?.type) === 'movie';
    });

    if (movieSections.length === 0) {
      throw new CatalogBuildError(
        'Plex has no movie library sections.',
      );
    }

    const namedMoviesSection = movieSections.find((directory) => {
      return normalizeString(directory?.title) === 'Movies';
    });
    const selectedSection =
      namedMoviesSection ??
      (movieSections.length === 1 ? movieSections[0] : null);
    const key = normalizeString(selectedSection?.key);

    if (!key) {
      throw new CatalogBuildError(
        'Plex movie library section is ambiguous or missing a key.',
      );
    }

    return {
      key,
      title: normalizeString(selectedSection.title) ?? 'Movies',
    };
  }

  async function fetchMovieSummaries() {
    const section = await getMovieLibrarySection();
    const metadata = getMetadataArray(
      await requestJson(`/library/sections/${section.key}/all`),
      'Plex movie summaries response is not usable.',
    );

    return metadata.map(mapMovieSummary);
  }

  async function fetchMovieMetadata(ratingKey) {
    const normalizedRatingKey = normalizeString(ratingKey);

    if (!normalizedRatingKey) {
      throw new CatalogBuildError('Plex ratingKey is required.');
    }

    const metadata = getMetadataArray(
      await requestJson(`/library/metadata/${normalizedRatingKey}`),
      'Plex movie metadata response is not usable.',
    );

    if (metadata.length !== 1) {
      throw new CatalogBuildError(
        `Plex metadata response for ratingKey ${normalizedRatingKey} must contain exactly one item.`,
      );
    }

    return mapMovieMetadata(metadata[0]);
  }

  return {
    fetchMovieMetadata,
    fetchMovieSummaries,
    getMovieLibrarySection,
  };
}
