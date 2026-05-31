import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogBuildError } from './lib/catalog-build-error.js';
import { createPlexClient } from './lib/plex-client.js';

export function readPlexConfig(env = process.env) {
  return {
    plexUrl: env.PLEX_URL?.trim() ?? '',
    plexToken: env.PLEX_TOKEN?.trim() ?? '',
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
} = {}) {
  const config = validatePlexConfig(readPlexConfig(env));
  const client = createPlexClient({ ...config, fetchImpl });
  const movieSummaries = await client.fetchMovieSummaries();
  const firstMovieSummary = movieSummaries[0] ?? null;

  if (firstMovieSummary) {
    await client.fetchMovieMetadata(firstMovieSummary.ratingKey);
  }

  return `Plex movie summaries read: ${movieSummaries.length}.`;
}

async function main() {
  try {
    console.log(await planPlexImport());
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
