import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  formatReactionQueryItems,
  listReactions,
  parseReactionListCliArgs,
} from './lib/reaction-query.js';

export {
  formatReactionQueryItems,
  getIgnoredReactionQueryItems,
  getReactionQueryItems,
  getReactionRatingOptions,
  listReactions,
  parseReactionListCliArgs,
  reactionListUsage,
} from './lib/reaction-query.js';

async function main() {
  try {
    const { ratingBand, ignored } = parseReactionListCliArgs(
      process.argv.slice(2),
    );
    const items = await listReactions({ ratingBand, ignored });

    console.log(
      formatReactionQueryItems(items, { ratingBand, ignored }),
    );
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
