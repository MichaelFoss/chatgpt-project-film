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
  promptForReaction,
  readReactionCatalog,
  readReactionState,
  selectReactionTitle,
} from './lib/reaction-cli.js';

export {
  createReactionPromptConfig,
  createSimulatedReactionEvent,
  createReactionCommand,
  formatVisibleReactionChoices,
  formatSimulatedReactionEvent,
  formatReactionTitle,
  getReactionPromptChoices,
  parseReactionCliArgs,
  promptForReaction,
  readReactionCatalog,
  readReactionState,
  selectReactionChoiceByKey,
  selectFirstUnreactedTitle,
  selectReactionTitle,
} from './lib/reaction-cli.js';

async function main() {
  try {
    parseReactionCliArgs(process.argv.slice(2));
    const item = await selectReactionTitle();
    console.log(formatReactionTitle(item));

    if (!item) {
      return;
    }

    const reaction = await promptForReaction();
    const event = createSimulatedReactionEvent(item, reaction);
    console.log(formatSimulatedReactionEvent(event));
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
