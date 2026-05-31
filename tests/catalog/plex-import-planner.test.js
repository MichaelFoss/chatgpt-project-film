import { describe, expect, it } from 'vitest';
import {
  createPlexPlanningItem,
  extractImdbIdFromPlexGuids,
  planPlexPlanningItems,
} from '../../scripts/lib/plex-import-planner.js';

describe('Plex import planner', () => {
  it('extracts IMDb IDs only from exact Plex IMDb GUIDs', () => {
    expect(
      extractImdbIdFromPlexGuids([
        'tmdb://603',
        'imdb://tt0133093',
        'tvdb://123',
      ]),
    ).toBe('tt0133093');

    expect(extractImdbIdFromPlexGuids(['imdb://tt1234567'])).toBe(
      'tt1234567',
    );

    expect(
      extractImdbIdFromPlexGuids([
        'tmdb://269795',
        'tvdb://1864',
        'plex://movie/5d77683f54f42c001f8c470e',
        'tt1131724',
        'imdb://tt123456',
        'imdb://nm0000001',
        'IMDB://tt1131724',
        'imdb://tt1131724?lang=en',
      ]),
    ).toBeNull();
  });

  it('creates minimal importable Plex planning items', () => {
    expect(
      createPlexPlanningItem({
        ratingKey: '1234',
        title: 'Example Movie',
        type: 'movie',
        year: 2020,
        guids: ['imdb://tt1234567', 'tmdb://100'],
        raw: { ignored: true },
      }),
    ).toEqual({
      status: 'importable',
      item: {
        canonicalId: 'tt1234567',
        source: 'plex',
        title: 'Example Movie',
        year: 2020,
        plexRatingKey: '1234',
      },
    });
  });

  it('creates needs-review items when IMDb IDs are missing', () => {
    expect(
      createPlexPlanningItem({
        ratingKey: '1718',
        title: 'Family Guy Presents: Blue Harvest',
        type: 'movie',
        year: 2007,
        guids: ['tmdb://65334', 'tvdb://1234'],
      }),
    ).toEqual({
      status: 'needs-review',
      item: {
        title: 'Family Guy Presents: Blue Harvest',
        year: 2007,
        plexRatingKey: '1718',
        reason: 'Missing IMDb identifier',
      },
    });
  });

  it('fetches full metadata for every Plex movie summary', async () => {
    const requestedRatingKeys = [];
    const report = await planPlexPlanningItems({
      client: {
        async fetchMovieSummaries() {
          return [
            { ratingKey: '100', title: 'Braveheart', year: 1995 },
            {
              ratingKey: '1718',
              title: 'Family Guy Presents: Blue Harvest',
              year: 2007,
            },
          ];
        },
        async fetchMovieMetadata(ratingKey) {
          requestedRatingKeys.push(ratingKey);

          if (ratingKey === '100') {
            return {
              ratingKey: '100',
              title: 'Braveheart',
              type: 'movie',
              year: 1995,
              guids: ['imdb://tt0112573'],
            };
          }

          return {
            ratingKey: '1718',
            title: 'Family Guy Presents: Blue Harvest',
            type: 'movie',
            year: 2007,
            guids: ['tmdb://65334'],
          };
        },
      },
    });

    expect(requestedRatingKeys).toEqual(['100', '1718']);
    expect(report).toEqual({
      moviesScanned: 2,
      plannedItems: [
        {
          canonicalId: 'tt0112573',
          source: 'plex',
          title: 'Braveheart',
          year: 1995,
          plexRatingKey: '100',
        },
      ],
      needsReviewItems: [
        {
          title: 'Family Guy Presents: Blue Harvest',
          year: 2007,
          plexRatingKey: '1718',
          reason: 'Missing IMDb identifier',
        },
      ],
    });
  });
});
