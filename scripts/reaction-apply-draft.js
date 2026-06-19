import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  applyReactionDraft,
  createReactionDraftEvents,
  formatReactionApplyDraftSummary,
  parseReactionApplyDraftCliArgs,
  reactionApplyDraftUsage,
  readReactionDraft,
  validateReactionDraft,
} from './lib/reaction-apply-draft.js';

export {
  applyReactionDraft,
  createReactionDraftEvents,
  formatReactionApplyDraftSummary,
  parseReactionApplyDraftCliArgs,
  reactionApplyDraftUsage,
  readReactionDraft,
  validateReactionDraft,
} from './lib/reaction-apply-draft.js';

async function main() {
  try {
    await applyReactionDraft({ args: process.argv.slice(2) });
  } catch (error) {
    console.error(error.message);

    if (error instanceof CatalogBuildError) {
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
