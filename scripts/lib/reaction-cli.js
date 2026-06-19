import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createPrompt,
  makeTheme,
  useKeypress,
  usePrefix,
  useState,
} from '@inquirer/core';
import { Command, InvalidArgumentError, Option } from 'commander';
import { CatalogBuildError } from './catalog-build-error.js';
import {
  createCatalogTitleSearchFilters,
  readCatalog,
  searchCatalog,
  showCatalogItem,
} from './catalog-query.js';
import { isNonEmptyString } from './catalog-utils.js';
import {
  appendTitleReactionEvents,
  buildTitleReactions,
  normalizeReactionReasons,
  titleIgnoredEventType,
  titleReactionEventType,
} from './title-reactions.js';
import { ratingForReaction, ratingScale } from './reaction-ratings.js';
import { loadRepoEnv } from './local-env.js';

const defaultLimit = 1;
export const DEFAULT_HTML_LIMIT = 100;
const defaultSearchResultThreshold = 25;
const searchResultThresholdEnvVar = 'REACTION_SEARCH_RESULT_THRESHOLD';
export const reviewIndent = '  ';
export const reviewNestedIndent = `${reviewIndent}${reviewIndent}`;
export const reviewTopBilledActorLimit = 3;
export const reviewPlotWrapColumns = 72;
const reviewScreenSeparator = '\n';
const reactionControlOptions = [
  { key: 's', name: 'Skip', value: 'skip' },
  { key: 'i', name: 'Info', value: 'info' },
  { key: 'x', name: 'Ignore', value: 'ignore' },
  { key: 'q', name: 'Quit', value: 'quit' },
];

const quitConfirmationOptions = [
  { key: 'a', label: 'Abort', value: 'abort' },
  { key: 's', label: 'Save & Quit', value: 'save-and-quit' },
  { key: 'c', label: 'Cancel', value: 'cancel' },
];
const searchSelectionKeys = '123456789abcdefghijklmnopqrstuvwxyz'.split(
  '',
);

function uniqueNonEmptyStrings(values) {
  return [
    ...new Set(
      values.filter(
        (value) => typeof value === 'string' && value.length > 0,
      ),
    ),
  ];
}

function shellQuotePath(filePath) {
  return /^[A-Za-z0-9_./:-]+$/.test(filePath)
    ? filePath
    : `'${filePath.replaceAll("'", "'\\''")}'`;
}

const singleKeyChoicePrompt = createPrompt((config, done) => {
  const [status, setStatus] = useState('idle');
  const [selectedKey, setSelectedKey] = useState('');
  const [error, setError] = useState('');
  const theme = makeTheme(config.theme);
  const prefix = usePrefix({ status, theme });

  useKeypress((event, readline) => {
    const input = normalizeReactionInput(
      event.sequence ?? readline.line,
    );
    const selectedChoice = selectReactionChoiceByKey(
      config.choices,
      input,
    );

    if (selectedChoice) {
      setSelectedKey(selectedChoice.key);
      setStatus('done');
      done(selectedChoice.value);
      return;
    }

    setError(
      input
        ? `"${input}" is not an available choice.`
        : 'Press one of the visible choice keys.',
    );
  });

  const message = config.message
    ? theme.style.message(config.message, status)
    : '';

  if (status === 'done') {
    const selectedChoice = selectReactionChoiceByKey(
      config.choices,
      selectedKey,
    );
    if (config.bare === true) {
      return `> ${theme.style.answer(
        selectedChoice?.name ?? selectedKey,
      )}`;
    }
    return `${prefix} ${message} ${theme.style.answer(
      selectedChoice?.name ?? selectedKey,
    )}`;
  }

  if (config.bare === true) {
    const choices = config.formatChoices
      ? config.formatChoices(config.choices)
      : formatVisibleReactionChoices(config.choices);
    return error ? `${choices}\n${theme.style.error(error)}` : choices;
  }

  return [
    `${prefix} ${message}`,
    [
      config.formatChoices
        ? config.formatChoices(config.choices)
        : formatVisibleReactionChoices(config.choices),
      error ? theme.style.error(error) : '',
    ]
      .filter(Boolean)
      .join('\n'),
  ];
});

const singleLineTextPrompt = createPrompt((config, done) => {
  const [status, setStatus] = useState('idle');
  const initialValue = String(config.initialValue ?? '');
  const [value, setValue] = useState(initialValue);
  const [cursorIndex, setCursorIndex] = useState(initialValue.length);
  const [error, setError] = useState('');
  const theme = makeTheme(config.theme);
  const prefix = usePrefix({ status, theme });

  useKeypress((event) => {
    if (event.name === 'return' || event.name === 'enter') {
      const trimmed = value.trim();

      if (trimmed.length === 0 && config.allowEmpty !== true) {
        setError('Enter a search query.');
        return;
      }

      const validation = config.validate?.(trimmed);

      if (typeof validation === 'string') {
        setError(validation);
        return;
      }

      if (validation === false) {
        setError('Enter a valid value.');
        return;
      }

      setStatus('done');
      done(config.transform ? config.transform(trimmed) : trimmed);
      return;
    }

    if (event.name === 'backspace') {
      if (cursorIndex > 0) {
        setValue(
          `${value.slice(0, cursorIndex - 1)}${value.slice(cursorIndex)}`,
        );
        setCursorIndex(cursorIndex - 1);
      }
      setError('');
      return;
    }

    if (event.name === 'delete') {
      if (cursorIndex < value.length) {
        setValue(
          `${value.slice(0, cursorIndex)}${value.slice(cursorIndex + 1)}`,
        );
      }
      setError('');
      return;
    }

    if (event.name === 'left') {
      setCursorIndex(Math.max(0, cursorIndex - 1));
      return;
    }

    if (event.name === 'right') {
      setCursorIndex(Math.min(value.length, cursorIndex + 1));
      return;
    }

    if (event.name === 'home') {
      setCursorIndex(0);
      return;
    }

    if (event.name === 'end') {
      setCursorIndex(value.length);
      return;
    }

    if (event.sequence && event.sequence >= ' ') {
      setValue(
        `${value.slice(0, cursorIndex)}${event.sequence}${value.slice(
          cursorIndex,
        )}`,
      );
      setCursorIndex(cursorIndex + event.sequence.length);
      setError('');
    }
  });

  const message = theme.style.message(config.message, status);

  if (status === 'done') {
    return `${prefix} ${message} ${theme.style.answer(value.trim())}`;
  }

  return [
    `${prefix} ${message} ${value}`,
    error ? theme.style.error(error) : '',
  ]
    .filter(Boolean)
    .join('\n');
});

