import {
  createMetadataLookupResult,
  metadataLookupResultCategories,
} from './provider-contract.js';

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
  metadata,
  error,
}) {
  return createMetadataLookupResult({
    provider: 'omdb',
    canonicalId,
    lookupKey,
    status,
    metadata,
    error,
  });
}

function isOmdbNotFoundError(message) {
  return /not found/i.test(message ?? '');
}

function isOmdbRateLimitError(message) {
  return /limit|rate|too many/i.test(message ?? '');
}

function normalizeOmdbMetadata(response) {
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
  metadata.genres = parseOmdbGenres(response.Genre);
  return metadata;
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
      status: metadataLookupResultCategories.invalidResponse,
      error: {
        source: 'provider',
        message: 'OMDb response must be a JSON object.',
      },
    });
  }

  const title = normalizeString(response.Title);
  const mediaType = mapOmdbMediaType(response.Type);

  if (response.Response !== 'True') {
    const message = response.Error ?? 'OMDb response is not usable.';
    const status = isOmdbNotFoundError(message)
      ? metadataLookupResultCategories.notFound
      : isOmdbRateLimitError(message)
        ? metadataLookupResultCategories.rateLimited
        : metadataLookupResultCategories.invalidResponse;

    return createProviderResult({
      canonicalId,
      lookupKey,
      status,
      error: {
        source: 'provider',
        message,
      },
    });
  }

  if (!title || !mediaType) {
    return createProviderResult({
      canonicalId,
      lookupKey,
      status: metadataLookupResultCategories.invalidResponse,
      error: {
        source: 'provider',
        message: !title
          ? 'OMDb response is missing required title.'
          : `Unsupported OMDb media type: ${response.Type}.`,
      },
    });
  }

  return createProviderResult({
    canonicalId,
    lookupKey,
    status: metadataLookupResultCategories.found,
    metadata: normalizeOmdbMetadata(response),
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

  if (result.status !== metadataLookupResultCategories.found) {
    return {
      canonicalId,
      provider: 'omdb',
      isValid: false,
      lastUpdatedAt: fetchedAt,
      provenance,
      request: {
        retryAttemptsCount: 0,
        error: result.error,
      },
    };
  }

  return {
    canonicalId,
    provider: 'omdb',
    isValid: true,
    lastUpdatedAt: fetchedAt,
    provenance,
    metadata: result.metadata,
  };
}

function createTimeoutSignal(timeoutMs) {
  if (timeoutMs === undefined || timeoutMs === null) {
    return {};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return { controller, signal: controller.signal, timeout };
}

function parseRetryAfterSeconds(response) {
  const value = response.headers?.get?.('Retry-After');

  if (!value || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  return Number(value);
}

function classifyHttpFailure(response) {
  if (response.status === 429) {
    return metadataLookupResultCategories.rateLimited;
  }

  if ([408, 500, 502, 503, 504].includes(response.status)) {
    return metadataLookupResultCategories.retryableFailure;
  }

  return metadataLookupResultCategories.permanentFailure;
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

    async lookup({ canonicalId, timeoutMs } = {}) {
      const lookupKey = extractOmdbImdbId(canonicalId);

      if (!lookupKey) {
        return createProviderResult({
          canonicalId,
          lookupKey,
          status: metadataLookupResultCategories.permanentFailure,
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
          status: metadataLookupResultCategories.permanentFailure,
          error: {
            source: 'application',
            message: 'OMDB_API_KEY is not configured.',
          },
        });
      }

      const url = new URL('https://www.omdbapi.com/');
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('i', lookupKey);

      const { signal, timeout } = createTimeoutSignal(timeoutMs);

      try {
        const response = await fetchImpl(url, { signal });

        if (!response.ok) {
          const status = classifyHttpFailure(response);

          return createProviderResult({
            canonicalId,
            lookupKey,
            status,
            error: {
              source: 'transport',
              message: `OMDb request failed with status ${response.status}.`,
              statusCode: response.status,
              retryAfterSeconds:
                status === metadataLookupResultCategories.rateLimited
                  ? parseRetryAfterSeconds(response)
                  : undefined,
            },
          });
        }

        let payload;

        try {
          payload = await response.json();
        } catch (error) {
          return createProviderResult({
            canonicalId,
            lookupKey,
            status: metadataLookupResultCategories.invalidResponse,
            error: {
              source: 'provider',
              message: `Unable to parse OMDb response JSON: ${error.message}`,
            },
          });
        }

        return mapOmdbResponse({
          canonicalId,
          lookupKey,
          response: payload,
        });
      } catch (error) {
        const timedOut =
          error?.name === 'AbortError' ||
          error?.name === 'TimeoutError';

        return createProviderResult({
          canonicalId,
          lookupKey,
          status: timedOut
            ? metadataLookupResultCategories.timedOut
            : metadataLookupResultCategories.retryableFailure,
          error: {
            source: 'transport',
            message: timedOut
              ? 'OMDb request exceeded configured timeout.'
              : `OMDb transport failure: ${error.message}`,
          },
        });
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
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
