import { Command, InvalidArgumentError, Option } from 'commander';

const defaultLimit = 1;

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
