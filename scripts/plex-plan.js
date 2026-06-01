import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import { createPlexClient } from './lib/plex-client.js';
import { planPlexPlanningItems } from './lib/plex-import-planner.js';
import {
  formatPlexPlanJsonReport,
  formatPlexPlanReport,
  parsePlexPlanCliArgs,
} from './lib/plex-report.js';

export {
  formatPlexPlanJsonReport,
  formatPlexPlanReport,
  parsePlexPlanCliArgs,
} from './lib/plex-report.js';

export function readPlexConfig(env = process.env) {
  return {
    plexUrl: env.PLEX_URL?.trim() ?? '',
    plexToken: env.PLEX_TOKEN?.trim() ?? '',
    plexDebug: env.PLEX_DEBUG,
  };
}

export function validatePlexConfig(config = readPlexConfig()) {
  const missing = [];

  if (!config.plexUrl) {
    missing.push('PLEX_URL');
  }

  if (!config.plexToken) {
    missing.push('PLEX_TOKEN');
  }

  if (missing.length > 0) {
    throw new CatalogBuildError(
      `Missing required Plex configuration: ${missing.join(', ')}.`,
    );
  }

  return config;
}

export async function planPlexImport({
  env = process.env,
  fetchImpl = globalThis.fetch,
  rootDir = process.cwd(),
  eventsPath,
  json = false,
} = {}) {
  const report = await createPlexImportPlanningReport({
    env,
    fetchImpl,
    rootDir,
    eventsPath,
  });

  return json
    ? formatPlexPlanJsonReport(report)
    : formatPlexPlanReport(report);
}

export async function createPlexImportPlanningReport({
  env = process.env,
  fetchImpl = globalThis.fetch,
  rootDir = process.cwd(),
  eventsPath,
} = {}) {
  const config = validatePlexConfig(readPlexConfig(env));
  const client = createPlexClient({
    plexUrl: config.plexUrl,
    plexToken: config.plexToken,
    fetchImpl,
    debug: config.plexDebug,
  });

  return planPlexPlanningItems({
    client,
    rootDir,
    eventsPath,
  });
}

async function main() {
  try {
    const { json } = parsePlexPlanCliArgs(process.argv.slice(2));
    console.log(await planPlexImport({ json }));
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
