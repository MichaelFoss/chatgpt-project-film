import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  createCatalogImportReport,
  formatCatalogImportReport,
  importCatalogItems,
  parseCatalogAddCliArgs,
} from './lib/catalog-importer.js';

export {
  createCatalogImportReport,
  formatCatalogImportReport,
  importCatalogItems,
  parseCatalogAddCliArgs,
} from './lib/catalog-importer.js';

async function main() {
  try {
    const { item, mode } = parseCatalogAddCliArgs(
      process.argv.slice(2),
    );
    const report = await importCatalogItems({ items: [item], mode });
    console.log(formatCatalogImportReport(report));
  } catch (error) {
    const report = error.report ?? createCatalogImportReport();

    if (!error.report) {
      report.fatalErrors.push(error.message);
    }

    console.error(formatCatalogImportReport(report));

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
