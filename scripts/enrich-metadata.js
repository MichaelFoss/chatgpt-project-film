import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import { planMetadataEnrichment } from './lib/metadata-enrichment-planner.js';
import {
  createMetadataEnrichmentReport,
  formatMetadataEnrichmentReport,
} from './lib/metadata-enrichment-report.js';

export { planMetadataEnrichment } from './lib/metadata-enrichment-planner.js';
export {
  createMetadataEnrichmentReport,
  formatMetadataEnrichmentReport,
} from './lib/metadata-enrichment-report.js';
export {
  metadataProviders,
  notImplementedProvider,
} from './lib/metadata-providers/index.js';

async function main() {
  try {
    const report = await planMetadataEnrichment();
    console.log(formatMetadataEnrichmentReport(report));
  } catch (error) {
    const report = error.report ?? createMetadataEnrichmentReport();
    console.error(formatMetadataEnrichmentReport(report));

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