function normalizeReactionInput(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase();
}

export function selectReactionChoiceByKey(choices, input) {
  const key = normalizeReactionInput(input);
  return choices.find((choice) => choice.key === key) ?? null;
}

function parseLimit(value) {
  if (value === 'none') {
    return value;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new InvalidArgumentError(
      '--limit must be a positive integer or none',
    );
  }

  return Number(value);
}

function parseSearchResultThreshold(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return defaultSearchResultThreshold;
  }

  const normalized = String(value).trim();

  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new CatalogBuildError(
      `${searchResultThresholdEnvVar} must be a positive integer.`,
    );
  }

  return Number(normalized);
}

export function readReactionSearchResultThreshold(env = process.env) {
  return parseSearchResultThreshold(env[searchResultThresholdEnvVar]);
}

export function createReactionCommand() {
  return new Command()
    .name('react')
    .description('Record spoiler-free reactions for watched titles.')
    .usage('[options]')
    .helpOption('-h, --help', 'display help for command')
    .addOption(
      new Option('--limit <n>', 'number of titles to react to')
        .default(defaultLimit)
        .argParser(parseLimit),
    )
    .addOption(
      new Option('--movies', 'only include movie titles').conflicts(
        'tv',
      ),
    )
    .addOption(
      new Option('--tv', 'only include Series titles').conflicts(
        'movies',
      ),
    )
    .addOption(
      new Option(
        '--random',
        'randomize eligible title selection (default)',
      )
        .conflicts('ordered')
        .conflicts('id')
        .conflicts('search'),
    )
    .addOption(
      new Option('--ordered', 'use deterministic title ordering')
        .conflicts('random')
        .conflicts('id')
        .conflicts('search'),
    )
    .addOption(
      new Option(
        '--id <canonicalId>',
        'react to a specific canonical title ID',
      ).conflicts('search'),
    )
    .addOption(
      new Option(
        '--search',
        'search the catalog and react to a selected title',
      ).conflicts('id'),
    )
    .addOption(
      new Option(
        '--html',
        'generate a static HTML review artifact instead of using the CLI prompt',
      ),
    )
    .action(() => {});
}

export function parseReactionCliArgs(args) {
  const command = createReactionCommand();
  command.exitOverride();
  command.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  command.parse(args, { from: 'user' });

  const options = command.opts();
  const hasTargetSelector =
    Boolean(options.id) || Boolean(options.search);
  const html = Boolean(options.html);
  const limit =
    html && command.getOptionValueSource('limit') === 'default'
      ? DEFAULT_HTML_LIMIT
      : options.limit;

  return {
    limit,
    movies: Boolean(options.movies),
    tv: Boolean(options.tv),
    random: !hasTargetSelector && !options.ordered,
    ordered: Boolean(options.ordered),
    id: options.id ?? null,
    search: Boolean(options.search),
    html,
  };
}

export async function readReactionCatalog(options = {}) {
  return readCatalog(options);
}

export async function readReactionState({
  rootDir = process.cwd(),
  reactionsPath = path.join(rootDir, 'data', 'title-reactions.json'),
} = {}) {
  let text;

  try {
    text = await fs.readFile(reactionsPath, 'utf8');
  } catch (error) {
    throw new CatalogBuildError(
      `Unable to read title reaction state at ${reactionsPath}: ${error.message}`,
    );
  }

  try {
    const reactions = JSON.parse(text);

    if (
      !reactions ||
      typeof reactions !== 'object' ||
      Array.isArray(reactions)
    ) {
      throw new Error('title reaction state must be a JSON object');
    }

    return reactions;
  } catch (error) {
    throw new CatalogBuildError(
      `Invalid title reaction state JSON at ${reactionsPath}: ${error.message}`,
    );
  }
}

export async function readReactionIgnoredState({
  rootDir = process.cwd(),
  ignoredPath = path.join(rootDir, 'data', 'title-ignored.json'),
} = {}) {
  let text;

  try {
    text = await fs.readFile(ignoredPath, 'utf8');
  } catch (error) {
    throw new CatalogBuildError(
      `Unable to read ignored title state at ${ignoredPath}: ${error.message}`,
    );
  }

  try {
    const ignored = JSON.parse(text);

    if (
      !ignored ||
      typeof ignored !== 'object' ||
      Array.isArray(ignored)
    ) {
      throw new Error('ignored title state must be a JSON object');
    }

    return ignored;
  } catch (error) {
    throw new CatalogBuildError(
      `Invalid ignored title state JSON at ${ignoredPath}: ${error.message}`,
    );
  }
}

export async function findReactionTitleById({
  rootDir = process.cwd(),
  canonicalId,
} = {}) {
  if (!isNonEmptyString(canonicalId)) {
    throw new CatalogBuildError(
      'Invalid canonical ID. Provide a non-empty canonical ID.',
    );
  }

  const item = await showCatalogItem({
    rootDir,
    canonicalId: canonicalId.trim(),
  });

  if (!item) {
    throw new CatalogBuildError(
      `No catalog title found for canonical ID: ${canonicalId.trim()}`,
    );
  }

  return item;
}

export function getReactedTitleIds(reactions) {
  return new Set(Object.keys(reactions));
}

export function getIgnoredTitleIds(ignored) {
  return new Set(Object.keys(ignored));
}

export function formatIgnoredTitleRateError(item) {
  return `${item.title} (${item.canonicalId}) is currently ignored and cannot be rated. Unignore the title before rating it.`;
}

export function assertTitleIsRateable(item, ignored) {
  if (getIgnoredTitleIds(ignored).has(item.canonicalId)) {
    throw new CatalogBuildError(formatIgnoredTitleRateError(item));
  }
}

