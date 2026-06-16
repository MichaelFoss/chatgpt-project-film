import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  createTitleReactionResetEvent,
  formatReactionResetSummary,
  parseReactionResetCliArgs,
  reactionResetUsage,
  resetReactions,
  validateReactionResetTargets,
} from './lib/reaction-reset.js';

export {
  createTitleReactionResetEvent,
  formatReactionResetSummary,
  parseReactionResetCliArgs,
  reactionResetUsage,
  resetReactions,
  validateReactionResetTargets,
} from './lib/reaction-reset.js';

async function main() {
  try {
    await resetReactions({ args: process.argv.slice(2) });
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
