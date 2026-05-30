import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from './lib/catalog-builder.js';
import {
  createBaseReport,
  formatReport,
} from './lib/catalog-report.js';

export { buildCatalog } from './lib/catalog-builder.js';
export { CatalogBuildError } from './lib/catalog-build-error.js';
export { formatReport } from './lib/catalog-report.js';

async function main() {
  try {
    const report = await buildCatalog();
    console.log(formatReport(report));
  } catch (error) {
    const report = error.report ?? createBaseReport(null);
    console.error(formatReport(report));
    process.exitCode = 1;
  }
}

const currentFilePath = fileURLToPath(import.meta.url);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === currentFilePath
) {
  await main();
}
