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
  titleReactionEventType,
} from './title-reactions.js';
import { ratingForReaction, ratingScale } from './reaction-ratings.js';

const defaultLimit = 1;
const reactionControlOptions = [
  { key: 's', name: 'Skip', value: 'skip' },
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

  const message = theme.style.message(config.message, status);

  if (status === 'done') {
    const selectedChoice = selectReactionChoiceByKey(
      config.choices,
      selectedKey,
    );
    return `${prefix} ${message} ${theme.style.answer(
      selectedChoice?.name ?? selectedKey,
    )}`;
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
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const theme = makeTheme(config.theme);
  const prefix = usePrefix({ status, theme });

  useKeypress((event) => {
    if (event.name === 'return' || event.name === 'enter') {
      const trimmed = value.trim();

      if (trimmed.length === 0) {
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
      setValue(value.slice(0, -1));
      setError('');
      return;
    }

    if (event.sequence && event.sequence >= ' ') {
      setValue(`${value}${event.sequence}`);
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
      new Option('--tv', 'only include television titles').conflicts(
        'movies',
      ),
    )
    .addOption(
      new Option('--random', 'randomize eligible title selection')
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

  return {
    limit: options.limit,
    movies: Boolean(options.movies),
    tv: Boolean(options.tv),
    random: Boolean(options.random),
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

export function selectEligibleReactionTitles(
  catalog,
  reactions,
  excludedTitleIds = new Set(),
) {
  const reactedTitleIds = new Set([
    ...getReactedTitleIds(reactions),
    ...excludedTitleIds,
  ]);

  return Object.values(catalog).filter(
    (item) => !reactedTitleIds.has(item.canonicalId),
  );
}

export function selectFirstUnreactedTitle(
  catalog,
  reactions,
  excludedTitleIds = new Set(),
) {
  return (
    selectEligibleReactionTitles(
      catalog,
      reactions,
      excludedTitleIds,
    )[0] ?? null
  );
}

export function selectRandomUnreactedTitle(
  catalog,
  reactions,
  excludedTitleIds = new Set(),
  random = Math.random,
) {
  const eligibleTitles = selectEligibleReactionTitles(
    catalog,
    reactions,
    excludedTitleIds,
  );

  if (eligibleTitles.length === 0) {
    return null;
  }

  return eligibleTitles[Math.floor(random() * eligibleTitles.length)];
}

function formatMediaType(mediaType) {
  if (mediaType === 'movie') {
    return 'Movie';
  }

  if (mediaType === 'series') {
    return 'TV';
  }

  return mediaType;
}

export function formatReactionTitle(item) {
  if (!item) {
    return 'No unreacted titles found.';
  }

  const year = Number.isInteger(item.releaseYear)
    ? ` (${item.releaseYear})`
    : '';
  const lines = [`${item.title}${year}`];
  const metadata = [formatMediaType(item.mediaType)];

  if (Array.isArray(item.genres) && item.genres.length > 0) {
    metadata.push(item.genres.join(', '));
  }

  lines.push(metadata.join(' · '));

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

export function createReactionPromptConfig({
  message = 'Rate this title:',
} = {}) {
  return {
    message,
    choices: getReactionPromptChoices(),
    formatChoices: formatVisibleRatingScale,
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
  return searchPrompt({ message });
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
  return searchCatalog({ rootDir, filters });
}

export async function selectReactionTitleFromSearch({
  rootDir = process.cwd(),
  searchPrompt,
  selectionPrompt,
  writeOutput = (message) => console.log(message),
} = {}) {
  const query = await promptForSearchQuery({ searchPrompt });
  const items = await searchReactionCatalog({ rootDir, query });

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
  searchPrompt,
  selectionPrompt,
  writeOutput,
}) {
  if (options.id) {
    return findReactionTitleById({
      rootDir,
      canonicalId: options.id,
    });
  }

  if (options.search) {
    return selectReactionTitleFromSearch({
      rootDir,
      searchPrompt,
      selectionPrompt,
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
  } = {},
) {
  return {
    eventId,
    type: titleReactionEventType,
    occurredAt,
    canonicalId: item.canonicalId,
    rating: ratingForReaction(rating),
  };
}

export function formatReactionWriteSummary(report) {
  const lines = [
    `Wrote ${report.eventsWritten} title reaction event(s).`,
  ];

  if (report.eventsWritten > 0) {
    lines.push(
      ...report.events.map(
        (event) =>
          `- ${event.title}: rating ${event.rating}/10 (${event.canonicalId})`,
      ),
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

  return {
    ...appendReport,
    projectionReport,
    eventsWritten: appendReport.eventsAppended,
    events: bufferedEvents,
  };
}

export async function runReactionSession({
  rootDir = process.cwd(),
  args = [],
  reactionPrompt,
  quitPrompt,
  searchPrompt,
  selectionPrompt,
  random = Math.random,
  writeOutput = (message) => console.log(message),
} = {}) {
  const options = Array.isArray(args)
    ? parseReactionCliArgs(args)
    : args;
  const catalog = await readReactionCatalog({ rootDir });
  const reactions = await readReactionState({ rootDir });
  const processedTitleIds = new Set();
  const bufferedEvents = [];
  const targetItem = await resolveTargetReactionTitle({
    rootDir,
    options,
    searchPrompt,
    selectionPrompt,
    writeOutput,
  });
  let processedCount = 0;

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
            processedTitleIds,
            random,
          )
        : selectFirstUnreactedTitle(
            catalog,
            reactions,
            processedTitleIds,
          ));

    if (!item) {
      if (processedCount === 0) {
        writeOutput(formatReactionTitle(null));
      }
      break;
    }

    writeOutput(formatReactionTitle(item));

    let needsReaction = true;
    while (needsReaction) {
      const reaction = await promptForReaction({ reactionPrompt });

      if (reaction === 'skip') {
        processedTitleIds.add(item.canonicalId);
        processedCount += 1;
        needsReaction = false;
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

      const event = createTitleReactionEvent(item, reaction);
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
  const reactions = await readReactionState(options);

  if (options.random) {
    return selectRandomUnreactedTitle(catalog, reactions);
  }

  return selectFirstUnreactedTitle(catalog, reactions);
}
