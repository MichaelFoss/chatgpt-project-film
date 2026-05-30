const imdbCanonicalIdPattern = /^imdb:(tt\d{7,})$/;

function normalizeString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

export function extractOmdbImdbId(canonicalId) {
  const match = imdbCanonicalIdPattern.exec(canonicalId);
  return match?.[1] ?? null;
}

export function parseOmdbGenres(value) {
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

function mapOmdbMediaType(type) {
  const normalized = normalizeString(type)?.toLowerCase();

  if (normalized === 'movie') {
    return 'movie';
  }

  if (normalized === 'series') {
    return 'series';
  }

  return null;
}

function splitPeople(value) {
  return parseOmdbGenres(value);
}

function optionalOmdbString(value) {
  const normalized = normalizeString(value);
  return normalized && normalized !== 'N/A' ? normalized : null;
}

function mapOmdbRatings(response) {
  const rottenTomatoesCritics = Array.isArray(response.Ratings)
    ? response.Ratings.find((rating) => {
        return rating?.Source === 'Rotten Tomatoes';
      })?.Value
    : null;

  return {
    imdb: optionalOmdbString(response.imdbRating),
    rottenTomatoes: {
      critics: optionalOmdbString(rottenTomatoesCritics),
    },
    metacritic: optionalOmdbString(response.Metascore),
  };
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

function createProviderResult({
  canonicalId,
  lookupKey,
  status,
  response,
  error,
}) {
  return {
    provider: 'omdb',
    canonicalId,
    lookupKey,
    status,
    response,
    error,
  };
}

export function mapOmdbResponse({ canonicalId, lookupKey, response }) {
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response)
  ) {
    return createProviderResult({
      canonicalId,
      lookupKey,
      status: 'invalid',
      response,
      error: {
        source: 'provider',
        message: 'OMDb response must be a JSON object.',
      },
    });
  }

  const title = normalizeString(response.Title);
  const mediaType = mapOmdbMediaType(response.Type);
  const hasGenre = normalizeString(response.Genre);

  if (response.Response !== 'True' || !title || !hasGenre) {
    return createProviderResult({
      canonicalId,
      lookupKey,
      status: 'invalid',
      response,
      error: {
        source: 'provider',
        message: response.Error ?? 'OMDb response is not usable.',
      },
    });
  }

  if (!mediaType) {
    return createProviderResult({
      canonicalId,
      lookupKey,
      status: 'invalid',
      response,
      error: {
        source: 'provider',
        message: `Unsupported OMDb media type: ${response.Type}.`,
      },
    });
  }

  return createProviderResult({
    canonicalId,
    lookupKey,
    status: 'valid',
    response,
  });
}

export function createOmdbMetadataRecord({
  canonicalId,
  result,
  fetchedAt,
}) {
  const lookupKey = result.lookupKey ?? extractOmdbImdbId(canonicalId);
  const provenance = {
    source: 'provider-lookup',
    provider: 'omdb',
    lookupKey,
  };

  if (result.status !== 'valid') {
    return {
      canonicalId,
      provider: 'omdb',
      isValid: false,
      lastUpdatedAt: fetchedAt,
      provenance,
      metadata: result.response
        ? {
            omdb: result.response,
          }
        : undefined,
      request: {
        retryAttemptsCount: 0,
        error: result.error,
      },
    };
  }

  const { response } = result;
  const metadata = compactObject({
    mediaType: mapOmdbMediaType(response.Type),
    title: normalizeString(response.Title),
    description: optionalOmdbString(response.Plot),
    posterUrl: optionalOmdbString(response.Poster),
    genres: parseOmdbGenres(response.Genre),
    people: compactObject({
      directors: splitPeople(response.Director),
      writers: splitPeople(response.Writer),
      actors: splitPeople(response.Actors),
    }),
    ratings: compactObject(mapOmdbRatings(response)),
    omdb: response,
  });

  return {
    canonicalId,
    provider: 'omdb',
    isValid: true,
    lastUpdatedAt: fetchedAt,
    provenance,
    metadata,
  };
}

export function createOmdbProvider({
  fetchImpl = globalThis.fetch,
  apiKeyProvider = () => process.env.OMDB_API_KEY,
} = {}) {
  return {
    id: 'omdb',

    supports(canonicalId) {
      return extractOmdbImdbId(canonicalId) !== null;
    },

    async lookup({ canonicalId }) {
      const lookupKey = extractOmdbImdbId(canonicalId);

      if (!lookupKey) {
        return createProviderResult({
          canonicalId,
          lookupKey,
          status: 'unsupported',
          error: {
            source: 'application',
            message: `Unsupported canonical ID for OMDb: ${canonicalId}.`,
          },
        });
      }

      const apiKey = normalizeString(apiKeyProvider());

      if (!apiKey) {
        return createProviderResult({
          canonicalId,
          lookupKey,
          status: 'unavailable',
          error: {
            source: 'application',
            message: 'OMDB_API_KEY is not configured.',
          },
        });
      }

      const url = new URL('https://www.omdbapi.com/');
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('i', lookupKey);

      const response = await fetchImpl(url);

      if (!response.ok) {
        return createProviderResult({
          canonicalId,
          lookupKey,
          status: 'invalid',
          error: {
            source: 'transport',
            message: `OMDb request failed with status ${response.status}.`,
            statusCode: response.status,
          },
        });
      }

      return mapOmdbResponse({
        canonicalId,
        lookupKey,
        response: await response.json(),
      });
    },

    toMetadataRecord({ canonicalId, response, fetchedAt }) {
      return createOmdbMetadataRecord({
        canonicalId,
        result: response,
        fetchedAt,
      });
    },
  };
}

export const omdbProvider = createOmdbProvider();
