import { describe, expect, it } from 'vitest';
import {
  createOmdbProvider,
  extractOmdbImdbId,
  mapOmdbResponse,
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
    expect(fetchCalls[0].toString()).toBe(
      'https://www.omdbapi.com/?apikey=test-key&i=tt0112573',
    );
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

    expect(result.status).toBe('invalid');
    expect(result.error.message).toBe(
      'Unsupported OMDb media type: episode.',
    );
  });

  it('treats OMDb not found responses as invalid provider results', () => {
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
      status: 'invalid',
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
      status: 'unavailable',
      error: {
        source: 'application',
        message: 'OMDB_API_KEY is not configured.',
      },
    });
  });
});
