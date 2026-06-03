import { describe, expect, it } from 'vitest';
import {
  classifyMetadataLookupResult,
  createMetadataLookupResult,
  metadataLookupResultCategories,
  selectMetadataProvider,
} from '../../scripts/lib/metadata-providers/index.js';

function provider(id, supportedPrefix) {
  return {
    id,
    supports(canonicalId) {
      return canonicalId.startsWith(supportedPrefix);
    },
    async lookup() {
      throw new Error('lookup not needed for selection tests');
    },
  };
}

describe('metadata provider contract', () => {
  it('exposes every required lookup result category', () => {
    expect(Object.values(metadataLookupResultCategories)).toEqual([
      'found',
      'not-found',
      'invalid-response',
      'retryable-failure',
      'permanent-failure',
      'rate-limited',
      'timed-out',
    ]);
  });

  it('creates and classifies provider lookup results without secret-bearing fields', () => {
    const result = createMetadataLookupResult({
      provider: 'contract-test',
      canonicalId: 'imdb:tt0112573',
      lookupKey: 'tt0112573',
      status: 'rate-limited',
      response: {
        apiKey: 'raw-response-secret',
        providerRequestUrl:
          'https://provider.example/?apikey=raw-response-secret',
      },
      error: {
        source: 'transport',
        message: 'Too many requests.',
        statusCode: 429,
        retryAfterSeconds: 60,
        apiKey: 'must-not-leak',
      },
    });

    expect(result).not.toHaveProperty('response');
    expect(JSON.stringify(result)).not.toContain('raw-response-secret');
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(result.error).toEqual({
      source: 'transport',
      message: 'Too many requests.',
      statusCode: 429,
      retryAfterSeconds: 60,
    });
    expect(classifyMetadataLookupResult(result)).toEqual({
      category: 'rate-limited',
      detail: {
        provider: 'contract-test',
        canonicalId: 'imdb:tt0112573',
        lookupKey: 'tt0112573',
        error: {
          source: 'transport',
          message: 'Too many requests.',
          statusCode: 429,
          retryAfterSeconds: 60,
        },
      },
    });
    expect(
      JSON.stringify(classifyMetadataLookupResult(result)),
    ).not.toContain('raw-response-secret');
    expect(
      JSON.stringify(classifyMetadataLookupResult(result)),
    ).not.toContain('must-not-leak');
  });

  it.each([
    ['found', 'found'],
    ['not-found', 'not-found'],
    ['invalid-response', 'invalid-response'],
    ['retryable-failure', 'retryable-failure'],
    ['permanent-failure', 'permanent-failure'],
    ['rate-limited', 'rate-limited'],
    ['timed-out', 'timed-out'],
    ['valid', 'found'],
    ['invalid', 'invalid-response'],
    ['unavailable', 'permanent-failure'],
    ['unsupported', 'permanent-failure'],
  ])('classifies %s lookup results as %s', (status, category) => {
    expect(
      classifyMetadataLookupResult({
        provider: 'contract-test',
        canonicalId: 'imdb:tt0112573',
        status,
      }).category,
    ).toBe(category);
  });

  it('selects the first provider that supports a canonical ID', () => {
    const imdbProvider = provider('imdb-provider', 'imdb:');
    const tmdbProvider = provider('tmdb-provider', 'tmdb:');

    expect(
      selectMetadataProvider({
        canonicalId: 'tmdb:603',
        providers: [imdbProvider, tmdbProvider],
      }),
    ).toEqual({
      provider: tmdbProvider,
      reason: 'selected',
    });
  });

  it('honors requested provider IDs before canonical ID support', () => {
    const firstProvider = provider('first', 'imdb:');
    const requestedProvider = provider('requested', 'imdb:');

    expect(
      selectMetadataProvider({
        canonicalId: 'imdb:tt0112573',
        providers: [firstProvider, requestedProvider],
        providerId: 'requested',
      }),
    ).toEqual({
      provider: requestedProvider,
      reason: 'selected',
    });
  });

  it('reports requested provider selection failures', () => {
    const imdbProvider = provider('imdb-provider', 'imdb:');

    expect(
      selectMetadataProvider({
        canonicalId: 'imdb:tt0112573',
        providers: [imdbProvider],
        providerId: 'missing-provider',
      }),
    ).toEqual({
      provider: null,
      reason: 'requested-provider-not-configured',
    });

    expect(
      selectMetadataProvider({
        canonicalId: 'tmdb:603',
        providers: [imdbProvider],
        providerId: 'imdb-provider',
      }),
    ).toEqual({
      provider: null,
      reason: 'requested-provider-does-not-support-id',
    });
  });
});
