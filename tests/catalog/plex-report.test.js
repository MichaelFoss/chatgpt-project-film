import { describe, expect, it } from 'vitest';
import {
  createPlexPlanJsonReport,
  formatPlexPlanJsonReport,
  formatPlexPlanReport,
  parsePlexPlanCliArgs,
} from '../../scripts/lib/plex-report.js';

const sampleReport = {
  moviesScanned: 4,
  plannedItems: [
    {
      canonicalId: 'tt0133093',
      source: 'plex',
      title: 'The Matrix',
      year: 1999,
      plexRatingKey: '200',
    },
    {
      canonicalId: 'tt1234567',
      source: 'plex',
      title: 'No Year Movie',
      plexRatingKey: '201',
    },
  ],
  needsReviewItems: [
    {
      title: 'Family Guy Presents: Blue Harvest',
      year: 2007,
      plexRatingKey: '1718',
      reason: 'Missing IMDb identifier',
    },
    {
      title: 'Untitled Local Extra',
      plexRatingKey: '1719',
      reason: 'Missing IMDb identifier',
    },
  ],
  alreadyRepresentedItems: [
    {
      canonicalId: 'tt0112573',
      source: 'plex',
      title: 'Braveheart',
      year: 1995,
      plexRatingKey: '100',
    },
  ],
};

describe('Plex report formatter', () => {
  it('formats the human Phase 2 planning report', () => {
    expect(formatPlexPlanReport(sampleReport)).toBe(
      [
        'Movies scanned: 4',
        '',
        'Importable: 3',
        'Needs review: 2',
        '',
        'Already represented: 1',
        'Would add: 2',
        '',
        'Would add:',
        '  tt0133093 | The Matrix (1999)',
        '  tt1234567 | No Year Movie',
        '',
        'Needs review:',
        '  Family Guy Presents: Blue Harvest (2007) | ratingKey 1718 | Missing IMDb identifier',
        '  Untitled Local Extra | ratingKey 1719 | Missing IMDb identifier',
      ].join('\n'),
    );
  });

  it('formats JSON with the documented Phase 2 schema', () => {
    expect(createPlexPlanJsonReport(sampleReport)).toEqual({
      moviesScanned: 4,
      importable: 3,
      needsReview: 2,
      alreadyRepresented: 1,
      wouldAdd: 2,
      plannedItems: sampleReport.plannedItems,
      needsReviewItems: sampleReport.needsReviewItems,
    });

    expect(JSON.parse(formatPlexPlanJsonReport(sampleReport))).toEqual({
      moviesScanned: 4,
      importable: 3,
      needsReview: 2,
      alreadyRepresented: 1,
      wouldAdd: 2,
      plannedItems: sampleReport.plannedItems,
      needsReviewItems: sampleReport.needsReviewItems,
    });
  });

  it('parses plex:plan CLI arguments', () => {
    expect(parsePlexPlanCliArgs([])).toEqual({ json: false });
    expect(parsePlexPlanCliArgs(['--json'])).toEqual({ json: true });
    expect(() => parsePlexPlanCliArgs(['--write'])).toThrow(
      'Unknown flag: --write',
    );
    expect(() => parsePlexPlanCliArgs(['movie'])).toThrow(
      'Usage:\n  yarn plex:plan [--json]',
    );
  });
});
