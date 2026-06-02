import {
  createMetadataLookupResult,
  metadataLookupResultCategories,
} from './provider-contract.js';

const defaultFixtureEntries = [
  [
    'imdb:tt0112573',
    {
      status: metadataLookupResultCategories.found,
      lookupKey: 'tt0112573',
      metadata: {
        mediaType: 'movie',
        title: 'Mock Fixture: Braveheart',
        genres: ['Biography', 'Drama'],
      },
    },
  ],
  [
    'mock:not-found',
    {
      status: metadataLookupResultCategories.notFound,
      error: {
        source: 'provider',
        message: 'Mock fixture was not found.',
      },
    },
  ],
  [
    'mock:invalid-response',
    {
      status: metadataLookupResultCategories.invalidResponse,
      error: {
        source: 'provider',
        message: 'Mock fixture returned invalid metadata.',
      },
    },
  ],
  [
    'mock:retryable-failure',
    {
      status: metadataLookupResultCategories.retryableFailure,
      error: {
        source: 'transport',
        message: 'Mock fixture retryable failure.',
        statusCode: 503,
      },
    },
  ],
  [
    'mock:permanent-failure',
    {
      status: metadataLookupResultCategories.permanentFailure,
      error: {
        source: 'provider',
        message: 'Mock fixture permanent failure.',
      },
    },
  ],
  [
    'mock:rate-limited',
    {
      status: metadataLookupResultCategories.rateLimited,
      error: {
        source: 'transport',
        message: 'Mock fixture rate limited.',
        statusCode: 429,
        retryAfterSeconds: 60,
      },
    },
  ],
  [
    'mock:timed-out',
    {
      status: metadataLookupResultCategories.timedOut,
      error: {
        source: 'transport',
        message: 'Mock fixture timed out.',
      },
    },
  ],
];

export const mockMetadataFixtures = new Map(defaultFixtureEntries);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createTimedOutResult(canonicalId, lookupKey) {
  return createMetadataLookupResult({
    provider: 'mock',
    canonicalId,
    lookupKey,
    status: metadataLookupResultCategories.timedOut,
    error: {
      source: 'transport',
      message: 'Mock lookup exceeded configured timeout.',
    },
  });
}

function normalizeFixtures(fixtures) {
  if (fixtures instanceof Map) {
    return new Map(fixtures);
  }

  return new Map(Object.entries(fixtures));
}

export function createMockMetadataProvider({
  fixtures = mockMetadataFixtures,
  delayMs = 0,
} = {}) {
  const fixtureMap = normalizeFixtures(fixtures);

  return {
    id: 'mock',

    supports(canonicalId) {
      return fixtureMap.has(canonicalId);
    },

    async lookup({
      canonicalId,
      delayMs: lookupDelayMs,
      timeoutMs,
    } = {}) {
      const fixture = fixtureMap.get(canonicalId);
      const effectiveDelayMs = lookupDelayMs ?? delayMs;
      const lookupKey = fixture?.lookupKey ?? canonicalId;

      if (timeoutMs !== undefined && effectiveDelayMs > timeoutMs) {
        await sleep(timeoutMs);
        return createTimedOutResult(canonicalId, lookupKey);
      }

      if (effectiveDelayMs > 0) {
        await sleep(effectiveDelayMs);
      }

      if (!fixture) {
        return createMetadataLookupResult({
          provider: 'mock',
          canonicalId,
          lookupKey,
          status: metadataLookupResultCategories.permanentFailure,
          error: {
            source: 'application',
            message: `No mock metadata fixture configured for ${canonicalId}.`,
          },
        });
      }

      return createMetadataLookupResult({
        provider: 'mock',
        canonicalId,
        lookupKey,
        status: fixture.status,
        metadata: fixture.metadata,
        error: fixture.error,
      });
    },
  };
}

export const mockMetadataProvider = createMockMetadataProvider();
