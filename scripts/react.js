import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReactionPromptConfig,
  createSimulatedReactionEvent,
  createReactionCommand,
  formatVisibleReactionChoices,
  formatSimulatedReactionEvent,
  formatReactionTitle,
  parseReactionCliArgs,
  runReactionSession,
} from './lib/reaction-cli.js';

export {
  createReactionPromptConfig,
  createSimulatedReactionEvent,
  createReactionCommand,
  formatVisibleReactionChoices,
  formatSimulatedReactionEvent,
  formatReactionTitle,
  getQuitConfirmationChoices,
  getReactionPromptChoices,
  parseReactionCliArgs,
  promptForQuitConfirmation,
  promptForReaction,
  readReactionCatalog,
  readReactionState,
  runReactionSession,
  selectReactionChoiceByKey,
  selectFirstUnreactedTitle,
  selectReactionTitle,
} from './lib/reaction-cli.js';

async function main() {
  try {
    await runReactionSession({ args: process.argv.slice(2) });
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
