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
import { readCatalog } from './catalog-query.js';
import {
  appendTitleReactionEvents,
  buildTitleReactions,
  titleReactionEventType,
} from './title-reactions.js';

const defaultLimit = 1;
const reactionOptions = [
  { key: '1', label: 'Loved', value: 'loved' },
  { key: '2', label: 'Liked', value: 'liked' },
  { key: '3', label: 'Mixed', value: 'mixed' },
  { key: '4', label: 'Disliked', value: 'disliked' },
  { key: '5', label: 'Hated', value: 'hated' },
  { key: 's', label: 'Skip', value: 'skip' },
  { key: 'q', label: 'Quit', value: 'quit' },
];

const quitConfirmationOptions = [
  { key: 'a', label: 'Abort', value: 'abort' },
  { key: 's', label: 'Save & Quit', value: 'save-and-quit' },
  { key: 'c', label: 'Cancel', value: 'cancel' },
];
const reactionRatings = {
  loved: 10,
  liked: 8,
  mixed: 5,
  disliked: 3,
  hated: 1,
};

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
      formatVisibleReactionChoices(config.choices),
      error ? theme.style.error(error) : '',
    ]
      .filter(Boolean)
      .join('\n'),
  ];
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
      new Option(
        '--random',
        'randomize eligible title selection',
      ).conflicts('id'),
    )
    .option(
      '--id <canonicalId>',
      'react to a specific canonical title ID',
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

export function getReactedTitleIds(reactions) {
  return new Set(Object.keys(reactions));
}

export function selectFirstUnreactedTitle(
  catalog,
  reactions,
  excludedTitleIds = new Set(),
) {
  const reactedTitleIds = new Set([
    ...getReactedTitleIds(reactions),
    ...excludedTitleIds,
  ]);

  return (
    Object.values(catalog).find(
      (item) => !reactedTitleIds.has(item.canonicalId),
    ) ?? null
  );
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

export function getReactionPromptChoices() {
  return reactionOptions.map(({ key, label, value }) => ({
    key,
    name: label,
    value,
  }));
}

export function formatVisibleReactionChoices(
  choices = getReactionPromptChoices(),
) {
  return choices
    .map((choice) => `[${choice.key}] ${choice.name}`)
    .join(' ');
}

export function createReactionPromptConfig({
  message = 'Reaction',
} = {}) {
  return {
    message,
    choices: getReactionPromptChoices(),
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

export function ratingForReaction(reaction) {
  const rating = reactionRatings[reaction];

  if (!rating) {
    throw new CatalogBuildError(`Unsupported reaction: ${reaction}`);
  }

  return rating;
}

export function createTitleReactionEvent(
  item,
  reaction,
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
    rating: ratingForReaction(reaction),
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
  writeOutput = (message) => console.log(message),
} = {}) {
  const options = Array.isArray(args)
    ? parseReactionCliArgs(args)
    : args;
  const catalog = await readReactionCatalog({ rootDir });
  const reactions = await readReactionState({ rootDir });
  const processedTitleIds = new Set();
  const bufferedEvents = [];
  let processedCount = 0;

  while (!hasReachedSessionLimit(processedCount, options.limit)) {
    const item = selectFirstUnreactedTitle(
      catalog,
      reactions,
      processedTitleIds,
    );

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

  return selectFirstUnreactedTitle(catalog, reactions);
}
