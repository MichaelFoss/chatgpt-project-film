import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createReactionPromptConfig,
  createSimulatedReactionEvent,
  formatSimulatedReactionEvent,
  formatReactionTitle,
  getReactionPromptChoices,
  parseReactionCliArgs,
  promptForReaction,
  readReactionCatalog,
  readReactionState,
  selectFirstUnreactedTitle,
  selectReactionTitle,
} from '../../scripts/react.js';

const tempDirs = [];

async function createTempProject({
  catalog = testCatalog(),
  reactions = {},
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-cli-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'title-reactions.json'),
    `${JSON.stringify(reactions, null, 2)}\n`,
    'utf8',
  );
  return rootDir;
}

function testCatalog() {
  return {
    'imdb:tt001': {
      canonicalId: 'imdb:tt001',
      mediaType: 'movie',
      title: 'Alpha',
      releaseYear: 2001,
      description: 'This plot summary must not appear.',
      genres: ['Action', 'Sci-Fi'],
      ratings: {
        imdb: '9.9',
      },
    },
    'imdb:tt002': {
      canonicalId: 'imdb:tt002',
      mediaType: 'series',
      title: 'Beta',
      releaseYear: 2002,
      description: 'Another plot summary must not appear.',
      genres: ['Drama'],
    },
  };
}

function reaction(canonicalId) {
  return {
    canonicalId,
    updatedAt: '2026-06-10T12:00:00.000Z',
    eventIds: [`evt-${canonicalId}`],
    rating: 8,
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

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

  it('loads the generated catalog', async () => {
    const rootDir = await createTempProject();

    await expect(readReactionCatalog({ rootDir })).resolves.toEqual(
      testCatalog(),
    );
  });

  it('loads current reaction state from the generated projection', async () => {
    const reactions = {
      'imdb:tt001': reaction('imdb:tt001'),
    };
    const rootDir = await createTempProject({ reactions });

    await expect(readReactionState({ rootDir })).resolves.toEqual(
      reactions,
    );
  });

  it('selects the first unreacted title in catalog order', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });

    await expect(
      selectReactionTitle({ rootDir }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt002',
      title: 'Beta',
    });
    expect(
      selectFirstUnreactedTitle(testCatalog(), {
        'imdb:tt001': reaction('imdb:tt001'),
      }),
    ).toMatchObject({
      canonicalId: 'imdb:tt002',
      title: 'Beta',
    });
  });

  it('returns a user-friendly message when all titles are reacted', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
        'imdb:tt002': reaction('imdb:tt002'),
      },
    });

    const item = await selectReactionTitle({ rootDir });

    expect(item).toBeNull();
    expect(formatReactionTitle(item)).toBe(
      'No unreacted titles found.',
    );
  });

  it('handles an empty catalog as no eligible title', async () => {
    const rootDir = await createTempProject({ catalog: {} });

    const item = await selectReactionTitle({ rootDir });

    expect(item).toBeNull();
    expect(formatReactionTitle(item)).toBe(
      'No unreacted titles found.',
    );
  });

  it('formats only identifying metadata for a selected title', () => {
    expect(formatReactionTitle(testCatalog()['imdb:tt001'])).toBe(
      ['Alpha (2001)', 'Movie · Action, Sci-Fi'].join('\n'),
    );
    expect(
      formatReactionTitle(testCatalog()['imdb:tt001']),
    ).not.toContain('plot summary');
    expect(
      formatReactionTitle(testCatalog()['imdb:tt001']),
    ).not.toContain('9.9');
  });

  it('maps reaction prompt choices to internal reaction values', async () => {
    expect(getReactionPromptChoices()).toEqual([
      { name: 'Loved', value: 'loved' },
      { name: 'Liked', value: 'liked' },
      { name: 'Mixed', value: 'mixed' },
      { name: 'Disliked', value: 'disliked' },
      { name: 'Hated', value: 'hated' },
    ]);

    const reaction = await promptForReaction({
      reactionPrompt: async ({ choices }) =>
        choices.find((choice) => choice.name === 'Mixed').value,
    });

    expect(reaction).toBe('mixed');
  });

  it('does not configure a default reaction value', async () => {
    const promptConfig = createReactionPromptConfig();

    expect(promptConfig).not.toHaveProperty('default');
    expect(promptConfig.choices).toEqual(getReactionPromptChoices());

    await promptForReaction({
      reactionPrompt: async (config) => {
        expect(config).not.toHaveProperty('default');
        return 'liked';
      },
    });
  });

  it('creates a simulated reaction event in memory', () => {
    expect(
      createSimulatedReactionEvent(
        testCatalog()['imdb:tt001'],
        'liked',
      ),
    ).toEqual({
      canonicalId: 'imdb:tt001',
      title: 'Alpha',
      reaction: 'liked',
    });
  });

  it('formats simulated event output as a dry run', () => {
    const output = formatSimulatedReactionEvent({
      canonicalId: 'imdb:tt001',
      title: 'Alpha',
      reaction: 'liked',
    });

    expect(output).toContain('Simulated event write');
    expect(output).toContain('no file was written');
    expect(output).toContain('"canonicalId": "imdb:tt001"');
    expect(output).toContain('"title": "Alpha"');
    expect(output).toContain('"reaction": "liked"');
  });

  it('does not write files when creating and formatting simulated events', async () => {
    const rootDir = await createTempProject();
    const before = await fs.readdir(path.join(rootDir, 'data'));

    const event = createSimulatedReactionEvent(
      testCatalog()['imdb:tt001'],
      'loved',
    );
    formatSimulatedReactionEvent(event);

    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.readdir(path.join(rootDir, 'data')),
    ).resolves.toEqual(before);
  });
});