function normalizeReactionMediaType(mediaType) {
  if (typeof mediaType !== 'string') {
    return null;
  }

  const normalized = mediaType.trim().toLowerCase();

  if (normalized === 'movie') {
    return 'movie';
  }

  if (
    normalized === 'series' ||
    normalized === 'tv' ||
    normalized === 'television' ||
    normalized === 'show'
  ) {
    return 'series';
  }

  return null;
}

function matchesReactionMediaTypeFilter(item, options = {}) {
  const mediaType = normalizeReactionMediaType(item.mediaType);

  if (options.movies) {
    return mediaType === 'movie';
  }

  if (options.tv) {
    return mediaType === 'series';
  }

  return true;
}

export function selectEligibleReactionTitles(
  catalog,
  reactions,
  excludedTitleIds = new Set(),
  options = {},
) {
  const reactedTitleIds = new Set([
    ...getReactedTitleIds(reactions),
    ...excludedTitleIds,
  ]);

  return Object.values(catalog).filter(
    (item) =>
      !reactedTitleIds.has(item.canonicalId) &&
      matchesReactionMediaTypeFilter(item, options),
  );
}

export function selectFirstUnreactedTitle(
  catalog,
  reactions,
  excludedTitleIds = new Set(),
  options = {},
) {
  return (
    selectEligibleReactionTitles(
      catalog,
      reactions,
      excludedTitleIds,
      options,
    )[0] ?? null
  );
}

export function selectRandomUnreactedTitle(
  catalog,
  reactions,
  excludedTitleIds = new Set(),
  random = Math.random,
  options = {},
) {
  const eligibleTitles = selectEligibleReactionTitles(
    catalog,
    reactions,
    excludedTitleIds,
    options,
  );

  if (eligibleTitles.length === 0) {
    return null;
  }

  return eligibleTitles[Math.floor(random() * eligibleTitles.length)];
}

function formatMediaType(mediaType) {
  if (!isNonEmptyString(mediaType)) {
    return mediaType;
  }

  if (mediaType === 'movie') {
    return 'Movie';
  }

  if (mediaType === 'series') {
    return 'Series';
  }

  return mediaType;
}

function formatTopBilledActors(item) {
  if (!Array.isArray(item?.people?.actors)) {
    return [];
  }

  return item.people.actors
    .filter(isNonEmptyString)
    .slice(0, reviewTopBilledActorLimit);
}

function formatImdbUrl(item) {
  const match = /^imdb:(tt\d+)$/.exec(item?.canonicalId ?? '');
  return match ? `https://www.imdb.com/title/${match[1]}/` : null;
}

