import fs from 'node:fs/promises';
import path from 'node:path';
import { rawlist } from '@inquirer/prompts';
import { Command, InvalidArgumentError, Option } from 'commander';
import { CatalogBuildError } from './catalog-build-error.js';
import { readCatalog } from './catalog-query.js';

const defaultLimit = 1;
const reactionOptions = [
  { label: 'Loved', value: 'loved' },
  { label: 'Liked', value: 'liked' },
  { label: 'Mixed', value: 'mixed' },
  { label: 'Disliked', value: 'disliked' },
  { label: 'Hated', value: 'hated' },
];

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

export function selectFirstUnreactedTitle(catalog, reactions) {
  const reactedTitleIds = getReactedTitleIds(reactions);

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
  return reactionOptions.map(({ label, value }) => ({
    name: label,
    value,
  }));
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
  reactionPrompt = rawlist,
  message,
} = {}) {
  return reactionPrompt(createReactionPromptConfig({ message }));
}

export function createSimulatedReactionEvent(item, reaction) {
  return {
    canonicalId: item.canonicalId,
    title: item.title,
    reaction,
  };
}

export function formatSimulatedReactionEvent(event) {
  return [
    'Simulated event write (dry run; no file was written):',
    JSON.stringify(event, null, 2),
  ].join('\n');
}

export async function selectReactionTitle(options = {}) {
  const catalog = await readReactionCatalog(options);
  const reactions = await readReactionState(options);

  return selectFirstUnreactedTitle(catalog, reactions);
}
