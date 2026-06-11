import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  formatReactionStats,
  getReactionStatsFromProjections,
} from './lib/reaction-stats.js';

export {
  formatReactionStats,
  getReactionStats,
  getReactionStatsFromProjections,
} from './lib/reaction-stats.js';

async function main() {
  try {
    const stats = await getReactionStatsFromProjections();
    console.log(formatReactionStats(stats));
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
