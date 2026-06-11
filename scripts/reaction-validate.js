import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import {
  formatReactionValidationReport,
  validateReactionProjection,
  validateReactionProjectionFromFiles,
} from './lib/reaction-validation.js';

export {
  formatReactionValidationReport,
  validateReactionProjection,
  validateReactionProjectionFromFiles,
} from './lib/reaction-validation.js';

const reactionValidationUsage = [
  'Usage:',
  '  yarn reactions:validate',
].join('\n');

function parseReactionValidationCliArgs(args) {
  if (args.length > 0) {
    throw new CatalogBuildError(reactionValidationUsage);
  }
}

async function main() {
  try {
    parseReactionValidationCliArgs(process.argv.slice(2));

    const report = await validateReactionProjectionFromFiles();
    console.log(formatReactionValidationReport(report));

    if (report.invalidRecords > 0) {
      process.exitCode = 1;
    }
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
