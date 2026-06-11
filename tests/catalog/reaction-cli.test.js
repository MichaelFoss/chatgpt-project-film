import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createReactionPromptConfig,
  createSimulatedReactionEvent,
  formatVisibleReactionChoices,
  formatSimulatedReactionEvent,
  formatReactionTitle,
  getQuitConfirmationChoices,
  getReactionPromptChoices,
  parseReactionCliArgs,
  promptForReaction,
  readReactionCatalog,
  readReactionState,
  runReactionSession,
  selectFirstUnreactedTitle,
  selectReactionChoiceByKey,
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

function extendedCatalog() {
  return {
    ...testCatalog(),
    'imdb:tt003': {
      canonicalId: 'imdb:tt003',
      mediaType: 'movie',
      title: 'Gamma',
      releaseYear: 2003,
      genres: ['Comedy'],
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

async function captureReactionSession(options) {
  const output = [];
  const result = await runReactionSession({
    writeOutput: (message) => output.push(message),
    ...options,
  });

  return { output, result };
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
      { key: '1', name: 'Loved', value: 'loved' },
      { key: '2', name: 'Liked', value: 'liked' },
      { key: '3', name: 'Mixed', value: 'mixed' },
      { key: '4', name: 'Disliked', value: 'disliked' },
      { key: '5', name: 'Hated', value: 'hated' },
      { key: 's', name: 'Skip', value: 'skip' },
      { key: 'q', name: 'Quit', value: 'quit' },
    ]);

    const reaction = await promptForReaction({
      reactionPrompt: async ({ choices }) =>
        selectReactionChoiceByKey(choices, '3').value,
    });

    expect(reaction).toBe('mixed');
  });

  it('maps a single visible keypress to a reaction', () => {
    const choices = getReactionPromptChoices();

    expect(selectReactionChoiceByKey(choices, '1')).toEqual({
      key: '1',
      name: 'Loved',
      value: 'loved',
    });
    expect(selectReactionChoiceByKey(choices, '5')).toEqual({
      key: '5',
      name: 'Hated',
      value: 'hated',
    });
    expect(selectReactionChoiceByKey(choices, 's')).toEqual({
      key: 's',
      name: 'Skip',
      value: 'skip',
    });
    expect(selectReactionChoiceByKey(choices, 'q')).toEqual({
      key: 'q',
      name: 'Quit',
      value: 'quit',
    });
    expect(selectReactionChoiceByKey(choices, 'enter')).toBeNull();
    expect(selectReactionChoiceByKey(choices, '')).toBeNull();
  });

  it('generates visible reaction choices for every available option', () => {
    expect(formatVisibleReactionChoices()).toBe(
      '[1] Loved [2] Liked [3] Mixed [4] Disliked [5] Hated [s] Skip [q] Quit',
    );
  });

  it('generates visible quit confirmation choices', () => {
    expect(getQuitConfirmationChoices()).toEqual([
      { key: 'a', name: 'Abort', value: 'abort' },
      { key: 's', name: 'Save & Quit', value: 'save-and-quit' },
      { key: 'c', name: 'Cancel', value: 'cancel' },
    ]);
    expect(
      formatVisibleReactionChoices(getQuitConfirmationChoices()),
    ).toBe('[a] Abort [s] Save & Quit [c] Cancel');
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

  it('uses default limit 1 for a reaction session', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      reactionPrompt: async () => 'liked',
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
    });
    expect(result.bufferedEvents).toHaveLength(1);
    expect(output.join('\n')).toContain('Alpha (2001)');
    expect(output.join('\n')).not.toContain('Beta (2002)');
  });

  it('supports --limit n session selection behavior', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['liked', 'mixed', 'hated'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '3'],
      reactionPrompt: async () => reactions.shift(),
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 3,
    });
    expect(
      result.bufferedEvents.map((event) => event.canonicalId),
    ).toEqual(['imdb:tt001', 'imdb:tt002', 'imdb:tt003']);
    expect(output.join('\n')).toContain('Gamma (2003)');
  });

  it('supports --limit none until no eligible titles remain', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--limit', 'none'],
      reactionPrompt: async () => 'liked',
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 3,
    });
    expect(result.bufferedEvents).toHaveLength(3);
  });

  it('does not create an event for skip and advances session progress', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['skip', 'liked'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '2'],
      reactionPrompt: async () => reactions.shift(),
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
    });
    expect(result.bufferedEvents).toEqual([
      {
        canonicalId: 'imdb:tt002',
        title: 'Beta',
        reaction: 'liked',
      },
    ]);
    expect(output.join('\n')).toContain('Alpha (2001)');
    expect(output.join('\n')).toContain('Beta (2002)');
  });

  it('quit abort discards the session buffer', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['liked', 'quit'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '3'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'abort',
    });

    expect(result).toEqual({
      status: 'aborted',
      bufferedEvents: [],
      processedCount: 1,
    });
    expect(output.join('\n')).toContain(
      'Reaction session aborted. No simulated events were saved or written.',
    );
  });

  it('quit save and quit prints buffer and excludes the current title', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['liked', 'quit'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '3'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'save-and-quit',
    });
    const text = output.join('\n');

    expect(result).toMatchObject({
      status: 'saved-and-quit',
      processedCount: 1,
    });
    expect(result.bufferedEvents).toHaveLength(1);
    expect(text).toContain('"canonicalId": "imdb:tt001"');
    expect(text).not.toContain('"canonicalId": "imdb:tt002"');
    expect(text).toContain(
      'Save & Quit selected. Current title was not written: Beta.',
    );
    expect(text).toContain('No file was written.');
  });

  it('quit cancel returns to the same title prompt', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['quit', 'mixed'];
    const promptedTitles = [];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '1'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'cancel',
      writeOutput: (message) => promptedTitles.push(message),
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
    });
    expect(result.bufferedEvents).toEqual([
      {
        canonicalId: 'imdb:tt001',
        title: 'Alpha',
        reaction: 'mixed',
      },
    ]);
    expect(
      promptedTitles.filter((message) =>
        message.includes('Alpha (2001)'),
      ),
    ).toHaveLength(1);
  });

  it('excludes titles already reacted during the current run', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '2'],
      reactionPrompt: async () => 'liked',
    });

    expect(
      result.bufferedEvents.map((event) => event.canonicalId),
    ).toEqual(['imdb:tt001', 'imdb:tt002']);
  });

  it('excludes existing reacted titles from the generated projection', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '1'],
      reactionPrompt: async () => 'liked',
    });

    expect(result.bufferedEvents).toEqual([
      {
        canonicalId: 'imdb:tt002',
        title: 'Beta',
        reaction: 'liked',
      },
    ]);
  });

  it('keeps session behavior file-free', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const catalogBefore = await fs.readFile(
      path.join(rootDir, 'data', 'catalog.json'),
      'utf8',
    );
    const reactionsBefore = await fs.readFile(
      path.join(rootDir, 'data', 'title-reactions.json'),
      'utf8',
    );

    await captureReactionSession({
      rootDir,
      args: ['--limit', 'none'],
      reactionPrompt: async () => 'liked',
    });

    await expect(
      fs.readFile(path.join(rootDir, 'data', 'catalog.json'), 'utf8'),
    ).resolves.toBe(catalogBefore);
    await expect(
      fs.readFile(
        path.join(rootDir, 'data', 'title-reactions.json'),
        'utf8',
      ),
    ).resolves.toBe(reactionsBefore);
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
