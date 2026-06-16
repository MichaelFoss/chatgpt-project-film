import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createReactionPromptConfig,
  createReactionCommand,
  createTitleIgnoredEvent,
  createTitleReactionEvent,
  findReactionTitleById,
  formatExistingReaction,
  formatIgnoredTitleRateError,
  formatReactedTitleIgnoreError,
  formatSearchResultThresholdMessage,
  formatSearchResults,
  formatVisibleRatingScale,
  formatVisibleReactionChoices,
  formatReactionWriteSummary,
  formatReactionTitle,
  getSearchSelectionChoices,
  getQuitConfirmationChoices,
  getReactionPromptChoices,
  parseReactionCliArgs,
  promptForSearchQuery,
  promptForReaction,
  ratingForReaction,
  readReactionCatalog,
  readReactionIgnoredState,
  readReactionSearchResultThreshold,
  readReactionState,
  runReactionSession,
  searchReactionCatalog,
  selectFirstUnreactedTitle,
  selectEligibleReactionTitles,
  selectRandomUnreactedTitle,
  selectReactionTitleFromSearch,
  selectReactionChoiceByKey,
  selectReactionTitle,
} from '../../scripts/react.js';

const tempDirs = [];
let originalSearchResultThreshold;

async function createTempProject({
  catalog = testCatalog(),
  reactions = {},
  ignored = {},
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-cli-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
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
  await fs.writeFile(
    path.join(rootDir, 'data', 'title-ignored.json'),
    `${JSON.stringify(ignored, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
    '',
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

function catalogWithTvAlias() {
  return {
    'imdb:tt010': {
      canonicalId: 'imdb:tt010',
      mediaType: 'movie',
      title: 'Movie Candidate',
      releaseYear: 2010,
      genres: ['Drama'],
    },
    'imdb:tt011': {
      canonicalId: 'imdb:tt011',
      mediaType: 'show',
      title: 'Show Candidate',
      releaseYear: 2011,
      genres: ['Drama'],
    },
  };
}

function largeSearchCatalog(size = 36) {
  return Object.fromEntries(
    Array.from({ length: size }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      const canonicalId = `imdb:match${number}`;

      return [
        canonicalId,
        {
          canonicalId,
          mediaType: 'movie',
          title: `Match ${number}`,
          releaseYear: 2000 + index,
          genres: ['Drama'],
        },
      ];
    }),
  );
}

function reaction(canonicalId, overrides = {}) {
  return {
    canonicalId,
    updatedAt: '2026-06-10T12:00:00.000Z',
    eventIds: [`evt-${canonicalId}`],
    rating: 8,
    ...overrides,
  };
}

function ignoredTitle(canonicalId, overrides = {}) {
  return {
    canonicalId,
    ignoredAt: '2026-06-10T12:00:00.000Z',
    eventId: `evt-ignore-${canonicalId}`,
    ...overrides,
  };
}

async function captureReactionSession(options) {
  const output = [];
  const result = await runReactionSession({
    writeOutput: (message) => output.push(message),
    notesPrompt: async () => null,
    reasonsPrompt: async () => null,
    ...options,
  });

  return { output, result };
}

beforeEach(() => {
  originalSearchResultThreshold =
    process.env.REACTION_SEARCH_RESULT_THRESHOLD;
});

afterEach(async () => {
  if (originalSearchResultThreshold === undefined) {
    delete process.env.REACTION_SEARCH_RESULT_THRESHOLD;
  } else {
    process.env.REACTION_SEARCH_RESULT_THRESHOLD =
      originalSearchResultThreshold;
  }

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
      random: true,
      ordered: false,
      id: null,
      search: false,
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
      ordered: false,
      id: null,
      search: false,
    });
    expect(parseReactionCliArgs(['--limit', 'none', '--tv'])).toEqual({
      limit: 'none',
      movies: false,
      tv: true,
      random: true,
      ordered: false,
      id: null,
      search: false,
    });
    expect(parseReactionCliArgs(['--ordered'])).toEqual({
      limit: 1,
      movies: false,
      tv: false,
      random: false,
      ordered: true,
      id: null,
      search: false,
    });
    expect(parseReactionCliArgs(['--id', 'imdb:tt0133093'])).toEqual({
      limit: 1,
      movies: false,
      tv: false,
      random: false,
      ordered: false,
      id: 'imdb:tt0133093',
      search: false,
    });
    expect(parseReactionCliArgs(['--search'])).toEqual({
      limit: 1,
      movies: false,
      tv: false,
      random: false,
      ordered: false,
      id: null,
      search: true,
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
    expect(() =>
      parseReactionCliArgs(['--id', 'imdb:tt0133093', '--search']),
    ).toThrow(
      "error: option '--id <canonicalId>' cannot be used with option '--search'",
    );
    expect(() =>
      parseReactionCliArgs(['--random', '--search']),
    ).toThrow(
      "error: option '--random' cannot be used with option '--search'",
    );
    expect(() =>
      parseReactionCliArgs(['--random', '--ordered']),
    ).toThrow(
      "error: option '--random' cannot be used with option '--ordered'",
    );
    expect(() =>
      parseReactionCliArgs(['--ordered', '--id', 'imdb:tt0133093']),
    ).toThrow(
      "error: option '--ordered' cannot be used with option '--id <canonicalId>'",
    );
  });

  it('keeps --tv as the CLI flag while showing Series in help text', () => {
    const helpText = createReactionCommand().helpInformation();

    expect(helpText).toContain('--tv');
    expect(helpText).toContain('only include Series titles');
    expect(helpText).toContain(
      '--random            randomize eligible title selection (default)',
    );
    expect(helpText).toContain(
      '--ordered           use deterministic title ordering',
    );
    expect(helpText).not.toContain('only include television titles');
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

  it('loads current ignored title state from the generated projection', async () => {
    const ignored = {
      'imdb:tt002': ignoredTitle('imdb:tt002'),
    };
    const rootDir = await createTempProject({ ignored });

    await expect(
      readReactionIgnoredState({ rootDir }),
    ).resolves.toEqual(ignored);
  });

  it('selects the first unreacted title in ordered catalog order', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });

    await expect(
      selectReactionTitle({ rootDir, ordered: true }),
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

  it('selects random titles only from the eligible title pool', () => {
    const catalog = extendedCatalog();
    const reactions = {
      'imdb:tt001': reaction('imdb:tt001'),
    };
    const excludedTitleIds = new Set(['imdb:tt002']);

    expect(
      selectEligibleReactionTitles(
        catalog,
        reactions,
        excludedTitleIds,
      ).map((item) => item.canonicalId),
    ).toEqual(['imdb:tt003']);
    expect(
      selectRandomUnreactedTitle(
        catalog,
        reactions,
        excludedTitleIds,
        () => 0,
      ),
    ).toMatchObject({
      canonicalId: 'imdb:tt003',
      title: 'Gamma',
    });
  });

  it('filters eligible titles to movies only', () => {
    const titles = selectEligibleReactionTitles(
      extendedCatalog(),
      {},
      new Set(),
      { movies: true },
    );

    expect(titles).toHaveLength(2);
    expect(titles.every((item) => item.mediaType === 'movie')).toBe(
      true,
    );
    expect(titles.map((item) => item.canonicalId)).toEqual([
      'imdb:tt001',
      'imdb:tt003',
    ]);
  });

  it('filters eligible titles to TV series only', () => {
    const titles = selectEligibleReactionTitles(
      extendedCatalog(),
      {},
      new Set(),
      { tv: true },
    );

    expect(titles).toHaveLength(1);
    expect(titles.every((item) => item.mediaType === 'series')).toBe(
      true,
    );
    expect(titles.map((item) => item.canonicalId)).toEqual([
      'imdb:tt002',
    ]);
  });

  it('treats TV media-type aliases as TV candidates', () => {
    const catalog = catalogWithTvAlias();
    const titles = selectEligibleReactionTitles(
      catalog,
      {},
      new Set(),
      { tv: true },
    );

    expect(titles.map((item) => item.canonicalId)).toEqual([
      'imdb:tt011',
    ]);
    expect(
      selectFirstUnreactedTitle(catalog, {}, new Set(), {
        tv: true,
      }),
    ).toMatchObject({
      canonicalId: 'imdb:tt011',
      title: 'Show Candidate',
    });
    expect(
      selectRandomUnreactedTitle(catalog, {}, new Set(), () => 0, {
        tv: true,
      }),
    ).toMatchObject({
      canonicalId: 'imdb:tt011',
      title: 'Show Candidate',
    });
  });

  it('selects first, middle, and last eligible titles from deterministic random values', () => {
    const catalog = extendedCatalog();
    const reactions = {};

    expect(
      selectRandomUnreactedTitle(
        catalog,
        reactions,
        new Set(),
        () => 0,
      ),
    ).toMatchObject({
      canonicalId: 'imdb:tt001',
      title: 'Alpha',
    });
    expect(
      selectRandomUnreactedTitle(
        catalog,
        reactions,
        new Set(),
        () => 0.4,
      ),
    ).toMatchObject({
      canonicalId: 'imdb:tt002',
      title: 'Beta',
    });
    expect(
      selectRandomUnreactedTitle(
        catalog,
        reactions,
        new Set(),
        () => 0.999,
      ),
    ).toMatchObject({
      canonicalId: 'imdb:tt003',
      title: 'Gamma',
    });
  });

  it('selects random movie titles only from movie candidates', () => {
    const firstMovie = selectRandomUnreactedTitle(
      extendedCatalog(),
      {},
      new Set(),
      () => 0,
      { movies: true },
    );
    const lastMovie = selectRandomUnreactedTitle(
      extendedCatalog(),
      {},
      new Set(),
      () => 0.999,
      { movies: true },
    );

    expect(firstMovie).toMatchObject({
      canonicalId: 'imdb:tt001',
      mediaType: 'movie',
    });
    expect(lastMovie).toMatchObject({
      canonicalId: 'imdb:tt003',
      mediaType: 'movie',
    });
  });

  it('selects random TV titles only from TV candidates', () => {
    const item = selectRandomUnreactedTitle(
      extendedCatalog(),
      {},
      new Set(),
      () => 0.999,
      { tv: true },
    );

    expect(item).toMatchObject({
      canonicalId: 'imdb:tt002',
      mediaType: 'series',
      title: 'Beta',
    });
  });

  it('never selects previously reacted titles in random mode', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });

    const item = await selectReactionTitle({
      rootDir,
      random: true,
    });

    expect(item).toMatchObject({
      canonicalId: 'imdb:tt002',
      title: 'Beta',
    });
  });

  it('excludes ignored titles from random selection', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      ignored: {
        'imdb:tt001': ignoredTitle('imdb:tt001'),
        'imdb:tt002': ignoredTitle('imdb:tt002'),
      },
    });

    const item = await selectReactionTitle({
      rootDir,
      random: true,
    });

    expect(item).toMatchObject({
      canonicalId: 'imdb:tt003',
      title: 'Gamma',
    });
  });

  it('excludes ignored titles from ordered selection', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      ignored: {
        'imdb:tt001': ignoredTitle('imdb:tt001'),
      },
    });

    const item = await selectReactionTitle({
      rootDir,
      ordered: true,
    });

    expect(item).toMatchObject({
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
      'No eligible-unreacted titles found.',
    );
  });

  it('handles an empty catalog as no eligible title', async () => {
    const rootDir = await createTempProject({ catalog: {} });

    const item = await selectReactionTitle({ rootDir });

    expect(item).toBeNull();
    expect(formatReactionTitle(item)).toBe(
      'No eligible-unreacted titles found.',
    );
  });

  it('formats only identifying metadata for a selected title', () => {
    expect(formatReactionTitle(testCatalog()['imdb:tt001'])).toBe(
      ['Alpha (2001)', 'Movie · Action, Sci-Fi'].join('\n'),
    );
    expect(formatReactionTitle(testCatalog()['imdb:tt002'])).toBe(
      ['Beta (2002)', 'Series · Drama'].join('\n'),
    );
    expect(
      formatReactionTitle(testCatalog()['imdb:tt001']),
    ).not.toContain('plot summary');
    expect(
      formatReactionTitle(testCatalog()['imdb:tt001']),
    ).not.toContain('9.9');
  });

  it('formats an existing reaction with rating only', () => {
    expect(formatExistingReaction(reaction('imdb:tt001'))).toBe(
      ['Existing reaction found.', '', 'Rating: 8/10'].join('\n'),
    );
  });

  it('formats an existing reaction with rating and reasons', () => {
    expect(
      formatExistingReaction(
        reaction('imdb:tt001', {
          reasons: ['mcu', 'action'],
        }),
      ),
    ).toBe(
      [
        'Existing reaction found.',
        '',
        'Rating: 8/10',
        'Reasons: mcu, action',
      ].join('\n'),
    );
  });

  it('formats an existing reaction with rating and notes', () => {
    expect(
      formatExistingReaction(
        reaction('imdb:tt001', {
          notes: 'Great ending.',
        }),
      ),
    ).toBe(
      [
        'Existing reaction found.',
        '',
        'Rating: 8/10',
        'Notes: Great ending.',
      ].join('\n'),
    );
  });

  it('formats an existing reaction with rating, reasons, and notes', () => {
    expect(
      formatExistingReaction(
        reaction('imdb:tt001', {
          reasons: ['mcu', 'action'],
          notes: 'Great ending.',
        }),
      ),
    ).toBe(
      [
        'Existing reaction found.',
        '',
        'Rating: 8/10',
        'Reasons: mcu, action',
        'Notes: Great ending.',
      ].join('\n'),
    );
  });

  it('does not format missing existing reaction details', () => {
    expect(formatExistingReaction(null)).toBeNull();
    expect(formatExistingReaction(undefined)).toBeNull();
    expect(
      formatExistingReaction(reaction('imdb:tt001', { notes: '' })),
    ).not.toContain('Notes:');
    expect(
      formatExistingReaction(reaction('imdb:tt001', { reasons: [] })),
    ).not.toContain('Reasons:');
  });

  it('formats search results without summaries or ratings', () => {
    const items = Object.values(testCatalog());

    expect(formatSearchResults(items)).toBe(
      [
        '[1] Alpha (2001) | Movie | imdb:tt001',
        '[2] Beta (2002) | Series | imdb:tt002',
      ].join('\n'),
    );
    expect(formatSearchResults(items)).not.toContain('plot summary');
    expect(formatSearchResults(items)).not.toContain('9.9');
    expect(getSearchSelectionChoices(items)).toEqual([
      {
        key: '1',
        name: 'Alpha (2001) | Movie | imdb:tt001',
        value: 'imdb:tt001',
      },
      {
        key: '2',
        name: 'Beta (2002) | Series | imdb:tt002',
        value: 'imdb:tt002',
      },
    ]);
    expect(
      formatVisibleReactionChoices(getSearchSelectionChoices(items)),
    ).toBe(
      [
        '[1] Alpha (2001) | Movie | imdb:tt001',
        '[2] Beta (2002) | Series | imdb:tt002',
      ].join('\n'),
    );
  });

  it('formats large search results without silently hiding matches', () => {
    const items = Object.values(largeSearchCatalog());
    const output = formatSearchResults(items);
    const choices = getSearchSelectionChoices(items);

    expect(choices).toHaveLength(36);
    expect(choices[0]).toMatchObject({
      key: '1',
      value: 'imdb:match01',
    });
    expect(choices[34]).toMatchObject({
      key: '35',
      value: 'imdb:match35',
    });
    expect(choices[35]).toMatchObject({
      key: '36',
      value: 'imdb:match36',
    });
    expect(output).toContain(
      '[36] Match 36 (2035) | Movie | imdb:match36',
    );
    expect(output).not.toContain('Showing 35 of 36 matches');
    expect(output.split('\n')).toHaveLength(36);
  });

  it('reads the search result threshold from the environment', () => {
    delete process.env.REACTION_SEARCH_RESULT_THRESHOLD;

    expect(readReactionSearchResultThreshold()).toBe(25);

    process.env.REACTION_SEARCH_RESULT_THRESHOLD = '3';

    expect(readReactionSearchResultThreshold()).toBe(3);
    expect(formatSearchResultThresholdMessage(4)).toBe(
      'Too many titles found (4). Please refine your search.',
    );
  });

  it('allows blank search prompt input so the search flow can cancel', async () => {
    await expect(
      promptForSearchQuery({
        searchPrompt: async (config) => config,
      }),
    ).resolves.toMatchObject({
      message: 'Search catalog',
      allowEmpty: true,
    });
  });

  it('maps rating prompt choices to explicit numeric values', async () => {
    expect(getReactionPromptChoices()).toEqual([
      { key: '0', name: 'Exceptional', value: 10 },
      { key: '9', name: 'Loved', value: 9 },
      { key: '8', name: '8', value: 8 },
      { key: '7', name: 'Liked', value: 7 },
      { key: '6', name: '6', value: 6 },
      { key: '5', name: 'Mixed', value: 5 },
      { key: '4', name: '4', value: 4 },
      { key: '3', name: 'Disliked', value: 3 },
      { key: '2', name: '2', value: 2 },
      { key: '1', name: 'Hated', value: 1 },
      { key: 's', name: 'Skip', value: 'skip' },
      { key: 'i', name: 'Ignore', value: 'ignore' },
      { key: 'q', name: 'Quit', value: 'quit' },
    ]);

    const reaction = await promptForReaction({
      reactionPrompt: async ({ choices }) =>
        selectReactionChoiceByKey(choices, '0').value,
    });

    expect(reaction).toBe(10);
  });

  it('maps single visible keypresses to ratings and control actions', () => {
    const choices = getReactionPromptChoices();

    expect(selectReactionChoiceByKey(choices, '0')).toEqual({
      key: '0',
      name: 'Exceptional',
      value: 10,
    });

    for (let rating = 1; rating <= 9; rating += 1) {
      expect(
        selectReactionChoiceByKey(choices, String(rating)).value,
      ).toBe(rating);
    }

    expect(selectReactionChoiceByKey(choices, '1')).toEqual({
      key: '1',
      name: 'Hated',
      value: 1,
    });
    expect(selectReactionChoiceByKey(choices, 's')).toEqual({
      key: 's',
      name: 'Skip',
      value: 'skip',
    });
    expect(selectReactionChoiceByKey(choices, 'i')).toEqual({
      key: 'i',
      name: 'Ignore',
      value: 'ignore',
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
    const promptConfig = createReactionPromptConfig();
    const expectedOutput = [
      '[0] Exceptional',
      '[9] Loved',
      '[8]',
      '[7] Liked',
      '[6]',
      '[5] Mixed',
      '[4]',
      '[3] Disliked',
      '[2]',
      '[1] Hated',
      '',
      '[s] Skip  [i] Ignore  [q] Quit',
    ].join('\n');

    expect(promptConfig.message).toBe('Rate this title:');
    expect(formatVisibleRatingScale()).toBe(expectedOutput);
    expect(promptConfig.formatChoices(promptConfig.choices)).toBe(
      expectedOutput,
    );
  });

  it('keeps generic choice rendering reusable for non-rating prompts', () => {
    expect(
      formatVisibleReactionChoices(getReactionPromptChoices()),
    ).toBe(
      [
        '[0] Exceptional',
        '[9] Loved',
        '[8] 8',
        '[7] Liked',
        '[6] 6',
        '[5] Mixed',
        '[4] 4',
        '[3] Disliked',
        '[2] 2',
        '[1] Hated',
        '[s] Skip',
        '[i] Ignore',
        '[q] Quit',
      ].join(' '),
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
    expect(promptConfig.formatChoices).toBe(formatVisibleRatingScale);

    await promptForReaction({
      reactionPrompt: async (config) => {
        expect(config).not.toHaveProperty('default');
        return 8;
      },
    });
  });

  it('creates a title reaction event in memory', () => {
    const event = createTitleReactionEvent(
      testCatalog()['imdb:tt001'],
      9,
      {
        eventId: 'evt-1',
        occurredAt: '2026-06-10T12:00:00.000Z',
      },
    );

    expect(event).toEqual({
      eventId: 'evt-1',
      type: 'title.reaction.updated',
      occurredAt: '2026-06-10T12:00:00.000Z',
      canonicalId: 'imdb:tt001',
      rating: 9,
    });
    expect(event).not.toHaveProperty('sentiment');
    expect(event).not.toHaveProperty('label');
    expect(event).not.toHaveProperty('bucket');
  });

  it('creates a title ignored event in memory', () => {
    const event = createTitleIgnoredEvent(testCatalog()['imdb:tt001'], {
      eventId: 'evt-ignore-1',
      occurredAt: '2026-06-10T12:00:00.000Z',
    });

    expect(event).toEqual({
      eventId: 'evt-ignore-1',
      type: 'title.ignored',
      occurredAt: '2026-06-10T12:00:00.000Z',
      canonicalId: 'imdb:tt001',
    });
    expect(event).not.toHaveProperty('rating');
    expect(event).not.toHaveProperty('notes');
    expect(event).not.toHaveProperty('reasons');
  });

  it('accepts only supported personal-fit ratings', () => {
    for (let rating = 1; rating <= 10; rating += 1) {
      expect(ratingForReaction(rating)).toBe(rating);
    }

    expect(ratingForReaction('9')).toBe(9);
    expect(() => ratingForReaction(0)).toThrow('Unsupported reaction');
    expect(() => ratingForReaction(11)).toThrow('Unsupported reaction');
  });

  it('formats real write output without implementation details', () => {
    const output = formatReactionWriteSummary({
      eventsWritten: 1,
      filesWritten: [
        'events/title-reactions.events.ndjson',
        'data/title-reactions.json',
      ],
      events: [
        {
          canonicalId: 'imdb:tt001',
          title: 'Alpha',
          rating: 8,
        },
      ],
    });

    expect(output).toContain('Wrote 1 title reaction event(s).');
    expect(output).toContain('Wrote 0 title ignore event(s).');
    expect(output).toContain('Alpha: rating 8/10 (imdb:tt001)');
    expect(output).toContain('Files changed:');
    expect(output).toContain('- events/title-reactions.events.ndjson');
    expect(output).toContain('- data/title-reactions.json');
    expect(output).toContain('Next:');
    expect(output).toContain('git diff');
    expect(output).toContain(
      'git add events/title-reactions.events.ndjson data/title-reactions.json',
    );
    expect(output).toContain('git commit -m "Add movie reactions"');
    expect(output).not.toContain('eventId');
    expect(output).not.toContain('occurredAt');
  });

  it('omits next-step guidance when no files were written', () => {
    const output = formatReactionWriteSummary({
      eventsWritten: 0,
      filesWritten: ['events/title-reactions.events.ndjson'],
      events: [],
    });

    expect(output).toBe(
      'Wrote 0 title reaction event(s).\nWrote 0 title ignore event(s).',
    );
  });

  it('quotes written files with shell-sensitive characters in git add', () => {
    const output = formatReactionWriteSummary({
      eventsWritten: 1,
      filesWritten: [
        'events/title-reactions.events.ndjson',
        'data/reaction drafts/title reactions.json',
      ],
      events: [
        {
          canonicalId: 'imdb:tt001',
          title: 'Alpha',
          rating: 8,
        },
      ],
    });

    expect(output).toContain(
      "git add events/title-reactions.events.ndjson 'data/reaction drafts/title reactions.json'",
    );
  });

  it('does not write files when creating and formatting events', async () => {
    const rootDir = await createTempProject();
    const before = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );

    const event = createTitleReactionEvent(
      testCatalog()['imdb:tt001'],
      10,
    );
    formatReactionWriteSummary({
      eventsWritten: 1,
      events: [{ ...event, title: 'Alpha' }],
    });

    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe(before);
  });

  it('captures notes after selecting a rating', async () => {
    const rootDir = await createTempProject();

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--ordered'],
      reactionPrompt: async () => 9,
      notesPrompt: async () => ' Loved the atmosphere and soundtrack. ',
    });

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 9,
      notes: 'Loved the atmosphere and soundtrack.',
    });
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toContain(
      '"notes":"Loved the atmosphere and soundtrack."',
    );
  });

  it('captures normalized reasons after notes entry', async () => {
    const rootDir = await createTempProject();
    const prompts = [];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--ordered'],
      reactionPrompt: async () => {
        prompts.push('rating');
        return 9;
      },
      notesPrompt: async () => {
        prompts.push('notes');
        return 'Loved the atmosphere.';
      },
      reasonsPrompt: async (config) => {
        prompts.push(config.message);
        return config.transform(
          'Great Atmosphere, soundtrack, soundtrack,   , Strong Emotional Payoff',
        );
      },
    });

    expect(prompts).toEqual([
      'rating',
      'notes',
      'Reasons (optional, comma-separated)',
    ]);
    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 9,
      notes: 'Loved the atmosphere.',
      reasons: [
        'great atmosphere',
        'soundtrack',
        'strong emotional payoff',
      ],
    });
  });

  it('stores lowercase reasons while preserving notes unchanged', async () => {
    const rootDir = await createTempProject();

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--ordered'],
      reactionPrompt: async () => 9,
      notesPrompt: async () => 'Do NOT lowercase MCU in this note.',
      reasonsPrompt: async (config) =>
        config.transform(['MCU', 'mcu', ' Mcu ']),
    });
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    const projectionText = await fs.readFile(
      path.join(rootDir, 'data', 'title-reactions.json'),
      'utf8',
    );

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 9,
      notes: 'Do NOT lowercase MCU in this note.',
      reasons: ['mcu'],
    });
    expect(JSON.parse(eventText).reasons).toEqual(['mcu']);
    expect(JSON.parse(eventText).notes).toBe(
      'Do NOT lowercase MCU in this note.',
    );
    expect(JSON.parse(projectionText)['imdb:tt001'].reasons).toEqual([
      'mcu',
    ]);
  });

  it('does not display existing reaction details for first-time reactions', async () => {
    const rootDir = await createTempProject();

    const { output } = await captureReactionSession({
      rootDir,
      args: ['--ordered'],
      reactionPrompt: async () => 9,
    });

    expect(output.join('\n')).toContain('Alpha (2001)');
    expect(output.join('\n')).not.toContain('Existing reaction found.');
    expect(output.join('\n')).not.toContain('Rating:');
    expect(output.join('\n')).not.toContain('Reasons:');
    expect(output.join('\n')).not.toContain('Notes:');
  });

  it('displays existing reaction details before prompting for an ID re-rating', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          rating: 8,
          reasons: ['mcu', 'action'],
          notes: 'Great ending.',
        }),
      },
    });
    const output = [];
    let outputBeforeRatingPrompt = [];

    await runReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      writeOutput: (message) => output.push(message),
      notesPrompt: async () => null,
      reasonsPrompt: async () => null,
      reactionPrompt: async () => {
        outputBeforeRatingPrompt = [...output];
        return 9;
      },
    });

    expect(outputBeforeRatingPrompt).toEqual([
      ['Alpha (2001)', 'Movie · Action, Sci-Fi'].join('\n'),
      [
        'Existing reaction found.',
        '',
        'Rating: 8/10',
        'Reasons: mcu, action',
        'Notes: Great ending.',
      ].join('\n'),
    ]);
  });

  it('passes existing projected notes as the notes prompt initial value', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          notes: 'Great visuals.',
        }),
      },
    });
    let initialValue;

    await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 9,
      notesPrompt: async (config) => {
        initialValue = config.initialValue;
        return config.transform(config.initialValue);
      },
    });

    expect(initialValue).toBe('Great visuals.');
  });

  it('passes existing projected reasons as the reasons prompt initial value', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          reasons: ['Great Atmosphere', 'soundtrack'],
        }),
      },
    });
    let initialValue;

    await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 9,
      reasonsPrompt: async (config) => {
        initialValue = config.initialValue;
        return config.transform(config.initialValue);
      },
    });

    expect(initialValue).toBe('Great Atmosphere, soundtrack');
  });

  it('passes an empty notes prompt initial value when no notes exist', async () => {
    const rootDir = await createTempProject();
    let initialValue;

    await captureReactionSession({
      rootDir,
      reactionPrompt: async () => 9,
      notesPrompt: async (config) => {
        initialValue = config.initialValue;
        return config.transform(config.initialValue);
      },
    });

    expect(initialValue).toBe('');
  });

  it('preserves existing notes when the prefilled notes prompt is accepted', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          notes: 'Great visuals.',
        }),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 9,
      notesPrompt: async (config) =>
        config.transform(config.initialValue),
    });

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 9,
      notes: 'Great visuals.',
    });
  });

  it('preserves existing reasons when the prefilled reasons prompt is accepted', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          reasons: ['Great Atmosphere', 'soundtrack'],
        }),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 9,
      reasonsPrompt: async (config) =>
        config.transform(config.initialValue),
    });

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 9,
      reasons: ['great atmosphere', 'soundtrack'],
    });
  });

  it('replaces existing reasons when edited', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          reasons: ['Great Atmosphere', 'soundtrack'],
        }),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 9,
      reasonsPrompt: async (config) =>
        config.transform('Strong Emotional Payoff, soundtrack'),
    });

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 9,
      reasons: ['strong emotional payoff', 'soundtrack'],
    });
  });

  it('removes reasons from the new event when prefilled reasons are deleted', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          reasons: ['Great Atmosphere', 'soundtrack'],
        }),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 7,
      reasonsPrompt: async (config) => config.transform(''),
    });

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 7,
    });
    expect(result.bufferedEvents[0]).not.toHaveProperty('reasons');
  });

  it('writes edited prefilled notes', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          notes: 'Great visuals.',
        }),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 9,
      notesPrompt: async (config) =>
        config.transform(`${config.initialValue} Strong soundtrack.`),
    });

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 9,
      notes: 'Great visuals. Strong soundtrack.',
    });
  });

  it('removes notes from the new event when prefilled notes are deleted', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          notes: 'Great visuals.',
        }),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 7,
      notesPrompt: async (config) => config.transform(''),
    });

    expect(result.bufferedEvents[0]).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 7,
    });
    expect(result.bufferedEvents[0]).not.toHaveProperty('notes');
  });

  it('omits empty optional notes', async () => {
    const event = createTitleReactionEvent(
      testCatalog()['imdb:tt001'],
      8,
      { notes: '' },
    );

    expect(event).not.toHaveProperty('notes');
  });

  it('omits whitespace-only optional notes', async () => {
    const event = createTitleReactionEvent(
      testCatalog()['imdb:tt001'],
      8,
      { notes: '   ' },
    );

    expect(event).not.toHaveProperty('notes');
  });

  it('omits null optional notes', async () => {
    const event = createTitleReactionEvent(
      testCatalog()['imdb:tt001'],
      8,
      { notes: null },
    );

    expect(event).not.toHaveProperty('notes');
  });

  it('omits empty optional reasons', async () => {
    const event = createTitleReactionEvent(
      testCatalog()['imdb:tt001'],
      8,
      { reasons: ' , , ' },
    );

    expect(event).not.toHaveProperty('reasons');
  });

  it('uses default limit 1 for a reaction session', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      random: () => 0.999,
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
      eventsWritten: 1,
    });
    expect(result.bufferedEvents).toHaveLength(1);
    expect(result.bufferedEvents[0]).toMatchObject({
      type: 'title.reaction.updated',
      canonicalId: 'imdb:tt003',
      title: 'Gamma',
      rating: 8,
    });
    expect(output.join('\n')).toContain('Gamma (2003)');
    expect(output.join('\n')).not.toContain('Alpha (2001)');
    expect(output.join('\n')).not.toContain('Beta (2002)');
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toContain('"canonicalId":"imdb:tt003"');
  });

  it('uses random title selection by default for --limit n', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const randomValues = [0.999, 0, 0];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--limit', '3'],
      random: () => randomValues.shift(),
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 3,
    });
    expect(
      result.bufferedEvents.map((event) => event.canonicalId),
    ).toEqual(['imdb:tt003', 'imdb:tt001', 'imdb:tt002']);
  });

  it('excludes ignored titles from --limit workflows', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      ignored: {
        'imdb:tt002': ignoredTitle('imdb:tt002'),
      },
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '3'],
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
      eventsWritten: 2,
    });
    expect(
      result.bufferedEvents.map((event) => event.canonicalId),
    ).toEqual(['imdb:tt001', 'imdb:tt003']);
    expect(output.join('\n')).not.toContain('Beta (2002)');
  });

  it('supports --ordered --limit n session selection behavior', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = [8, 5, 1];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '3'],
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

  it('does not surface movie titles in a TV-only session', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--tv', '--limit', '5'],
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt002',
        title: 'Beta',
      }),
    ]);
    expect(output.join('\n')).toContain('Beta (2002)');
    expect(output.join('\n')).not.toContain('Alpha (2001)');
    expect(output.join('\n')).not.toContain('Gamma (2003)');
  });

  it('selects a TV-only session title from a projection with a TV alias', async () => {
    const rootDir = await createTempProject({
      catalog: catalogWithTvAlias(),
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--tv'],
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt011',
        title: 'Show Candidate',
      }),
    ]);
    expect(output.join('\n')).toContain('Show Candidate (2011)');
    expect(output.join('\n')).not.toContain(
      'No eligible-unreacted titles found.',
    );
    expect(output.join('\n')).not.toContain('Movie Candidate (2010)');
  });

  it('does not surface TV titles in a movie-only session', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--movies', '--limit', '5'],
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
    });
    expect(
      result.bufferedEvents.map((event) => event.canonicalId),
    ).toEqual(['imdb:tt001', 'imdb:tt003']);
    expect(output.join('\n')).toContain('Alpha (2001)');
    expect(output.join('\n')).toContain('Gamma (2003)');
    expect(output.join('\n')).not.toContain('Beta (2002)');
  });

  it('supports --limit none until no eligible titles remain', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--limit', 'none'],
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 3,
    });
    expect(result.bufferedEvents).toHaveLength(3);
  });

  it('supports --limit n with random mode without reselecting in-session titles', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--limit', '3'],
      reactionPrompt: async () => 8,
    });
    const selectedIds = result.bufferedEvents.map(
      (event) => event.canonicalId,
    );

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 3,
    });
    expect(new Set(selectedIds)).toHaveProperty('size', 3);
    expect(selectedIds.sort()).toEqual([
      'imdb:tt001',
      'imdb:tt002',
      'imdb:tt003',
    ]);
  });

  it('supports --random with --movies from only the movie candidate set', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const randomValues = [0.999, 0];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--movies', '--limit', '2'],
      random: () => randomValues.shift(),
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
    });
    expect(
      result.bufferedEvents.map((event) => event.canonicalId),
    ).toEqual(['imdb:tt003', 'imdb:tt001']);
    expect(
      result.bufferedEvents.every((event) =>
        ['imdb:tt001', 'imdb:tt003'].includes(event.canonicalId),
      ),
    ).toBe(true);
  });

  it('supports --random with --tv from only the TV candidate set', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--tv', '--limit', '5'],
      random: () => 0.999,
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt002',
        title: 'Beta',
      }),
    ]);
  });

  it('uses the random selector during random-mode session selection', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const randomValues = [0.999, 0];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--limit', '2'],
      random: () => randomValues.shift(),
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
    });
    expect(
      result.bufferedEvents.map((event) => event.canonicalId),
    ).toEqual(['imdb:tt003', 'imdb:tt001']);
  });

  it('supports --limit none with random mode until no eligible titles remain', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--limit', 'none'],
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 3,
      eventsWritten: 3,
    });
    expect(
      new Set(result.bufferedEvents.map((event) => event.canonicalId)),
    ).toHaveProperty('size', 3);
  });

  it('does not create an event for skip and advances session progress', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['skip', 8];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '2'],
      reactionPrompt: async () => reactions.shift(),
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt002',
        title: 'Beta',
        rating: 8,
      }),
    ]);
    expect(output.join('\n')).toContain('Alpha (2001)');
    expect(output.join('\n')).toContain('Beta (2002)');
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.not.toContain('title.ignored');
    await expect(
      fs.readFile(
        path.join(rootDir, 'data', 'title-ignored.json'),
        'utf8',
      ),
    ).resolves.toBe('{}\n');
  });

  it('creates an ignored title event from the ignore action', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '1'],
      reactionPrompt: async () => 'ignore',
    });
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    const ignoredProjection = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'title-ignored.json'),
        'utf8',
      ),
    );

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
      eventsWritten: 1,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt001',
        title: 'Alpha',
        type: 'title.ignored',
      }),
    ]);
    expect(result.bufferedEvents[0]).not.toHaveProperty('rating');
    expect(eventText).toContain('"type":"title.ignored"');
    expect(eventText).toContain('"canonicalId":"imdb:tt001"');
    expect(ignoredProjection).toMatchObject({
      'imdb:tt001': {
        canonicalId: 'imdb:tt001',
      },
    });
    expect(output.join('\n')).toContain(
      'Wrote 0 title reaction event(s).',
    );
    expect(output.join('\n')).toContain(
      'Wrote 1 title ignore event(s).',
    );
    expect(output.join('\n')).toContain(
      '- Alpha: ignored (imdb:tt001)',
    );
  });

  it('does not request notes or reasons for the ignore action', async () => {
    const rootDir = await createTempProject();
    let notesPrompted = false;
    let reasonsPrompted = false;

    await captureReactionSession({
      rootDir,
      args: ['--ordered'],
      reactionPrompt: async () => 'ignore',
      notesPrompt: async () => {
        notesPrompted = true;
        throw new Error('notes should not be requested');
      },
      reasonsPrompt: async () => {
        reasonsPrompted = true;
        throw new Error('reasons should not be requested');
      },
    });

    expect(notesPrompted).toBe(false);
    expect(reasonsPrompted).toBe(false);
  });

  it('removes ignored titles from future candidate selection', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    await captureReactionSession({
      rootDir,
      args: ['--ordered'],
      reactionPrompt: async () => 'ignore',
    });

    await expect(
      selectReactionTitle({ rootDir, ordered: true }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt002',
      title: 'Beta',
    });
  });

  it('continues normally after ignore until the session limit is reached', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['ignore', 8];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '2'],
      reactionPrompt: async () => reactions.shift(),
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
      eventsWritten: 2,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt001',
        type: 'title.ignored',
      }),
      expect.objectContaining({
        canonicalId: 'imdb:tt002',
        type: 'title.reaction.updated',
        rating: 8,
      }),
    ]);
    expect(output.join('\n')).toContain('Alpha (2001)');
    expect(output.join('\n')).toContain('Beta (2002)');
    expect(output.join('\n')).toContain(
      'Wrote 1 title reaction event(s).',
    );
    expect(output.join('\n')).toContain(
      'Wrote 1 title ignore event(s).',
    );
  });

  it('counts ignore actions toward the session limit', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '1'],
      reactionPrompt: async () => 'ignore',
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
      eventsWritten: 1,
    });
    expect(output.join('\n')).toContain('Alpha (2001)');
    expect(output.join('\n')).not.toContain('Beta (2002)');
  });

  it('prevents random-mode skipped titles from being reselected during the same session', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['skip', 8];
    const promptedTitles = [];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--limit', '2'],
      reactionPrompt: async () => reactions.shift(),
      writeOutput: (message) => {
        if (message.includes('\n') && !message.startsWith('Wrote ')) {
          promptedTitles.push(message);
        }
      },
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 2,
      eventsWritten: 1,
    });
    expect(promptedTitles).toHaveLength(2);
    expect(new Set(promptedTitles)).toHaveProperty('size', 2);
    expect(result.bufferedEvents[0].title).not.toBe(
      promptedTitles[0].split('\n')[0].replace(/ \(\d{4}\)$/, ''),
    );
  });

  it('quit abort discards the session buffer', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = [8, 'quit'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '3'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'abort',
    });

    expect(result).toEqual({
      status: 'aborted',
      bufferedEvents: [],
      processedCount: 1,
    });
    expect(output.join('\n')).toContain(
      'Reaction session aborted. No events were written.',
    );
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('random-mode abort writes nothing', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = [8, 'quit'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--limit', '3'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'abort',
    });

    expect(result).toEqual({
      status: 'aborted',
      bufferedEvents: [],
      processedCount: 1,
    });
    expect(output.join('\n')).toContain(
      'Reaction session aborted. No events were written.',
    );
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('quit save and quit writes buffer and excludes the current title', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = [8, 'quit'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '3'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'save-and-quit',
    });
    const text = output.join('\n');

    expect(result).toMatchObject({
      status: 'saved-and-quit',
      processedCount: 1,
      eventsWritten: 1,
    });
    expect(result.bufferedEvents).toHaveLength(1);
    expect(text).toContain('Wrote 1 title reaction event(s).');
    expect(text).toContain('Alpha: rating 8/10 (imdb:tt001)');
    expect(text).not.toContain('imdb:tt002');
    expect(text).toContain(
      'Save & Quit selected. Current title was not written: Beta.',
    );
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    expect(eventText).toContain('"canonicalId":"imdb:tt001"');
    expect(eventText).not.toContain('imdb:tt002');
  });

  it('random-mode save and quit preserves buffered write behavior', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = [8, 'quit'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--random', '--limit', '3'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'save-and-quit',
    });
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );

    expect(result).toMatchObject({
      status: 'saved-and-quit',
      processedCount: 1,
      eventsWritten: 1,
    });
    expect(result.bufferedEvents).toHaveLength(1);
    expect(output.join('\n')).toContain(
      'Wrote 1 title reaction event(s).',
    );
    expect(eventText).toContain(
      `"canonicalId":"${result.bufferedEvents[0].canonicalId}"`,
    );
  });

  it('quit cancel returns to the same title prompt', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const reactions = ['quit', 5];
    const promptedTitles = [];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '1'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'cancel',
      writeOutput: (message) => promptedTitles.push(message),
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt001',
        title: 'Alpha',
        rating: 5,
      }),
    ]);
    expect(
      promptedTitles.filter((message) =>
        message.includes('Alpha (2001)'),
      ),
    ).toHaveLength(1);
  });

  it('handles mixed sessions with ratings ignores skips and quit', async () => {
    const rootDir = await createTempProject({
      catalog: {
        ...extendedCatalog(),
        'imdb:tt004': {
          canonicalId: 'imdb:tt004',
          mediaType: 'movie',
          title: 'Delta',
          releaseYear: 2004,
          genres: ['Drama'],
        },
      },
    });
    const reactions = [8, 'ignore', 'skip', 'quit'];

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '4'],
      reactionPrompt: async () => reactions.shift(),
      quitPrompt: async () => 'save-and-quit',
    });
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    const events = eventText
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(result).toMatchObject({
      status: 'saved-and-quit',
      processedCount: 3,
      eventsWritten: 2,
    });
    expect(events.map((event) => event.type)).toEqual([
      'title.reaction.updated',
      'title.ignored',
    ]);
    expect(events.map((event) => event.canonicalId)).toEqual([
      'imdb:tt001',
      'imdb:tt002',
    ]);
    expect(eventText).not.toContain('imdb:tt003');
    expect(eventText).not.toContain('imdb:tt004');
    expect(output.join('\n')).toContain(
      'Wrote 1 title reaction event(s).',
    );
    expect(output.join('\n')).toContain(
      'Wrote 1 title ignore event(s).',
    );
    expect(output.join('\n')).toContain(
      'Save & Quit selected. Current title was not written: Delta.',
    );
  });

  it('excludes titles already reacted during the current run', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '2'],
      reactionPrompt: async () => 8,
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
      args: ['--ordered', '--limit', '1'],
      reactionPrompt: async () => 8,
    });

    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt002',
        title: 'Beta',
        rating: 8,
      }),
    ]);
  });

  it('keeps reset titles eligible unless they are ignored', async () => {
    const resetProjectionRootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt002': reaction('imdb:tt002'),
      },
    });
    const ignoredResetProjectionRootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt002': reaction('imdb:tt002'),
      },
      ignored: {
        'imdb:tt001': ignoredTitle('imdb:tt001'),
      },
    });

    await expect(
      selectReactionTitle({
        rootDir: resetProjectionRootDir,
        ordered: true,
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt001',
      title: 'Alpha',
    });
    await expect(
      selectReactionTitle({
        rootDir: ignoredResetProjectionRootDir,
        ordered: true,
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt003',
      title: 'Gamma',
    });
  });

  it('selects only eligible-unreacted titles from mixed reacted and ignored catalogs', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
      ignored: {
        'imdb:tt002': ignoredTitle('imdb:tt002'),
      },
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '3'],
      reactionPrompt: async () => 9,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
      eventsWritten: 1,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt003',
        title: 'Gamma',
        rating: 9,
      }),
    ]);
    expect(output.join('\n')).not.toContain('Alpha (2001)');
    expect(output.join('\n')).not.toContain('Beta (2002)');
  });

  it('reacts to a valid canonical ID and ignores normal unreacted selection', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });

    await expect(
      findReactionTitleById({ rootDir, canonicalId: 'imdb:tt003' }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt003',
      title: 'Gamma',
    });

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt003'],
      reactionPrompt: async () => 8,
    });

    expect(result).toMatchObject({
      status: 'completed',
      processedCount: 1,
      eventsWritten: 1,
    });
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt003',
        title: 'Gamma',
        rating: 8,
      }),
    ]);
    expect(output.join('\n')).toContain('Gamma (2003)');
    expect(output.join('\n')).not.toContain('Beta (2002)');
  });

  it('rejects ignored title targeting by ID before prompting for a rating', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      ignored: {
        'imdb:tt003': ignoredTitle('imdb:tt003'),
      },
    });
    let prompted = false;

    await expect(
      captureReactionSession({
        rootDir,
        args: ['--id', 'imdb:tt003'],
        reactionPrompt: async () => {
          prompted = true;
          return 8;
        },
      }),
    ).rejects.toThrow(
      'Gamma (imdb:tt003) is currently ignored and cannot be rated. Unignore the title before rating it.',
    );
    expect(prompted).toBe(false);
    expect(
      formatIgnoredTitleRateError(extendedCatalog()['imdb:tt003']),
    ).toBe(
      'Gamma (imdb:tt003) is currently ignored and cannot be rated. Unignore the title before rating it.',
    );
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('continues to rate non-ignored titles by ID when another title is ignored', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      ignored: {
        'imdb:tt002': ignoredTitle('imdb:tt002'),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt003'],
      reactionPrompt: async () => 8,
    });

    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt003',
        title: 'Gamma',
        rating: 8,
      }),
    ]);
  });

  it('ID targeting bypasses random behavior', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: {
        limit: 1,
        movies: false,
        tv: false,
        random: true,
        id: 'imdb:tt001',
        search: false,
      },
      reactionPrompt: async () => 10,
    });

    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt001',
        title: 'Alpha',
        rating: 10,
      }),
    ]);
  });

  it('fails invalid ID targeting without writing events', async () => {
    const rootDir = await createTempProject();

    await expect(
      captureReactionSession({
        rootDir,
        args: {
          limit: 1,
          movies: false,
          tv: false,
          random: false,
          id: '   ',
          search: false,
        },
        reactionPrompt: async () => 8,
      }),
    ).rejects.toThrow(
      'Invalid canonical ID. Provide a non-empty canonical ID.',
    );
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('fails missing ID targeting without writing events', async () => {
    const rootDir = await createTempProject();

    await expect(
      captureReactionSession({
        rootDir,
        args: ['--id', 'imdb:missing'],
        reactionPrompt: async () => 8,
      }),
    ).rejects.toThrow(
      'No catalog title found for canonical ID: imdb:missing',
    );
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('re-reacts to an already reacted title by ID append-only and updates projection', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });
    const existingEvent =
      '{"eventId":"evt-existing","type":"title.reaction.updated","occurredAt":"2026-06-09T12:00:00.000Z","canonicalId":"imdb:tt001","rating":3}\n';
    await fs.writeFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      existingEvent,
      'utf8',
    );

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--id', 'imdb:tt001'],
      reactionPrompt: async () => 10,
    });
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    const eventLines = eventText.trim().split('\n');
    const projection = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'title-reactions.json'),
        'utf8',
      ),
    );

    expect(result.eventsWritten).toBe(1);
    expect(eventText.startsWith(existingEvent)).toBe(true);
    expect(eventLines).toHaveLength(2);
    expect(
      eventLines.map((line) => JSON.parse(line).canonicalId),
    ).toEqual(['imdb:tt001', 'imdb:tt001']);
    expect(projection['imdb:tt001']).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 10,
    });
    expect(projection['imdb:tt001'].eventIds).toHaveLength(2);
  });

  it('rejects ignoring a reacted title with an actionable reset message', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt001': reaction('imdb:tt001'),
      },
    });
    let notesPrompted = false;
    let reasonsPrompted = false;

    await expect(
      captureReactionSession({
        rootDir,
        args: ['--id', 'imdb:tt001'],
        reactionPrompt: async () => 'ignore',
        notesPrompt: async () => {
          notesPrompted = true;
          return null;
        },
        reasonsPrompt: async () => {
          reasonsPrompted = true;
          return null;
        },
      }),
    ).rejects.toThrow(
      'Alpha (imdb:tt001) currently has a reaction and cannot be ignored. Reset the reaction before ignoring it.',
    );
    expect(notesPrompted).toBe(false);
    expect(reasonsPrompted).toBe(false);
    expect(
      formatReactedTitleIgnoreError(extendedCatalog()['imdb:tt001']),
    ).toBe(
      'Alpha (imdb:tt001) currently has a reaction and cannot be ignored. Reset the reaction before ignoring it.',
    );
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('searches the catalog and reacts to the selected result', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const output = [];

    await expect(
      searchReactionCatalog({ rootDir, query: 'ga' }),
    ).resolves.toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt003',
        title: 'Gamma',
      }),
    ]);

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => 'ga',
        selectionPrompt: async ({ choices }) => choices[0].value,
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt003',
      title: 'Gamma',
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--search'],
      searchPrompt: async () => 'ga',
      selectionPrompt: async ({ choices }) => choices[0].value,
      reactionPrompt: async () => 5,
    });

    expect(output.join('\n')).toContain(
      '[1] Gamma (2003) | Movie | imdb:tt003',
    );
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt003',
        title: 'Gamma',
        rating: 5,
      }),
    ]);
  });

  it('excludes ignored titles from default search results', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      ignored: {
        'imdb:tt003': ignoredTitle('imdb:tt003'),
      },
    });
    const output = [];
    let promptedChoices = [];

    await expect(
      searchReactionCatalog({ rootDir, query: 'ga' }),
    ).resolves.toEqual([]);
    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => 'a',
        selectionPrompt: async ({ choices }) => {
          promptedChoices = choices;
          return choices[0].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:tt001',
      title: 'Alpha',
    });

    expect(promptedChoices.map((choice) => choice.value)).toEqual([
      'imdb:tt001',
      'imdb:tt002',
    ]);
    expect(output.join('\n')).toContain(
      '[1] Alpha (2001) | Movie | imdb:tt001',
    );
    expect(output.join('\n')).toContain(
      '[2] Beta (2002) | Series | imdb:tt002',
    );
    expect(output.join('\n')).not.toContain('Gamma');
  });

  it('search targeting bypasses random behavior', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt003': reaction('imdb:tt003'),
      },
    });

    const { result } = await captureReactionSession({
      rootDir,
      args: {
        limit: 1,
        movies: false,
        tv: false,
        random: true,
        id: null,
        search: true,
      },
      searchPrompt: async () => 'gamma',
      selectionPrompt: async ({ choices }) => choices[0].value,
      reactionPrompt: async () => 5,
    });

    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt003',
        title: 'Gamma',
        rating: 5,
      }),
    ]);
  });

  it('selects from search results larger than the single-key range', async () => {
    const rootDir = await createTempProject({
      catalog: largeSearchCatalog(),
    });
    const output = [];
    let promptedChoices = [];

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => 'Match',
        searchResultThreshold: 36,
        selectionPrompt: async ({ choices }) => {
          promptedChoices = choices;
          return choices[35].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:match36',
      title: 'Match 36',
    });

    expect(promptedChoices).toHaveLength(36);
    expect(promptedChoices[35]).toMatchObject({
      key: '36',
      value: 'imdb:match36',
    });
    expect(output.join('\n')).toContain(
      '[36] Match 36 (2035) | Movie | imdb:match36',
    );
  });

  it('displays search results below the configured threshold', async () => {
    const rootDir = await createTempProject({
      catalog: largeSearchCatalog(24),
    });
    const output = [];
    let promptedChoices = [];

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => 'Match',
        searchResultThreshold: 25,
        selectionPrompt: async ({ choices }) => {
          promptedChoices = choices;
          return choices[23].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:match24',
      title: 'Match 24',
    });

    expect(promptedChoices).toHaveLength(24);
    expect(output.join('\n')).toContain(
      '[o] Match 24 (2023) | Movie | imdb:match24',
    );
    expect(output.join('\n')).not.toContain('Too many titles found');
  });

  it('displays search results exactly equal to the configured threshold', async () => {
    const rootDir = await createTempProject({
      catalog: largeSearchCatalog(25),
    });
    const output = [];
    let promptedChoices = [];

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => 'Match',
        searchResultThreshold: 25,
        selectionPrompt: async ({ choices }) => {
          promptedChoices = choices;
          return choices[24].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:match25',
      title: 'Match 25',
    });

    expect(promptedChoices).toHaveLength(25);
    expect(output.join('\n')).toContain(
      '[p] Match 25 (2024) | Movie | imdb:match25',
    );
    expect(output.join('\n')).not.toContain('Too many titles found');
  });

  it('does not display candidate lists above the configured threshold', async () => {
    const rootDir = await createTempProject({
      catalog: largeSearchCatalog(26),
    });
    const output = [];
    let searchCount = 0;
    let selectionPrompted = false;

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => {
          searchCount += 1;
          if (searchCount > 1) {
            throw new Error('user cancelled');
          }
          return 'Match';
        },
        searchResultThreshold: 25,
        selectionPrompt: async () => {
          selectionPrompted = true;
          return 'imdb:match01';
        },
        writeOutput: (message) => output.push(message),
      }),
    ).rejects.toThrow('user cancelled');

    expect(selectionPrompted).toBe(false);
    expect(searchCount).toBe(2);
    expect(output).toEqual([
      'Too many titles found (26). Please refine your search.',
    ]);
    expect(output.join('\n')).not.toContain('Match 01');
  });

  it('re-prompts after an above-threshold search and accepts a refined search', async () => {
    const rootDir = await createTempProject({
      catalog: largeSearchCatalog(26),
    });
    const output = [];
    const searches = ['Match', 'Match 26'];
    let promptedChoices = [];

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => searches.shift(),
        searchResultThreshold: 25,
        selectionPrompt: async ({ choices }) => {
          promptedChoices = choices;
          return choices[0].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toMatchObject({
      canonicalId: 'imdb:match26',
      title: 'Match 26',
    });

    expect(promptedChoices).toEqual([
      {
        key: '1',
        name: 'Match 26 (2025) | Movie | imdb:match26',
        value: 'imdb:match26',
      },
    ]);
    expect(output).toEqual([
      'Too many titles found (26). Please refine your search.',
      '[1] Match 26 (2025) | Movie | imdb:match26',
    ]);
  });

  it('cancels search on empty input without showing results or selection prompts', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const output = [];
    let selectionPrompted = false;

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => '',
        selectionPrompt: async ({ choices }) => {
          selectionPrompted = true;
          return choices[0].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBeNull();

    expect(selectionPrompted).toBe(false);
    expect(output).toEqual(['Search cancelled.']);
  });

  it('cancels search on space-only input without showing results or selection prompts', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const output = [];
    let selectionPrompted = false;

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--search'],
      searchPrompt: async () => '   ',
      selectionPrompt: async ({ choices }) => {
        selectionPrompted = true;
        return choices[0].value;
      },
      reactionPrompt: async () => 8,
      writeOutput: (message) => output.push(message),
    });

    expect(result).toEqual({
      status: 'cancelled',
      bufferedEvents: [],
      eventsWritten: 0,
      processedCount: 0,
    });
    expect(selectionPrompted).toBe(false);
    expect(output).toEqual(['Search cancelled.']);
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('cancels search on tab and newline whitespace input', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const output = [];
    let selectionPrompted = false;

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => '\t\n',
        selectionPrompt: async ({ choices }) => {
          selectionPrompted = true;
          return choices[0].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBeNull();

    expect(selectionPrompted).toBe(false);
    expect(output).toEqual(['Search cancelled.']);
  });

  it('cancels search when blank input follows an above-threshold re-prompt', async () => {
    const rootDir = await createTempProject({
      catalog: largeSearchCatalog(26),
    });
    const output = [];
    const searches = ['Match', ''];
    let selectionPrompted = false;

    await expect(
      selectReactionTitleFromSearch({
        rootDir,
        searchPrompt: async () => searches.shift(),
        searchResultThreshold: 25,
        selectionPrompt: async ({ choices }) => {
          selectionPrompted = true;
          return choices[0].value;
        },
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBeNull();

    expect(selectionPrompted).toBe(false);
    expect(output).toEqual([
      'Too many titles found (26). Please refine your search.',
      'Search cancelled.',
    ]);
    expect(output.join('\n')).not.toContain('Match 01');
  });

  it('uses the .env search result threshold for search sessions', async () => {
    const rootDir = await createTempProject({
      catalog: largeSearchCatalog(3),
    });
    await fs.writeFile(
      path.join(rootDir, '.env'),
      'REACTION_SEARCH_RESULT_THRESHOLD=2\n',
      'utf8',
    );
    const output = [];
    const searches = ['Match', 'Match 03'];

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--search'],
      searchPrompt: async () => searches.shift(),
      selectionPrompt: async ({ choices }) => choices[0].value,
      reactionPrompt: async () => 8,
      writeOutput: (message) => output.push(message),
    });

    expect(output).toEqual([
      'Too many titles found (3). Please refine your search.',
      '[1] Match 03 (2002) | Movie | imdb:match03',
      ['Match 03 (2002)', 'Movie · Drama'].join('\n'),
      [
        'Wrote 1 title reaction event(s).',
        'Wrote 0 title ignore event(s).',
        '- Match 03: rating 8/10 (imdb:match03)',
        '',
        'Files changed:',
        '- events/title-reactions.events.ndjson',
        '- data/title-reactions.json',
        '',
        'Next:',
        'git diff',
        'git add events/title-reactions.events.ndjson data/title-reactions.json',
        'git commit -m "Add movie reactions"',
      ].join('\n'),
    ]);
    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:match03',
        title: 'Match 03',
        rating: 8,
      }),
    ]);
  });

  it('search selection supports re-reaction', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', {
          rating: 3,
          reasons: ['mcu', 'action'],
          notes: 'Great ending.',
        }),
      },
    });
    const existingEvent =
      '{"eventId":"evt-existing","type":"title.reaction.updated","occurredAt":"2026-06-09T12:00:00.000Z","canonicalId":"imdb:tt001","rating":3}\n';
    await fs.writeFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      existingEvent,
      'utf8',
    );

    const { output, result } = await captureReactionSession({
      rootDir,
      args: ['--search'],
      searchPrompt: async () => 'alpha',
      selectionPrompt: async ({ choices }) => choices[0].value,
      reactionPrompt: async () => 1,
    });
    const projection = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'title-reactions.json'),
        'utf8',
      ),
    );

    expect(result.bufferedEvents).toEqual([
      expect.objectContaining({
        canonicalId: 'imdb:tt001',
        rating: 1,
      }),
    ]);
    expect(output).toContain(
      [
        'Existing reaction found.',
        '',
        'Rating: 3/10',
        'Reasons: mcu, action',
        'Notes: Great ending.',
      ].join('\n'),
    );
    expect(projection['imdb:tt001']).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 1,
    });
    expect(projection['imdb:tt001'].eventIds).toHaveLength(2);
  });

  it('fails missing-result search paths without writing events', async () => {
    const rootDir = await createTempProject();

    await expect(
      captureReactionSession({
        rootDir,
        args: ['--search'],
        searchPrompt: async () => 'missing',
        selectionPrompt: async ({ choices }) => choices[0].value,
        reactionPrompt: async () => 8,
      }),
    ).rejects.toThrow('No catalog titles found for search: missing');
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('writes events append-only and rebuilds the projection on completion', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });
    const existingEvent =
      '{"eventId":"evt-existing","type":"title.reaction.updated","occurredAt":"2026-06-09T12:00:00.000Z","canonicalId":"imdb:tt003","rating":10}\n';
    await fs.writeFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      existingEvent,
      'utf8',
    );
    const catalogBefore = await fs.readFile(
      path.join(rootDir, 'data', 'catalog.json'),
      'utf8',
    );

    const { result } = await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '2'],
      reactionPrompt: async () => 8,
    });
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    const eventLines = eventText.trim().split('\n');
    const projection = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'title-reactions.json'),
        'utf8',
      ),
    );

    expect(result.eventsWritten).toBe(2);
    expect(eventText.startsWith(existingEvent)).toBe(true);
    expect(eventLines).toHaveLength(3);
    expect(
      eventLines.map((line) => JSON.parse(line).canonicalId),
    ).toEqual(['imdb:tt003', 'imdb:tt001', 'imdb:tt002']);
    expect(projection['imdb:tt001']).toMatchObject({
      canonicalId: 'imdb:tt001',
      rating: 8,
    });
    expect(projection['imdb:tt002']).toMatchObject({
      canonicalId: 'imdb:tt002',
      rating: 8,
    });
    await expect(
      fs.readFile(path.join(rootDir, 'data', 'catalog.json'), 'utf8'),
    ).resolves.toBe(catalogBefore);
  });

  it('does not duplicate writes from a single session', async () => {
    const rootDir = await createTempProject({
      catalog: extendedCatalog(),
    });

    await captureReactionSession({
      rootDir,
      args: ['--ordered', '--limit', '2'],
      reactionPrompt: async () => 8,
    });
    const eventText = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );

    expect(eventText.trim().split('\n')).toHaveLength(2);
  });
});
