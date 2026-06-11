import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReactionCommand,
  parseReactionCliArgs,
} from './lib/reaction-cli.js';

export { createReactionCommand, parseReactionCliArgs };

async function main() {
  try {
    const options = parseReactionCliArgs(process.argv.slice(2));
    console.log('Reaction CLI parsed arguments.');
    console.log(JSON.stringify(options, null, 2));
  } catch (error) {
    if (error.code === 'commander.helpDisplayed') {
      createReactionCommand().parse(process.argv);
      return;
    }

    if (error.code?.startsWith('commander.')) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

const currentFilePath = fileURLToPath(import.meta.url);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === currentFilePath
) {
  await main();
}
