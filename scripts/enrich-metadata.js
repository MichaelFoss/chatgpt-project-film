import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import { executeMetadataEnrichment } from './lib/metadata-enrichment-executor.js';
import { planMetadataEnrichment } from './lib/metadata-enrichment-planner.js';
import {
  createMetadataEnrichmentReport,
  formatMetadataEnrichmentReport,
} from './lib/metadata-enrichment-report.js';

export { planMetadataEnrichment } from './lib/metadata-enrichment-planner.js';
export { executeMetadataEnrichment } from './lib/metadata-enrichment-executor.js';
export {
  createMetadataEnrichmentReport,
  formatMetadataEnrichmentReport,
} from './lib/metadata-enrichment-report.js';
export {
  metadataProviders,
  notImplementedProvider,
} from './lib/metadata-providers/index.js';

export function resolveMetadataEnrichmentCommand(args = process.argv) {
  const command = args[2];

  if (command === 'plan' || command === 'write') {
    return command;
  }

  throw new CatalogBuildError(
    'Metadata enrichment command must be "plan" or "write".',
  );
}

async function main() {
  try {
    const command = resolveMetadataEnrichmentCommand();
    const report =
      command === 'write'
        ? await executeMetadataEnrichment()
        : await planMetadataEnrichment();
    console.log(formatMetadataEnrichmentReport(report));
  } catch (error) {
    const report = error.report ?? createMetadataEnrichmentReport();
    if (!error.report) {
      report.fatalErrors.push(error.message);
    }
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
