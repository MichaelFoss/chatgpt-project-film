import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import { importCatalogItems } from './lib/catalog-importer.js';
import {
  createPlexImportPlanningReport,
  planPlexImport,
} from './plex-plan.js';

export const plexImportUsage = [
  'Usage:',
  '  yarn plex:import [--plan|--write] [--json]',
  '',
  'Options:',
  '  --plan',
  '  --write',
  '  --json',
].join('\n');

export function parsePlexImportCliArgs(args) {
  let mode = 'plan';
  let modeFlag;
  let json = false;

  for (const arg of args) {
    if (arg === '--plan') {
      if (modeFlag && modeFlag !== 'plan') {
        throw new CatalogBuildError(plexImportUsage);
      }

      mode = 'plan';
      modeFlag = 'plan';
      continue;
    }

    if (arg === '--write') {
      if (modeFlag && modeFlag !== 'write') {
        throw new CatalogBuildError(plexImportUsage);
      }

      mode = 'write';
      modeFlag = 'write';
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new CatalogBuildError(
        `${plexImportUsage} Unknown flag: ${arg}`,
      );
    }

    throw new CatalogBuildError(plexImportUsage);
  }

  return { mode, json };
}

function toCatalogCanonicalId(canonicalId) {
  return canonicalId.startsWith('imdb:')
    ? canonicalId
    : `imdb:${canonicalId}`;
}

function createPlexWriteJsonReport({ planningReport, importReport }) {
  return {
    moviesScanned: planningReport.moviesScanned,
    eventsAppended: importReport.eventsAppended,
    previouslyRepresented:
      planningReport.alreadyRepresentedItems.length,
    skippedReviewItems: planningReport.needsReviewItems.length,
  };
}

export function formatPlexWriteJsonReport({
  planningReport,
  importReport,
}) {
  return JSON.stringify(
    createPlexWriteJsonReport({ planningReport, importReport }),
    null,
    2,
  );
}

export function formatPlexWriteReport({
  planningReport,
  importReport,
}) {
  return [
    `Movies scanned: ${planningReport.moviesScanned}`,
    `Events appended: ${importReport.eventsAppended}`,
    `Previously represented: ${planningReport.alreadyRepresentedItems.length}`,
    `Skipped review items: ${planningReport.needsReviewItems.length}`,
  ].join('\n');
}

export async function importPlex({
  args = [],
  env = process.env,
  fetchImpl = globalThis.fetch,
  rootDir = process.cwd(),
  eventsPath,
} = {}) {
  const { mode, json } = parsePlexImportCliArgs(args);

  if (mode === 'write') {
    const planningReport = await createPlexImportPlanningReport({
      env,
      fetchImpl,
      rootDir,
      eventsPath,
    });
    const importReport = await importCatalogItems({
      rootDir,
      eventsPath,
      mode: 'write',
      items: planningReport.plannedItems.map((item) => ({
        canonicalId: toCatalogCanonicalId(item.canonicalId),
        source: 'plex',
      })),
    });

    return json
      ? formatPlexWriteJsonReport({ planningReport, importReport })
      : formatPlexWriteReport({ planningReport, importReport });
  }

  return planPlexImport({
    env,
    fetchImpl,
    rootDir,
    eventsPath,
    json,
  });
}

async function main() {
  try {
    console.log(await importPlex({ args: process.argv.slice(2) }));
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
