import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  exportReactions,
  formatReactionExportItems,
  formatReactionExportJson,
  parseReactionExportCliArgs,
} from './lib/reaction-query.js';

export {
  exportReactions,
  formatReactionExportItems,
  formatReactionExportJson,
  parseReactionExportCliArgs,
  reactionExportUsage,
} from './lib/reaction-query.js';

async function main() {
  try {
    const { json } = parseReactionExportCliArgs(process.argv.slice(2));
    const items = await exportReactions();

    console.log(
      json
        ? formatReactionExportJson(items)
        : formatReactionExportItems(items),
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
