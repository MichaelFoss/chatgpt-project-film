import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { readCatalog } from './catalog-query.js';
import { isNonEmptyString } from './catalog-utils.js';
import {
  appendTitleReactionEvents,
  buildTitleReactions,
  titleUnignoredEventType,
} from './title-reactions.js';
import { readReactionIgnoredState } from './reaction-cli.js';

export const reactionUnignoreUsage = [
  'Usage:',
  '  yarn reactions:unignore <canonicalId> [...<canonicalId>]',
].join('\n');

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

export function parseReactionUnignoreCliArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new CatalogBuildError(reactionUnignoreUsage);
  }

  if (args.some((arg) => arg.startsWith('--'))) {
    throw new CatalogBuildError(reactionUnignoreUsage);
  }

  const canonicalIds = uniqueCanonicalIds(args);

  if (
    canonicalIds.some((canonicalId) => !isNonEmptyString(canonicalId))
  ) {
    throw new CatalogBuildError(reactionUnignoreUsage);
  }

  return { canonicalIds };
}

export function createTitleUnignoredEvent(
  item,
  {
    eventId = randomUUID(),
    occurredAt = new Date().toISOString(),
  } = {},
) {
  return {
    eventId,
    type: titleUnignoredEventType,
    occurredAt,
    canonicalId: item.canonicalId,
  };
}

export function validateReactionUnignoreTargets({
  catalog,
  canonicalIds,
}) {
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

export function formatReactionUnignoreSummary(report) {
  const lines = [
    `Wrote ${report.eventsWritten} title unignore event(s).`,
  ];

  if (report.events.length > 0) {
    lines.push(
      ...report.events.map(
        (event) => `- ${event.title} (${event.canonicalId})`,
      ),
    );
  }

  if (report.alreadyUnignored.length > 0) {
    lines.push(
      'Already unignored:',
      ...report.alreadyUnignored.map(
        (item) =>
          `- ${item.title} (${item.canonicalId}) is not currently ignored.`,
      ),
    );
  }

  return lines.join('\n');
}

export async function unignoreReactions({
  rootDir = process.cwd(),
  args = [],
  eventFactory = createTitleUnignoredEvent,
  writeOutput = (message) => console.log(message),
} = {}) {
  const { canonicalIds } = Array.isArray(args)
    ? parseReactionUnignoreCliArgs(args)
    : args;
  const catalogPath = path.join(rootDir, 'data', 'catalog.json');
  const ignoredPath = path.join(rootDir, 'data', 'title-ignored.json');
  const eventsPath = path.join(
    rootDir,
    'events',
    'title-reactions.events.ndjson',
  );
  const [catalog, ignored] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionIgnoredState({ rootDir, ignoredPath }),
  ]);
  const targetItems = validateReactionUnignoreTargets({
    catalog,
    canonicalIds,
  });
  const events = [];
  const alreadyUnignored = [];

  for (const item of targetItems) {
    if (!ignored[item.canonicalId]) {
      alreadyUnignored.push(item);
      continue;
    }

    events.push({
      ...eventFactory(item),
      title: item.title,
    });
  }

  let appendReport = {
    eventsAppended: 0,
    outputPathWritten: null,
  };
  let projectionReport = {
    outputPathWritten: null,
    ignoredOutputPathWritten: null,
  };

  if (events.length > 0) {
    appendReport = await appendTitleReactionEvents({
      eventsPath,
      events: events.map(({ title, ...event }) => event),
      catalog,
    });
    projectionReport = await buildTitleReactions({ rootDir });
  }

  const report = {
    eventsWritten: appendReport.eventsAppended,
    events,
    alreadyUnignored,
    filesWritten: [
      appendReport.outputPathWritten,
      projectionReport.outputPathWritten,
      projectionReport.ignoredOutputPathWritten,
    ]
      .filter(Boolean)
      .map((filePath) => path.relative(rootDir, filePath)),
  };

  writeOutput(formatReactionUnignoreSummary(report));
  return report;
}
