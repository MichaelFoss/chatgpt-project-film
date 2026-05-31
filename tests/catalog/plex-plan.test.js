import { describe, expect, it } from 'vitest';
import {
  planPlexImport,
  readPlexConfig,
  validatePlexConfig,
} from '../../scripts/plex-plan.js';

describe('plex:plan scaffolding', () => {
  it('reads Plex configuration from the environment', () => {
    expect(
      readPlexConfig({
        PLEX_URL: ' http://localhost:32400 ',
        PLEX_TOKEN: ' token ',
      }),
    ).toEqual({
      plexUrl: 'http://localhost:32400',
      plexToken: 'token',
    });
  });

  it('fails fast when Plex configuration is missing', () => {
    expect(() =>
      validatePlexConfig({ plexUrl: '', plexToken: '' }),
    ).toThrow(
      'Missing required Plex configuration: PLEX_URL, PLEX_TOKEN.',
    );

    expect(() =>
      validatePlexConfig({
        plexUrl: 'http://localhost:32400',
        plexToken: '',
      }),
    ).toThrow('Missing required Plex configuration: PLEX_TOKEN.');
  });

  it('prints the placeholder when Plex configuration is present', async () => {
    await expect(
      planPlexImport({
        env: {
          PLEX_URL: 'http://localhost:32400',
          PLEX_TOKEN: 'token',
        },
      }),
    ).resolves.toBe('Plex planning is not implemented yet.');
  });
});
