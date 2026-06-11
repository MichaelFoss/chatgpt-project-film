import { describe, expect, it } from 'vitest';
import { parseReactionCliArgs } from '../../scripts/react.js';

describe('reaction CLI', () => {
  it('parses the default reaction options', () => {
    expect(parseReactionCliArgs([])).toEqual({
      limit: 1,
      movies: false,
      tv: false,
      random: false,
      id: null,
    });
  });

  it('parses supported filters and selectors', () => {
    expect(
      parseReactionCliArgs(['--limit', '3', '--movies', '--random']),
    ).toEqual({
      limit: 3,
      movies: true,
      tv: false,
      random: true,
      id: null,
    });
    expect(parseReactionCliArgs(['--limit', 'none', '--tv'])).toEqual({
      limit: 'none',
      movies: false,
      tv: true,
      random: false,
      id: null,
    });
    expect(parseReactionCliArgs(['--id', 'imdb:tt0133093'])).toEqual({
      limit: 1,
      movies: false,
      tv: false,
      random: false,
      id: 'imdb:tt0133093',
    });
  });

  it('rejects invalid limit values', () => {
    expect(() => parseReactionCliArgs(['--limit', '0'])).toThrow(
      '--limit must be a positive integer or none',
    );
    expect(() => parseReactionCliArgs(['--limit', '1.5'])).toThrow(
      '--limit must be a positive integer or none',
    );
    expect(() => parseReactionCliArgs(['--limit', 'many'])).toThrow(
      '--limit must be a positive integer or none',
    );
  });

  it('rejects incompatible options', () => {
    expect(() => parseReactionCliArgs(['--movies', '--tv'])).toThrow(
      "error: option '--movies' cannot be used with option '--tv'",
    );
    expect(() =>
      parseReactionCliArgs(['--random', '--id', 'imdb:tt0133093']),
    ).toThrow(
      "error: option '--random' cannot be used with option '--id <canonicalId>'",
    );
  });
});
