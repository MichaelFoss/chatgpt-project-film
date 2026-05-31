import { describe, expect, it } from 'vitest';
import { createPlexClient } from '../../scripts/lib/plex-client.js';

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

describe('plexClient', () => {
  it('fetches movie summaries from the Movies library', async () => {
    const requests = [];
    const client = createPlexClient({
      plexUrl: 'http://plex.test:32400',
      plexToken: 'token',
      fetchImpl: async (url, options) => {
        requests.push({ url: url.toString(), options });

        if (url.pathname === '/library/sections') {
          return jsonResponse({
            MediaContainer: {
              Directory: [
                { key: '1', title: 'TV Shows', type: 'show' },
                { key: '2', title: 'Movies', type: 'movie' },
              ],
            },
          });
        }

        return jsonResponse({
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '100',
                title: 'Braveheart',
                type: 'movie',
                year: 1995,
              },
            ],
          },
        });
      },
    });

    await expect(client.fetchMovieSummaries()).resolves.toEqual([
      {
        ratingKey: '100',
        title: 'Braveheart',
        year: 1995,
      },
    ]);

    expect(requests.map((request) => request.url)).toEqual([
      'http://plex.test:32400/library/sections',
      'http://plex.test:32400/library/sections/2/all',
    ]);
    expect(requests[0].options.headers).toMatchObject({
      Accept: 'application/json',
      'X-Plex-Token': 'token',
    });
  });

  it('fetches full movie metadata by ratingKey and preserves raw metadata', async () => {
    const rawMetadata = {
      ratingKey: '100',
      title: 'Braveheart',
      type: 'movie',
      year: '1995',
      Guid: [{ id: 'imdb://tt0112573' }, { id: 'tmdb://197' }],
    };
    const client = createPlexClient({
      plexUrl: 'http://plex.test:32400',
      plexToken: 'token',
      fetchImpl: async () =>
        jsonResponse({
          MediaContainer: {
            Metadata: [rawMetadata],
          },
        }),
    });

    await expect(client.fetchMovieMetadata('100')).resolves.toEqual({
      ratingKey: '100',
      title: 'Braveheart',
      type: 'movie',
      year: 1995,
      guids: ['imdb://tt0112573', 'tmdb://197'],
      raw: rawMetadata,
    });
  });

  it('fails fast when Plex cannot be reached', async () => {
    const client = createPlexClient({
      plexUrl: 'http://plex.test:32400',
      plexToken: 'token',
      fetchImpl: async () => {
        throw new Error('connection refused');
      },
    });

    await expect(client.fetchMovieSummaries()).rejects.toThrow(
      'Unable to reach Plex server: connection refused',
    );
  });

  it('fails fast on Plex authentication failure', async () => {
    const client = createPlexClient({
      plexUrl: 'http://plex.test:32400',
      plexToken: 'bad-token',
      fetchImpl: async () => jsonResponse({}, { status: 401 }),
    });

    await expect(client.fetchMovieSummaries()).rejects.toThrow(
      'Plex authentication failed with status 401.',
    );
  });

  it('fails fast on unusable movie summary response shapes', async () => {
    const client = createPlexClient({
      plexUrl: 'http://plex.test:32400',
      plexToken: 'token',
      fetchImpl: async (url) => {
        if (url.pathname === '/library/sections') {
          return jsonResponse({
            MediaContainer: {
              Directory: [{ key: '2', title: 'Movies', type: 'movie' }],
            },
          });
        }

        return jsonResponse({
          MediaContainer: {
            Metadata: [{ title: 'Missing Rating Key' }],
          },
        });
      },
    });

    await expect(client.fetchMovieSummaries()).rejects.toThrow(
      'Plex movie summary is missing ratingKey or title.',
    );
  });

  it('fails fast on malformed metadata rows', async () => {
    const client = createPlexClient({
      plexUrl: 'http://plex.test:32400',
      plexToken: 'token',
      fetchImpl: async () =>
        jsonResponse({
          MediaContainer: {
            Metadata: [null],
          },
        }),
    });

    await expect(client.fetchMovieMetadata('100')).rejects.toThrow(
      'Plex movie summary is not usable.',
    );
  });
});
