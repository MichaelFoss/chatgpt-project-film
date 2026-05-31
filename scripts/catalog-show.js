import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  formatCatalogItem,
  parseCatalogShowCliArgs,
  showCatalogItem,
} from './lib/catalog-query.js';

export {
  formatCatalogItem,
  parseCatalogShowCliArgs,
  showCatalogItem,
} from './lib/catalog-query.js';

async function main() {
  try {
    const { canonicalId, json } = parseCatalogShowCliArgs(
      process.argv.slice(2),
    );
    const item = await showCatalogItem({ canonicalId });

    if (!item) {
      if (json) {
        console.log('null');
      } else {
        console.error(formatCatalogItem(item));
      }

      process.exitCode = 1;
      return;
    }

    console.log(
      json ? JSON.stringify(item, null, 2) : formatCatalogItem(item),
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
