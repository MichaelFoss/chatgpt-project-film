import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import { planMetadataHydration } from './lib/metadata-hydration-planner.js';
import {
  createMetadataHydrationPlanReport,
  formatMetadataHydrationPlanReport,
} from './lib/metadata-hydration-report.js';

export { planMetadataHydration } from './lib/metadata-hydration-planner.js';
export {
  createMetadataHydrationPlanReport,
  formatMetadataHydrationPlanReport,
} from './lib/metadata-hydration-report.js';

export function resolveMetadataHydrationCommand(args = process.argv) {
  const command = args[2];

  if (command === 'plan') {
    return command;
  }

  throw new CatalogBuildError(
    'Metadata hydration command must be "plan".',
  );
}

async function main() {
  try {
    resolveMetadataHydrationCommand();
    const report = await planMetadataHydration();
    console.log(formatMetadataHydrationPlanReport(report));
  } catch (error) {
    const report = error.report ?? createMetadataHydrationPlanReport();
    if (!error.report) {
      report.fatalErrors.push(error.message);
    }
    console.error(formatMetadataHydrationPlanReport(report));

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
