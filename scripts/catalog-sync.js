import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatCatalogSyncReport,
  hasCatalogSyncFatalErrors,
  syncCatalog,
} from './lib/catalog-sync.js';

export {
  createCatalogSyncReport,
  formatCatalogSyncReport,
  hasCatalogSyncFatalErrors,
  syncCatalog,
} from './lib/catalog-sync.js';

async function main() {
  const report = await syncCatalog();
  const output = formatCatalogSyncReport(report);

  if (hasCatalogSyncFatalErrors(report)) {
    console.error(output);
    process.exitCode = 1;
    return;
  }

  console.log(output);
}

const currentFilePath = fileURLToPath(import.meta.url);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === currentFilePath
) {
  await main();
}