function wrapText(text, columns = reviewPlotWrapColumns) {
  const width = Math.max(1, columns - reviewNestedIndent.length);
  const words = String(text).trim().replace(/\s+/g, ' ').split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    if (word.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }

      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      continue;
    }

    const nextLine = line ? `${line} ${word}` : word;

    if (nextLine.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

export function formatTitleInformation(item) {
  if (!item) {
    return 'No title information available.';
  }

  const year = Number.isInteger(item.releaseYear)
    ? ` (${item.releaseYear})`
    : '';
  const lines = [`${item.title}${year}`];
  const mediaType = formatMediaType(item.mediaType);
  const genres = Array.isArray(item.genres)
    ? item.genres.filter(isNonEmptyString)
    : [];
  const actors = formatTopBilledActors(item);
  const imdbUrl = formatImdbUrl(item);

  if (mediaType) {
    lines.push('', `${reviewIndent}${mediaType}`);
  }

  if (genres.length > 0) {
    lines.push(
      '',
      `${reviewIndent}Genres:`,
      ...genres.map((genre) => `${reviewNestedIndent}${genre}`),
    );
  }

  if (actors.length > 0) {
    lines.push(
      '',
      `${reviewIndent}Actors:`,
      ...actors.map((actor) => `${reviewNestedIndent}- ${actor}`),
    );
  }

  if (isNonEmptyString(item.description)) {
    lines.push(
      '',
      `${reviewIndent}Plot:`,
      ...wrapText(item.description).map(
        (line) => `${reviewNestedIndent}${line}`,
      ),
    );
  }

  if (imdbUrl) {
    lines.push(
      '',
      `${reviewIndent}IMDb:`,
      `${reviewNestedIndent}${imdbUrl}`,
    );
  }

  if (isNonEmptyString(item.posterUrl)) {
    lines.push(
      '',
      `${reviewIndent}Poster:`,
      `${reviewNestedIndent}${item.posterUrl}`,
    );
  }

  return lines.join('\n');
}

export function formatReactionTitle(item) {
  if (!item) {
    return 'No eligible-unreacted titles found.';
  }

  const year = Number.isInteger(item.releaseYear)
    ? ` (${item.releaseYear})`
    : '';
  const lines = [`${item.title}${year}`];
  const mediaType = formatMediaType(item.mediaType);
  const actors = formatTopBilledActors(item);

  if (mediaType || actors.length > 0) {
    lines.push('');
  }

  if (mediaType) {
    lines.push(`${reviewIndent}${mediaType}`);
  }

  if (actors.length > 0) {
    if (mediaType) {
      lines.push('');
    }

    lines.push(
      `${reviewIndent}Actors:`,
      ...actors.map((actor) => `${reviewNestedIndent}- ${actor}`),
    );
  }

  return lines.join('\n');
}

export function formatExistingReaction(reaction) {
  if (
    !reaction ||
    typeof reaction !== 'object' ||
    Array.isArray(reaction) ||
    !Number.isInteger(reaction.rating)
  ) {
    return null;
  }

  const lines = [
    'Existing reaction found.',
    '',
    `Rating: ${reaction.rating}/10`,
  ];

  if (Array.isArray(reaction.reasons) && reaction.reasons.length > 0) {
    lines.push(`Reasons: ${reaction.reasons.join(', ')}`);
  }

  if (isNonEmptyString(reaction.notes)) {
    lines.push(`Notes: ${reaction.notes}`);
  }

  return lines.join('\n');
}

export function formatSearchResultTitle(item) {
  const year = Number.isInteger(item.releaseYear)
    ? ` (${item.releaseYear})`
    : '';
  const mediaType = formatMediaType(item.mediaType);

  return `${item.title}${year} | ${mediaType} | ${item.canonicalId}`;
}

export function getSearchSelectionChoices(items) {
  const useSingleKeySelection =
    items.length <= searchSelectionKeys.length;

  return items.map((item, index) => ({
    key: useSingleKeySelection
      ? searchSelectionKeys[index]
      : String(index + 1),
    name: formatSearchResultTitle(item),
    value: item.canonicalId,
  }));
}

export function formatSearchResults(items) {
  if (items.length === 0) {
    return 'No catalog items found.';
  }

  return getSearchSelectionChoices(items)
    .map((choice) => `[${choice.key}] ${choice.name}`)
    .join('\n');
}

export function shouldWriteSearchResultsBeforeSelection({
  items,
  selectionPrompt,
} = {}) {
  return (
    Boolean(selectionPrompt) ||
    !Array.isArray(items) ||
    items.length > searchSelectionKeys.length
  );
}

export function formatSearchResultThresholdMessage(count) {
  return `Too many titles found (${count}). Please refine your search.`;
}

export function getReactionPromptChoices() {
  return [
    ...ratingScale.map(({ key, rating, label }) => ({
      key,
      name: label || String(rating),
      value: rating,
    })),
    ...reactionControlOptions,
  ];
}

export function formatVisibleRatingScale() {
  return [
    ...ratingScale.map(({ key, label }) =>
      label ? `[${key}] ${label}` : `[${key}]`,
    ),
    '',
    reactionControlOptions
      .map((choice) => `[${choice.key}] ${choice.name}`)
      .join('  '),
    '',
    '>',
  ].join('\n');
}

export function formatVisibleReactionChoices(
  choices = getReactionPromptChoices(),
) {
  const separator = choices.some((choice) => choice.name.length > 24)
    ? '\n'
    : ' ';

  return choices
    .map((choice) => `[${choice.key}] ${choice.name}`)
    .join(separator);
}

export function createReactionPromptConfig({ message = '' } = {}) {
  return {
    message,
    choices: getReactionPromptChoices(),
    formatChoices: formatVisibleRatingScale,
    bare: true,
  };
}

export async function promptForReaction({
  reactionPrompt = singleKeyChoicePrompt,
  message,
} = {}) {
  return reactionPrompt(createReactionPromptConfig({ message }));
}

export function getQuitConfirmationChoices() {
  return quitConfirmationOptions.map(({ key, label, value }) => ({
    key,
    name: label,
    value,
  }));
}

export function createQuitConfirmationPromptConfig({
  message = 'Quit reaction session?',
} = {}) {
  return {
    message,
    choices: getQuitConfirmationChoices(),
  };
}

export async function promptForQuitConfirmation({
  quitPrompt = singleKeyChoicePrompt,
  message,
} = {}) {
  return quitPrompt(createQuitConfirmationPromptConfig({ message }));
}

export async function promptForSearchQuery({
  searchPrompt = singleLineTextPrompt,
  message = 'Search catalog',
} = {}) {
  return searchPrompt({ message, allowEmpty: true });
}

export async function promptForReactionNotes({
  notesPrompt = singleLineTextPrompt,
  message = 'Notes (optional)',
  initialValue = '',
} = {}) {
  return notesPrompt({
    message,
    allowEmpty: true,
    initialValue,
    transform(value) {
      const notes = value.trim();
      return notes.length > 0 ? notes : null;
    },
  });
}

export async function promptForReactionReasons({
  reasonsPrompt = singleLineTextPrompt,
  message = 'Reasons (optional, comma-separated)',
  initialValue = '',
} = {}) {
  return reasonsPrompt({
    message,
    allowEmpty: true,
    initialValue,
    transform(value) {
      const reasons = normalizeReactionReasons(value);
      return reasons.length > 0 ? reasons : null;
    },
  });
}

export async function promptForSearchSelection({
  items,
  selectionPrompt,
  message = 'Select title',
} = {}) {
  const choices = getSearchSelectionChoices(items);
  const prompt =
    selectionPrompt ??
    (items.length <= searchSelectionKeys.length
      ? singleKeyChoicePrompt
      : numericChoicePrompt);

  return prompt({
    message,
    choices,
  });
}

async function numericChoicePrompt({ message, choices }) {
  return singleLineTextPrompt({
    message,
    validate(value) {
      return choices.some((choice) => choice.key === value)
        ? true
        : `Enter a number from 1 to ${choices.length}.`;
    },
    transform(value) {
      return choices.find((choice) => choice.key === value).value;
    },
  });
}

export async function searchReactionCatalog({
  rootDir = process.cwd(),
  query,
} = {}) {
  if (!isNonEmptyString(query)) {
    throw new CatalogBuildError('Search query must not be empty.');
  }

  const filters = createCatalogTitleSearchFilters(query);
  const [items, ignored] = await Promise.all([
    searchCatalog({ rootDir, filters }),
    readReactionIgnoredState({ rootDir }),
  ]);
  const ignoredTitleIds = getIgnoredTitleIds(ignored);

  return items.filter((item) => !ignoredTitleIds.has(item.canonicalId));
}

export function isBlankSearchQuery(query) {
  return String(query ?? '').trim().length === 0;
}

export function formatSearchCancellationMessage() {
  return 'Search cancelled.';
}

export async function selectReactionTitleFromSearch({
  rootDir = process.cwd(),
  searchPrompt,
  selectionPrompt,
  searchResultThreshold,
  writeOutput = (message) => console.log(message),
} = {}) {
  loadRepoEnv({ rootDir });

  const threshold =
    searchResultThreshold ?? readReactionSearchResultThreshold();
  let query;
  let items;

  while (true) {
    query = await promptForSearchQuery({ searchPrompt });

    if (isBlankSearchQuery(query)) {
      writeOutput(formatSearchCancellationMessage());
      return null;
    }

    items = await searchReactionCatalog({ rootDir, query });

    if (items.length <= threshold) {
      break;
    }

    writeOutput(formatSearchResultThresholdMessage(items.length));
  }

  if (items.length === 0) {
    throw new CatalogBuildError(
      `No catalog titles found for search: ${query.trim()}`,
    );
  }

  if (
    shouldWriteSearchResultsBeforeSelection({ items, selectionPrompt })
  ) {
    writeOutput(formatSearchResults(items));
  }

  const canonicalId = await promptForSearchSelection({
    items,
    selectionPrompt,
  });

  return findReactionTitleById({ rootDir, canonicalId });
}

async function resolveTargetReactionTitle({
  rootDir,
  options,
  ignored,
  searchPrompt,
  selectionPrompt,
  searchResultThreshold,
  writeOutput,
}) {
  if (options.id) {
    const item = await findReactionTitleById({
      rootDir,
      canonicalId: options.id,
    });

    assertTitleIsRateable(item, ignored);
    return item;
  }

  if (options.search) {
    return selectReactionTitleFromSearch({
      rootDir,
      searchPrompt,
      selectionPrompt,
      searchResultThreshold,
      writeOutput,
    });
  }

  return null;
}

export function createTitleReactionEvent(
  item,
  rating,
  {
    eventId = randomUUID(),
    occurredAt = new Date().toISOString(),
    notes = null,
    reasons = null,
  } = {},
) {
  const event = {
    eventId,
    type: titleReactionEventType,
    occurredAt,
    canonicalId: item.canonicalId,
    rating: ratingForReaction(rating),
  };

  if (typeof notes === 'string' && notes.trim().length > 0) {
    event.notes = notes.trim();
  }

  const normalizedReasons = normalizeReactionReasons(reasons);

  if (normalizedReasons.length > 0) {
    event.reasons = normalizedReasons;
  }

  return event;
}

export function createTitleIgnoredEvent(
  item,
  {
    eventId = randomUUID(),
    occurredAt = new Date().toISOString(),
  } = {},
) {
  return {
    eventId,
    type: titleIgnoredEventType,
    occurredAt,
    canonicalId: item.canonicalId,
  };
}

export function formatReactedTitleIgnoreError(item) {
  return `${item.title} (${item.canonicalId}) currently has a reaction and cannot be ignored. Reset the reaction before ignoring it.`;
}

function countBufferedEventsByType(events, type) {
  return events.filter((event) => event.type === type).length;
}

export function formatReactionWriteSummary(report) {
  const reactionEventsWritten =
    report.reactionEventsWritten ??
    countBufferedEventsByType(
      report.events ?? [],
      titleReactionEventType,
    );
  const ignoreEventsWritten =
    report.ignoreEventsWritten ??
    countBufferedEventsByType(
      report.events ?? [],
      titleIgnoredEventType,
    );
  const lines = [
    `Wrote ${reactionEventsWritten} title reaction event(s).`,
    `Wrote ${ignoreEventsWritten} title ignore event(s).`,
  ];

  if (report.eventsWritten > 0) {
    lines.push(
      ...report.events.map((event) => {
        if (event.type === titleIgnoredEventType) {
          return `- ${event.title}: ignored (${event.canonicalId})`;
        }

        return `- ${event.title}: rating ${event.rating}/10 (${event.canonicalId})`;
      }),
    );
  }

  const filesWritten = uniqueNonEmptyStrings(report.filesWritten ?? []);

  if (report.eventsWritten > 0 && filesWritten.length > 0) {
    lines.push(
      '',
      'Files changed:',
      ...filesWritten.map((filePath) => `- ${filePath}`),
      '',
      'Next:',
      'git diff',
      `git add ${filesWritten.map(shellQuotePath).join(' ')}`,
      'git commit -m "Add movie reactions"',
    );
  }

  return lines.join('\n');
}

export function formatAbortMessage() {
  return 'Reaction session aborted. No events were written.';
}

export function formatSaveAndQuitCurrentTitleMessage(item) {
  return `Save & Quit selected. Current title was not written: ${item.title}.`;
}

export function hasReachedSessionLimit(processedCount, limit) {
  return limit !== 'none' && processedCount >= limit;
}

export function selectReactionSessionTitles({
  catalog,
  reactions,
  ignored,
  options,
  targetItem = null,
  random = Math.random,
} = {}) {
  if (targetItem) {
    return [targetItem];
  }

  const selectedItems = [];
  const selectedTitleIds = new Set();
  const ignoredTitleIds = getIgnoredTitleIds(ignored);

  while (!hasReachedSessionLimit(selectedItems.length, options.limit)) {
    const excludedTitleIds = new Set([
      ...selectedTitleIds,
      ...ignoredTitleIds,
    ]);
    const item = options.random
      ? selectRandomUnreactedTitle(
          catalog,
          reactions,
          excludedTitleIds,
          random,
          options,
        )
      : selectFirstUnreactedTitle(
          catalog,
          reactions,
          excludedTitleIds,
          options,
        );

    if (!item) {
      break;
    }

    selectedItems.push(item);
    selectedTitleIds.add(item.canonicalId);
  }

  return selectedItems;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatHtmlList(values, emptyText) {
  const items = Array.isArray(values)
    ? values.filter(isNonEmptyString)
    : [];

  return items.length > 0
    ? escapeHtml(items.join(', '))
    : `<span class="muted">${escapeHtml(emptyText)}</span>`;
}

function formatHtmlActorList(values) {
  const actors = Array.isArray(values)
    ? values.filter(isNonEmptyString)
    : [];

  if (actors.length === 0) {
    return '<span class="muted">No actors available</span>';
  }

  return [
    '<ul class="actor-list">',
    ...actors.map((actor) => `<li>${escapeHtml(actor)}</li>`),
    '</ul>',
  ].join('\n');
}

function formatHtmlPoster(item) {
  if (!isNonEmptyString(item?.posterUrl)) {
    return '<div class="poster poster-missing" aria-label="No poster available">No poster</div>';
  }

  return [
    `<img class="poster" src="${escapeHtml(item.posterUrl)}"`,
    `alt="${escapeHtml(`${item.title} poster`)}" loading="lazy">`,
  ].join(' ');
}

function formatHtmlRatingControls(item, index) {
  const groupName = `rating-${index}`;

  return [
    `<div class="rating-control" role="group" aria-label="Rating" tabindex="0" data-rating-control data-rating-name="${escapeHtml(groupName)}" data-title-id="${escapeHtml(item.canonicalId)}">`,
    '<div class="rating-label">Rating: <span class="rating-status" aria-live="polite">Unrated</span></div>',
    '<div class="rating-options" aria-hidden="false">',
    ...ratingScale.map(({ rating, label }) => {
      const labelText = label ? `${rating} ${label}` : `${rating}`;

      return [
        '<button class="rating-option" type="button" tabindex="-1"',
        `data-rating="${rating}" aria-pressed="false" aria-label="${escapeHtml(labelText)}" title="${escapeHtml(labelText)}">`,
        `${rating}`,
        '</button>',
      ].join('');
    }),
    '</div>',
    '</div>',
  ].join('\n');
}

function formatHtmlReasonInput(item, index) {
  const inputId = `reasons-${index}`;

  return [
    '<label class="reason-control">',
    `<span class="reason-label" id="${escapeHtml(inputId)}-label">Reasons</span>`,
    '<input class="reason-input" type="text"',
    `aria-labelledby="${escapeHtml(inputId)}-label"`,
    `data-reason-input data-title-id="${escapeHtml(item.canonicalId)}"`,
    `id="${escapeHtml(inputId)}"`,
    'inputmode="text" autocomplete="off"',
    'placeholder="comma-separated reasons">',
    '</label>',
  ].join('\n');
}

function formatHtmlReviewTitle(item, index) {
  const year = item.releaseYear
    ? escapeHtml(item.releaseYear)
    : 'Unknown';
  const genres = formatHtmlList(item.genres, 'No genres available');
  const actors = formatHtmlActorList(formatTopBilledActors(item));

  return [
    '<article class="title-card">',
    formatHtmlPoster(item),
    '<div class="card-body">',
    `<h2>${escapeHtml(item.title)}</h2>`,
    formatHtmlRatingControls(item, index),
    formatHtmlReasonInput(item, index),
    '<dl class="metadata">',
    `<div><dt>Year</dt><dd>${year}</dd></div>`,
    `<div><dt>Genres</dt><dd>${genres}</dd></div>`,
    `<div><dt>Top-billed actors</dt><dd>${actors}</dd></div>`,
    '</dl>',
    '</div>',
    '</article>',
  ].join('\n');
}

export function renderReactionReviewHtml(items) {
  const titleCards =
    items.length > 0
      ? items.map(formatHtmlReviewTitle).join('\n')
      : '<p class="empty-state">No eligible-unreacted titles found.</p>';

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Reaction Review</title>',
    '<style>',
    ':root { color-scheme: light; --bg: #f4f1ec; --ink: #1e2320; --muted: #6b6258; --panel: #fffdfa; --line: #d7d0c6; --accent: #1c6f6a; --accent-ink: #ffffff; --poster: #d8d6cf; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
    'main { width: min(1480px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 40px; }',
    'header { margin-bottom: 22px; }',
    'h1 { margin: 0 0 6px; font-size: clamp(1.8rem, 3vw, 3rem); line-height: 1; }',
    '.reset-button { min-height: 32px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); color: var(--ink); font: inherit; font-size: 0.86rem; cursor: pointer; }',
    '.reset-button:hover { border-color: var(--accent); }',
    '.poster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 18px; align-items: start; }',
    '.title-card { min-width: 0; overflow: hidden; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(30, 35, 32, 0.08); }',
    '.poster { display: block; width: 100%; aspect-ratio: 2 / 3; object-fit: cover; background: var(--poster); }',
    '.poster-missing { display: grid; place-items: center; color: var(--muted); font-size: 0.9rem; }',
    '.card-body { padding: 14px; }',
    'h2 { margin: 0 0 10px; font-size: 1.02rem; line-height: 1.2; overflow-wrap: anywhere; }',
    '.metadata { display: grid; gap: 8px; margin: 12px 0 0; }',
    '.metadata div { min-width: 0; }',
    'dt { margin: 0 0 2px; color: var(--muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }',
    'dd { margin: 0; font-size: 0.9rem; line-height: 1.35; overflow-wrap: anywhere; }',
    '.actor-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }',
    '.actor-list li { min-width: 0; overflow-wrap: anywhere; }',
    '.muted { color: var(--muted); }',
    '.rating-control { margin: 0; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: #f8f5f0; }',
    '.rating-control:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; border-color: var(--accent); box-shadow: none; }',
    '.rating-label { min-height: 1rem; margin-bottom: 5px; color: var(--muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0; line-height: 1rem; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }',
    '.rating-status { color: var(--ink); }',
    '.rating-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }',
    '.rating-option { min-width: 0; min-height: 28px; padding: 4px 0; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); color: var(--ink); font: inherit; font-size: 0.8rem; line-height: 1; cursor: pointer; }',
    '.rating-option[data-rating="10"] { grid-column: 2; }',
    '.rating-option[data-rating="9"], .rating-option[data-rating="6"], .rating-option[data-rating="3"] { grid-column: 1; }',
    '.rating-option:hover { border-color: var(--accent); }',
    '.rating-option.is-selected { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); font-weight: 700; }',
    '.reason-control { display: block; margin: 6px 0 0; }',
    '.reason-label { display: block; margin: 0 0 3px; color: var(--muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0; line-height: 1rem; text-transform: uppercase; }',
    '.reason-input { display: block; width: 100%; min-height: 32px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); color: var(--ink); font: inherit; font-size: 0.86rem; line-height: 1.2; }',
    '.reason-input:focus { outline: 2px solid var(--accent); outline-offset: -2px; border-color: var(--accent); }',
    '.empty-state { padding: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; color: var(--muted); }',
    '@media (max-width: 560px) { main { width: min(100% - 20px, 1480px); padding-top: 18px; } .poster-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; } .card-body { padding: 11px; } }',
    '</style>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", () => {',
    '  const storageKey = "film-reaction-review-v1";',
    '  const labels = { "10": "Exceptional", "9": "Loved", "8": "Liked↔Loved", "7": "Liked", "6": "Mixed↔Liked", "5": "Mixed", "4": "Disliked↔Mixed", "3": "Disliked", "2": "Hated↔Disliked", "1": "Hated" };',
    '  const validRatings = new Set(Object.keys(labels));',
    '  const readStoredReactions = () => {',
    '    try {',
    '      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");',
    '      return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};',
    '    } catch {',
    '      return {};',
    '    }',
    '  };',
    '  const writeStoredReactions = (reactions) => {',
    '    localStorage.setItem(storageKey, JSON.stringify(reactions));',
    '  };',
    '  const normalizeReasons = (value) => {',
    '    const seen = new Set();',
    '    return value.split(",").map((reason) => reason.trim().toLowerCase()).filter((reason) => {',
    '      if (!reason || seen.has(reason)) {',
    '        return false;',
    '      }',
    '      seen.add(reason);',
    '      return true;',
    '    });',
    '  };',
    '  const formatReasons = (reasons) => Array.isArray(reasons) ? reasons.join(", ") : "";',
    '  const persistRating = (control, rating) => {',
    '    const titleId = control.dataset.titleId;',
    '    if (!titleId) {',
    '      return;',
    '    }',
    '    const reactions = readStoredReactions();',
    '    if (validRatings.has(rating)) {',
    '      const existing = reactions[titleId];',
    '      reactions[titleId] = {',
    '        titleId,',
    '        rating: Number(rating),',
    '        reasons: Array.isArray(existing?.reasons) ? existing.reasons : [],',
    '      };',
    '    } else {',
    '      const existingReasons = Array.isArray(reactions[titleId]?.reasons) ? reactions[titleId].reasons : [];',
    '      if (existingReasons.length > 0) {',
    '        reactions[titleId] = {',
    '          titleId,',
    '          reasons: existingReasons,',
    '        };',
    '      } else {',
    '        delete reactions[titleId];',
    '      }',
    '    }',
    '    writeStoredReactions(reactions);',
    '  };',
    '  const persistReasons = (input, { syncValue = false } = {}) => {',
    '    const titleId = input.dataset.titleId;',
    '    if (!titleId) {',
    '      return;',
    '    }',
    '    const reactions = readStoredReactions();',
    '    const existing = reactions[titleId];',
    '    const reasons = normalizeReasons(input.value);',
    '    if (syncValue) {',
    '      input.value = reasons.join(", ");',
    '    }',
    '    if (existing && Number.isInteger(existing.rating) && validRatings.has(String(existing.rating))) {',
    '      reactions[titleId] = {',
    '        titleId,',
    '        rating: existing.rating,',
    '        reasons,',
    '      };',
    '    } else if (reasons.length > 0) {',
    '      reactions[titleId] = {',
    '        titleId,',
    '        reasons,',
    '      };',
    '    } else {',
    '      delete reactions[titleId];',
    '    }',
    '    writeStoredReactions(reactions);',
    '  };',
    '  const updateRatingControl = (control, nextRating) => {',
    '    control.dataset.rating = nextRating;',
    '    control.querySelectorAll("[data-rating]").forEach((button) => {',
    '      const selected = button.dataset.rating === nextRating;',
    '      button.classList.toggle("is-selected", selected);',
    '      button.setAttribute("aria-pressed", selected ? "true" : "false");',
    '    });',
    '    const status = control.querySelector(".rating-status");',
    '    if (status) {',
    '      status.textContent = nextRating ? labels[nextRating] : "Unrated";',
    '    }',
    '  };',
    '  const setRating = (control, rating) => {',
    '    const currentRating = control.dataset.rating || "";',
    '    const nextRating = currentRating === rating ? "" : rating;',
    '    updateRatingControl(control, nextRating);',
    '    persistRating(control, nextRating);',
    '  };',
    '  const storedReactions = readStoredReactions();',
    '  document.querySelectorAll("[data-rating-control]").forEach((control) => {',
    '    const storedReaction = storedReactions[control.dataset.titleId];',
    '    const storedRating = storedReaction?.rating;',
    '    if (Number.isInteger(storedRating) && validRatings.has(String(storedRating))) {',
    '      updateRatingControl(control, String(storedRating));',
    '    }',
    '    control.querySelectorAll("[data-rating]").forEach((button) => {',
    '      button.addEventListener("click", () => setRating(control, button.dataset.rating));',
    '    });',
    '    control.addEventListener("keydown", (event) => {',
    '      if (/^[1-9]$/.test(event.key)) {',
    '        event.preventDefault();',
    '        setRating(control, event.key);',
    '      } else if (event.key === "0") {',
    '        event.preventDefault();',
    '        setRating(control, "10");',
    '      } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "Escape") {',
    '        event.preventDefault();',
    '        setRating(control, "");',
    '      }',
    '    });',
    '  });',
    '  document.querySelectorAll("[data-reason-input]").forEach((input) => {',
    '    const storedReaction = storedReactions[input.dataset.titleId];',
    '    input.value = formatReasons(storedReaction?.reasons);',
    '    input.addEventListener("input", () => persistReasons(input));',
    '    input.addEventListener("change", () => persistReasons(input, { syncValue: true }));',
    '    input.addEventListener("blur", () => persistReasons(input, { syncValue: true }));',
    '  });',
    '  const resetButton = document.querySelector("[data-reset-review]");',
    '  if (resetButton) {',
    '    resetButton.addEventListener("click", () => {',
    '      if (window.confirm("Clear all saved HTML review ratings?")) {',
    '        localStorage.removeItem(storageKey);',
    '        window.location.reload();',
    '      }',
    '    });',
    '  }',
    '});',
    '</script>',
    '</head>',
    '<body>',
    '<main>',
    '<header>',
    '<h1>Reaction Review</h1>',
    '<button class="reset-button" type="button" data-reset-review>Reset</button>',
    '</header>',
    '<section class="poster-grid" aria-label="Selected titles">',
    titleCards,
    '</section>',
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export async function writeReactionReviewHtml({
  rootDir = process.cwd(),
  items,
  outputPath = path.join(rootDir, 'reports', 'reaction-review.html'),
} = {}) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    renderReactionReviewHtml(items),
    'utf8',
  );

  return {
    outputPath,
    fileUrl: pathToFileURL(outputPath).href,
  };
}

async function persistReactionEvents({
  rootDir,
  catalog,
  bufferedEvents,
}) {
  const eventsPath = path.join(
    rootDir,
    'events',
    'title-reactions.events.ndjson',
  );

  const appendReport = await appendTitleReactionEvents({
    eventsPath,
    events: bufferedEvents.map(({ title, ...event }) => event),
    catalog,
  });
  const projectionReport = await buildTitleReactions({ rootDir });
  const reactionEventsWritten = countBufferedEventsByType(
    bufferedEvents,
    titleReactionEventType,
  );
  const ignoreEventsWritten = countBufferedEventsByType(
    bufferedEvents,
    titleIgnoredEventType,
  );

  return {
    ...appendReport,
    projectionReport,
    eventsWritten: appendReport.eventsAppended,
    reactionEventsWritten,
    ignoreEventsWritten,
    events: bufferedEvents,
    filesWritten: uniqueNonEmptyStrings(
      [
        appendReport.outputPathWritten,
        projectionReport.outputPathWritten,
        ignoreEventsWritten > 0
          ? projectionReport.ignoredOutputPathWritten
          : null,
      ].map((filePath) =>
        filePath ? path.relative(rootDir, filePath) : null,
      ),
    ),
  };
}

export async function runReactionSession({
  rootDir = process.cwd(),
  args = [],
  reactionPrompt,
  notesPrompt,
  reasonsPrompt,
  quitPrompt,
  searchPrompt,
  selectionPrompt,
  searchResultThreshold,
  random = Math.random,
  writeOutput = (message) => console.log(message),
} = {}) {
  const options = Array.isArray(args)
    ? parseReactionCliArgs(args)
    : args;
  const catalog = await readReactionCatalog({ rootDir });
  const [reactions, ignored] = await Promise.all([
    readReactionState({ rootDir }),
    readReactionIgnoredState({ rootDir }),
  ]);
  const bufferedEvents = [];
  const targetItem = await resolveTargetReactionTitle({
    rootDir,
    options,
    ignored,
    searchPrompt,
    selectionPrompt,
    searchResultThreshold,
    writeOutput,
  });

  if (options.search && targetItem === null) {
    return {
      status: 'cancelled',
      bufferedEvents: [],
      eventsWritten: 0,
      processedCount: 0,
    };
  }

  const sessionTitles = selectReactionSessionTitles({
    catalog,
    reactions,
    ignored,
    options,
    targetItem,
    random,
  });

  if (options.html) {
    const report = await writeReactionReviewHtml({
      rootDir,
      items: sessionTitles,
    });

    writeOutput(report.fileUrl);

    return {
      status: 'html-generated',
      outputPath: report.outputPath,
      fileUrl: report.fileUrl,
      selectedTitles: sessionTitles,
      processedCount: sessionTitles.length,
    };
  }

  let processedCount = 0;
  let reviewScreensDisplayed = 0;

  if (sessionTitles.length === 0) {
    writeOutput(formatReactionTitle(null));
  }

  for (const item of sessionTitles) {
    const reviewScreen = formatReactionTitle(item);
    writeOutput(
      reviewScreensDisplayed > 0
        ? `${reviewScreenSeparator}${reviewScreen}`
        : reviewScreen,
    );
    reviewScreensDisplayed += 1;
    const currentReaction = reactions[item.canonicalId];
    const existingReactionOutput =
      formatExistingReaction(currentReaction);

    if (existingReactionOutput) {
      writeOutput(existingReactionOutput);
    }

    let needsReaction = true;
    while (needsReaction) {
      const reaction = await promptForReaction({ reactionPrompt });

      if (reaction === 'skip') {
        processedCount += 1;
        needsReaction = false;
        continue;
      }

      if (reaction === 'info') {
        writeOutput(formatTitleInformation(item));
        continue;
      }

      if (reaction === 'quit') {
        const quitAction = await promptForQuitConfirmation({
          quitPrompt,
        });

        if (quitAction === 'abort') {
          writeOutput(formatAbortMessage());
          return {
            status: 'aborted',
            bufferedEvents: [],
            processedCount,
          };
        }

        if (quitAction === 'save-and-quit') {
          const report = await persistReactionEvents({
            rootDir,
            catalog,
            bufferedEvents,
          });

          writeOutput(formatReactionWriteSummary(report));
          writeOutput(formatSaveAndQuitCurrentTitleMessage(item));
          return {
            status: 'saved-and-quit',
            bufferedEvents,
            eventsWritten: report.eventsWritten,
            processedCount,
          };
        }

        continue;
      }

      if (reaction === 'ignore') {
        if (currentReaction) {
          throw new CatalogBuildError(
            formatReactedTitleIgnoreError(item),
          );
        }

        const event = createTitleIgnoredEvent(item);
        bufferedEvents.push({
          ...event,
          title: item.title,
        });
        processedCount += 1;
        needsReaction = false;
        continue;
      }

      const notes = await promptForReactionNotes({
        notesPrompt,
        initialValue: isNonEmptyString(currentReaction?.notes)
          ? currentReaction.notes
          : '',
      });
      const reasons = await promptForReactionReasons({
        reasonsPrompt,
        initialValue: Array.isArray(currentReaction?.reasons)
          ? currentReaction.reasons.join(', ')
          : '',
      });
      const event = createTitleReactionEvent(item, reaction, {
        notes,
        reasons,
      });
      bufferedEvents.push({
        ...event,
        title: item.title,
      });
      processedCount += 1;
      needsReaction = false;
    }
  }

  const report = await persistReactionEvents({
    rootDir,
    catalog,
    bufferedEvents,
  });
  writeOutput(formatReactionWriteSummary(report));

  return {
    status: 'completed',
    bufferedEvents,
    eventsWritten: report.eventsWritten,
    processedCount,
  };
}

export async function selectReactionTitle(options = {}) {
  const catalog = await readReactionCatalog(options);
  const [reactions, ignored] = await Promise.all([
    readReactionState(options),
    readReactionIgnoredState(options),
  ]);
  const ignoredTitleIds = getIgnoredTitleIds(ignored);

  if (!options.ordered && options.random !== false) {
    return selectRandomUnreactedTitle(
      catalog,
      reactions,
      ignoredTitleIds,
      Math.random,
      options,
    );
  }

  return selectFirstUnreactedTitle(
    catalog,
    reactions,
    ignoredTitleIds,
    options,
  );
}
