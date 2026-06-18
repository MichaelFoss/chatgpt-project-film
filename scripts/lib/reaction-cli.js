import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
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

  return {
    limit: options.limit,
    movies: Boolean(options.movies),
    tv: Boolean(options.tv),
    random: !hasTargetSelector && !options.ordered,
    ordered: Boolean(options.ordered),
    id: options.id ?? null,
    search: Boolean(options.search),
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

  writeOutput(formatSearchResults(items));
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
  const processedTitleIds = new Set();
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

  let processedCount = 0;
  const ignoredTitleIds = getIgnoredTitleIds(ignored);
  let reviewScreensDisplayed = 0;

  while (
    targetItem
      ? processedCount === 0
      : !hasReachedSessionLimit(processedCount, options.limit)
  ) {
    const item =
      targetItem ??
      (options.random
        ? selectRandomUnreactedTitle(
            catalog,
            reactions,
            new Set([...processedTitleIds, ...ignoredTitleIds]),
            random,
            options,
          )
        : selectFirstUnreactedTitle(
            catalog,
            reactions,
            new Set([...processedTitleIds, ...ignoredTitleIds]),
            options,
          ));

    if (!item) {
      if (processedCount === 0) {
        writeOutput(formatReactionTitle(null));
      }
      break;
    }

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
        processedTitleIds.add(item.canonicalId);
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
        processedTitleIds.add(item.canonicalId);
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
      processedTitleIds.add(item.canonicalId);
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
