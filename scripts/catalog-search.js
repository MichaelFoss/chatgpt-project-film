import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  formatCatalogItems,
  parseCatalogSearchCliArgs,
  searchCatalog,
} from './lib/catalog-query.js';

export {
  formatCatalogItems,
  parseCatalogSearchCliArgs,
  searchCatalog,
} from './lib/catalog-query.js';

async function main() {
  try {
    const { filters, json } = parseCatalogSearchCliArgs(
      process.argv.slice(2),
    );
    const items = await searchCatalog({ filters });
    console.log(
      json ? JSON.stringify(items, null, 2) : formatCatalogItems(items),
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
