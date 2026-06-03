import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import { planMetadataHydration } from './lib/metadata-hydration-planner.js';
import { executeMetadataHydrationWrite } from './lib/metadata-hydration-writer.js';
import {
  createMetadataHydrationPlanReport,
  formatMetadataHydrationPlanReport,
} from './lib/metadata-hydration-report.js';

export { planMetadataHydration } from './lib/metadata-hydration-planner.js';
export {
  executeMetadataHydrationWrite,
  metadataHydrationWriteDefaults,
} from './lib/metadata-hydration-writer.js';
export {
  createMetadataHydrationPlanReport,
  formatMetadataHydrationPlanReport,
} from './lib/metadata-hydration-report.js';

export function resolveMetadataHydrationCommand(args = process.argv) {
  const command = args[2];

  if (command === 'plan' || command === 'write') {
    return command;
  }

  throw new CatalogBuildError(
    'Metadata hydration command must be "plan" or "write".',
  );
}

function readFlagValue({ args, index, name }) {
  const inlinePrefix = `${name}=`;
  const arg = args[index];

  if (arg.startsWith(inlinePrefix)) {
    return {
      value: arg.slice(inlinePrefix.length),
      nextIndex: index,
    };
  }

  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new CatalogBuildError(
      `Metadata hydration option ${name} requires a value.`,
    );
  }

  return {
    value,
    nextIndex: index + 1,
  };
}

function parsePositiveInteger(value, optionName) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new CatalogBuildError(
      `Metadata hydration option ${optionName} must be a positive integer.`,
    );
  }

  return Number(value);
}

export function parseMetadataHydrationCli(args = process.argv) {
  const command = resolveMetadataHydrationCommand(args);
  const options = {
    command,
    providerId: 'mock',
    dryRun: false,
  };
  const commandArgs = args.slice(3);

  if (command === 'plan' && commandArgs.length > 0) {
    throw new CatalogBuildError(
      'Metadata hydration plan mode does not accept options yet.',
    );
  }

  for (let index = 0; index < commandArgs.length; index += 1) {
    const arg = commandArgs[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--provider' || arg.startsWith('--provider=')) {
      const parsed = readFlagValue({
        args: commandArgs,
        index,
        name: '--provider',
      });
      options.providerId = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const parsed = readFlagValue({
        args: commandArgs,
        index,
        name: '--limit',
      });
      options.limit = parsePositiveInteger(parsed.value, '--limit');
      index = parsed.nextIndex;
      continue;
    }

    if (arg === '--id' || arg.startsWith('--id=')) {
      const parsed = readFlagValue({
        args: commandArgs,
        index,
        name: '--id',
      });
      options.targetCanonicalId = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    throw new CatalogBuildError(
      `Unknown metadata hydration option: ${arg}`,
    );
  }

  return options;
}

async function main() {
  try {
    const options = parseMetadataHydrationCli();
    const report =
      options.command === 'write'
        ? await executeMetadataHydrationWrite({
            providerId: options.providerId,
            limit: options.limit,
            targetCanonicalId: options.targetCanonicalId,
            dryRun: options.dryRun,
          })
        : await planMetadataHydration();
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
