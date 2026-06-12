import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReactionPromptConfig,
  createTitleReactionEvent,
  createReactionCommand,
  findReactionTitleById,
  formatSearchResults,
  formatVisibleRatingScale,
  formatVisibleReactionChoices,
  formatReactionWriteSummary,
  formatReactionTitle,
  parseReactionCliArgs,
  runReactionSession,
} from './lib/reaction-cli.js';
export { ratingForReaction } from './lib/reaction-ratings.js';

export {
  createReactionPromptConfig,
  createTitleReactionEvent,
  createReactionCommand,
  formatVisibleReactionChoices,
  formatReactionWriteSummary,
  formatReactionTitle,
  findReactionTitleById,
  formatSearchResults,
  formatVisibleRatingScale,
  getQuitConfirmationChoices,
  getReactionPromptChoices,
  getSearchSelectionChoices,
  parseReactionCliArgs,
  promptForSearchQuery,
  promptForSearchSelection,
  promptForQuitConfirmation,
  promptForReaction,
  readReactionCatalog,
  readReactionState,
  runReactionSession,
  searchReactionCatalog,
  selectReactionChoiceByKey,
  selectEligibleReactionTitles,
  selectFirstUnreactedTitle,
  selectRandomUnreactedTitle,
  selectReactionTitleFromSearch,
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

    if (
      error instanceof Error &&
      error.code?.startsWith('commander.')
    ) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    if (error.name === 'CatalogBuildError') {
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
