import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReactionPromptConfig,
  DEFAULT_HTML_LIMIT,
  createTitleIgnoredEvent,
  createTitleReactionEvent,
  createReactionCommand,
  findReactionTitleById,
  formatReactedTitleIgnoreError,
  formatSearchResultThresholdMessage,
  formatSearchResults,
  formatIgnoredTitleRateError,
  formatExistingReaction,
  formatVisibleRatingScale,
  formatVisibleReactionChoices,
  formatReactionWriteSummary,
  formatReactionTitle,
  formatTitleInformation,
  reviewIndent,
  reviewNestedIndent,
  reviewPlotWrapColumns,
  reviewTopBilledActorLimit,
  parseReactionCliArgs,
  runReactionSession,
} from './lib/reaction-cli.js';
export { ratingForReaction } from './lib/reaction-ratings.js';

export {
  createReactionPromptConfig,
  DEFAULT_HTML_LIMIT,
  createTitleIgnoredEvent,
  createTitleReactionEvent,
  createReactionCommand,
  formatExistingReaction,
  formatIgnoredTitleRateError,
  formatReactedTitleIgnoreError,
  formatSearchResultThresholdMessage,
  formatVisibleReactionChoices,
  formatReactionWriteSummary,
  formatReactionTitle,
  formatTitleInformation,
  reviewIndent,
  reviewNestedIndent,
  reviewPlotWrapColumns,
  reviewTopBilledActorLimit,
  findReactionTitleById,
  formatSearchResults,
  formatVisibleRatingScale,
  getQuitConfirmationChoices,
  getReactionPromptChoices,
  getSearchSelectionChoices,
  parseReactionCliArgs,
  promptForSearchQuery,
  promptForSearchSelection,
  promptForReactionNotes,
  promptForReactionReasons,
  promptForQuitConfirmation,
  promptForReaction,
  readReactionCatalog,
  readReactionIgnoredState,
  readReactionSearchResultThreshold,
  readReactionState,
  renderReactionReviewHtml,
  runReactionSession,
  searchReactionCatalog,
  selectReactionChoiceByKey,
  selectEligibleReactionTitles,
  selectFirstUnreactedTitle,
  selectRandomUnreactedTitle,
  selectReactionSessionTitles,
  selectReactionTitleFromSearch,
  selectReactionTitle,
  shouldWriteSearchResultsBeforeSelection,
  writeReactionReviewHtml,
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
