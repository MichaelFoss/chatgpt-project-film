import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';
import {
  appendTitleReactionEvents,
  buildTitleReactions,
} from './title-reactions.js';

function uniqueCanonicalIds(canonicalIds) {
  const seen = new Set();
  const unique = [];

  for (const canonicalId of canonicalIds) {
    const normalized = String(canonicalId ?? '').trim();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

export function parseCanonicalIdListArgs(args, usage) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new CatalogBuildError(usage);
  }

  if (args.some((arg) => arg.startsWith('--'))) {
    throw new CatalogBuildError(usage);
  }

  const canonicalIds = uniqueCanonicalIds(args);

  if (
    canonicalIds.some((canonicalId) => !isNonEmptyString(canonicalId))
  ) {
    throw new CatalogBuildError(usage);
  }

  return { canonicalIds };
}

export function validateCatalogTargets({ catalog, canonicalIds }) {
  const missing = canonicalIds.filter(
    (canonicalId) => !catalog[canonicalId],
  );

  if (missing.length > 0) {
    throw new CatalogBuildError(
      `No catalog title found for canonical ID: ${missing.join(', ')}`,
    );
  }

  return canonicalIds.map((canonicalId) => catalog[canonicalId]);
}

export async function appendAndBuildTitleReactionEvents({
  rootDir,
  eventsPath,
  events,
  catalog,
  projectionPathKeys = [
    'outputPathWritten',
    'ignoredOutputPathWritten',
  ],
}) {
  let appendReport = {
    eventsAppended: 0,
    outputPathWritten: null,
  };
  let projectionReport = {};

  if (events.length > 0) {
    appendReport = await appendTitleReactionEvents({
      eventsPath,
      events: events.map(({ title, ...event }) => event),
      catalog,
    });
    projectionReport = await buildTitleReactions({ rootDir });
  }

  const filesWritten = [
    appendReport.outputPathWritten,
    ...projectionPathKeys.map((key) => projectionReport[key]),
  ]
    .filter(Boolean)
    .map((filePath) => path.relative(rootDir, filePath));

  return {
    appendReport,
    projectionReport,
    filesWritten,
  };
}
