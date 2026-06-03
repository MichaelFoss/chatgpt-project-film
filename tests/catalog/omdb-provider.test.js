import { describe, expect, it } from 'vitest';
import {
  classifyMetadataLookupResult,
  createOmdbProvider,
  extractOmdbImdbId,
  mapOmdbResponse,
  metadataLookupResultCategories,
  parseOmdbGenres,
} from '../../scripts/lib/metadata-providers/index.js';

const braveheartOmdbResponse = {
  Title: 'Braveheart',
  Genre: 'Biography, Drama, War',
  Type: 'movie',
  Plot: 'Scottish warrior William Wallace leads his countrymen.',
  Poster: 'https://example.test/braveheart.jpg',
  Director: 'Mel Gibson',
  Writer: 'Randall Wallace',
  Actors: 'Mel Gibson, Sophie Marceau, Patrick McGoohan',
  Ratings: [
    {
      Source: 'Rotten Tomatoes',
      Value: '74%',
    },
  ],
  Metascore: '68',
  imdbRating: '8.3',
  imdbID: 'tt0112573',
  Response: 'True',
};

describe('omdbProvider', () => {
  it('supports only IMDb canonical IDs', () => {
    const provider = createOmdbProvider();

    expect(provider.id).toBe('omdb');
    expect(provider.supports('imdb:tt0112573')).toBe(true);
    expect(provider.supports('imdb:tt1234567')).toBe(true);
    expect(provider.supports('tmdb:123')).toBe(false);
    expect(provider.supports('imdb:nm0000154')).toBe(false);
    expect(provider.supports('tt0112573')).toBe(false);
  });

  it('extracts IMDb IDs from canonical IDs', () => {
    expect(extractOmdbImdbId('imdb:tt0112573')).toBe('tt0112573');
    expect(extractOmdbImdbId('imdb:tt1234567')).toBe('tt1234567');
    expect(extractOmdbImdbId('imdb:bad')).toBeNull();
  });

  it('parses OMDb genres into arrays', () => {
    expect(parseOmdbGenres('Action, Drama, War')).toEqual([
      'Action',
      'Drama',
      'War',
    ]);
    expect(parseOmdbGenres('N/A')).toEqual([]);
    expect(parseOmdbGenres('')).toEqual([]);
  });

  it('maps a valid OMDb movie lookup into normalized metadata plus raw payload', async () => {
    const fetchCalls = [];
    const provider = createOmdbProvider({
      apiKeyProvider: () => 'test-key',
      fetchImpl: async (url) => {
        fetchCalls.push(url);
        return {
          ok: true,
          status: 200,
          async json() {
            return braveheartOmdbResponse;
          },
        };
      },
    });

    const response = await provider.lookup({
      canonicalId: 'imdb:tt0112573',
    });
    const record = provider.toMetadataRecord({
      canonicalId: 'imdb:tt0112573',
      response,
      fetchedAt: '2026-05-30T12:00:00.000Z',
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].protocol).toBe('https:');
    expect(fetchCalls[0].hostname).toBe('www.omdbapi.com');
    expect(fetchCalls[0].searchParams.get('i')).toBe('tt0112573');
    expect(fetchCalls[0].searchParams.has('apikey')).toBe(true);
    expect(record).toMatchObject({
      canonicalId: 'imdb:tt0112573',
      provider: 'omdb',
      isValid: true,
      lastUpdatedAt: '2026-05-30T12:00:00.000Z',
      provenance: {
        source: 'provider-lookup',
        provider: 'omdb',
        lookupKey: 'tt0112573',
      },
      metadata: {
        mediaType: 'movie',
        title: 'Braveheart',
        genres: ['Biography', 'Drama', 'War'],
        omdb: braveheartOmdbResponse,
      },
    });
    expect(response.status).toBe(metadataLookupResultCategories.found);
    expect(response.metadata.omdb).toEqual(braveheartOmdbResponse);
    expect(classifyMetadataLookupResult(response).category).toBe(
      metadataLookupResultCategories.found,
    );
  });

  it('rejects unsupported OMDb media types as invalid metadata', () => {
    const result = mapOmdbResponse({
      canonicalId: 'imdb:tt0112573',
      lookupKey: 'tt0112573',
      response: {
        ...braveheartOmdbResponse,
        Type: 'episode',
      },
    });

    expect(result.status).toBe(
      metadataLookupResultCategories.invalidResponse,
    );
    expect(result.error.message).toBe(
      'Unsupported OMDb media type: episode.',
    );
  });

  it('treats OMDb not found responses as not-found provider results', () => {
    const result = mapOmdbResponse({
      canonicalId: 'imdb:tt0000000',
      lookupKey: 'tt0000000',
      response: {
        Response: 'False',
        Error: 'Movie not found!',
      },
    });

    expect(result).toMatchObject({
      provider: 'omdb',
      canonicalId: 'imdb:tt0000000',
      lookupKey: 'tt0000000',
      status: metadataLookupResultCategories.notFound,
      error: {
        source: 'provider',
        message: 'Movie not found!',
      },
    });
  });

  it('reports missing API key without calling fetch', async () => {
    const fetchCalls = [];
    const provider = createOmdbProvider({
      apiKeyProvider: () => undefined,
      fetchImpl: async (url) => {
        fetchCalls.push(url);
      },
    });

    const response = await provider.lookup({
      canonicalId: 'imdb:tt0112573',
    });

    expect(fetchCalls).toEqual([]);
    expect(response).toMatchObject({
      provider: 'omdb',
      canonicalId: 'imdb:tt0112573',
      lookupKey: 'tt0112573',
      status: metadataLookupResultCategories.permanentFailure,
      error: {
        source: 'application',
        message: 'OMDB_API_KEY is not configured.',
      },
    });
  });

  it('rejects unsupported canonical IDs cleanly without calling fetch', async () => {
    const fetchCalls = [];
    const provider = createOmdbProvider({
      apiKeyProvider: () => 'test-key',
      fetchImpl: async (url) => {
        fetchCalls.push(url);
      },
    });

    const response = await provider.lookup({
      canonicalId: 'tmdb:603',
    });

    expect(fetchCalls).toEqual([]);
    expect(response).toMatchObject({
      provider: 'omdb',
      canonicalId: 'tmdb:603',
      lookupKey: null,
      status: metadataLookupResultCategories.permanentFailure,
      error: {
        source: 'application',
        message: 'Unsupported canonical ID for OMDb: tmdb:603.',
      },
    });
  });

  it('maps malformed JSON responses to invalid-response', async () => {
    const provider = createOmdbProvider({
      apiKeyProvider: () => 'test-key',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new Error('Unexpected token');
        },
      }),
    });

    const response = await provider.lookup({
      canonicalId: 'imdb:tt0112573',
    });

    expect(response).toMatchObject({
      status: metadataLookupResultCategories.invalidResponse,
      error: {
        source: 'provider',
        message: 'Unable to parse OMDb response JSON: Unexpected token',
      },
    });
  });

  it('maps transport failures to retryable-failure', async () => {
    const provider = createOmdbProvider({
      apiKeyProvider: () => 'test-key',
      fetchImpl: async () => {
        throw new Error('socket closed');
      },
    });

    const response = await provider.lookup({
      canonicalId: 'imdb:tt0112573',
    });

    expect(response).toMatchObject({
      status: metadataLookupResultCategories.retryableFailure,
      error: {
        source: 'transport',
        message: 'OMDb transport failure: socket closed',
      },
    });
  });

  it('maps configured timeout failures to timed-out', async () => {
    const provider = createOmdbProvider({
      apiKeyProvider: () => 'test-key',
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    });

    const response = await provider.lookup({
      canonicalId: 'imdb:tt0112573',
      timeoutMs: 1,
    });

    expect(response).toMatchObject({
      status: metadataLookupResultCategories.timedOut,
      error: {
        source: 'transport',
        message: 'OMDb request exceeded configured timeout.',
      },
    });
  });

  it('maps HTTP 429 responses to rate-limited', async () => {
    const provider = createOmdbProvider({
      apiKeyProvider: () => 'test-key',
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        headers: {
          get(name) {
            return name === 'Retry-After' ? '60' : undefined;
          },
        },
      }),
    });

    const response = await provider.lookup({
      canonicalId: 'imdb:tt0112573',
    });

    expect(response).toMatchObject({
      status: metadataLookupResultCategories.rateLimited,
      error: {
        source: 'transport',
        message: 'OMDb request failed with status 429.',
        statusCode: 429,
        retryAfterSeconds: 60,
      },
    });
  });
});
