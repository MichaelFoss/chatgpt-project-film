import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { readCatalog } from './catalog-query.js';
import { isNonEmptyString } from './catalog-utils.js';
import {
  appendTitleReactionEvents,
  buildTitleReactions,
  titleReactionResetEventType,
} from './title-reactions.js';
import { readReactionState } from './reaction-cli.js';

export const reactionResetUsage = [
  'Usage:',
  '  yarn reactions:reset <canonicalId> [...<canonicalId>]',
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

export function parseReactionResetCliArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new CatalogBuildError(reactionResetUsage);
  }

  if (args.some((arg) => arg.startsWith('--'))) {
    throw new CatalogBuildError(reactionResetUsage);
  }

  const canonicalIds = uniqueCanonicalIds(args);

  if (
    canonicalIds.some((canonicalId) => !isNonEmptyString(canonicalId))
  ) {
    throw new CatalogBuildError(reactionResetUsage);
  }

  return { canonicalIds };
}

export function createTitleReactionResetEvent(
  item,
  {
    eventId = randomUUID(),
    occurredAt = new Date().toISOString(),
  } = {},
) {
  return {
    eventId,
    type: titleReactionResetEventType,
    occurredAt,
    canonicalId: item.canonicalId,
  };
}

export function validateReactionResetTargets({
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

export function formatReactionResetSummary(report) {
  const lines = [
    `Wrote ${report.eventsWritten} title reaction reset event(s).`,
  ];

  if (report.events.length > 0) {
    lines.push(
      ...report.events.map(
        (event) => `- ${event.title} (${event.canonicalId})`,
      ),
    );
  }

  if (report.alreadyUnreacted.length > 0) {
    lines.push(
      'Already eligible-unreacted:',
      ...report.alreadyUnreacted.map(
        (item) => `- ${item.title} (${item.canonicalId})`,
      ),
    );
  }

  return lines.join('\n');
}

export async function resetReactions({
  rootDir = process.cwd(),
  args = [],
  eventFactory = createTitleReactionResetEvent,
  writeOutput = (message) => console.log(message),
} = {}) {
  const { canonicalIds } = Array.isArray(args)
    ? parseReactionResetCliArgs(args)
    : args;
  const catalogPath = path.join(rootDir, 'data', 'catalog.json');
  const reactionsPath = path.join(
    rootDir,
    'data',
    'title-reactions.json',
  );
  const eventsPath = path.join(
    rootDir,
    'events',
    'title-reactions.events.ndjson',
  );
  const [catalog, reactions] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionState({ rootDir, reactionsPath }),
  ]);
  const targetItems = validateReactionResetTargets({
    catalog,
    canonicalIds,
  });
  const events = [];
  const alreadyUnreacted = [];

  for (const item of targetItems) {
    if (!reactions[item.canonicalId]) {
      alreadyUnreacted.push(item);
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
    alreadyUnreacted,
    filesWritten: [
      appendReport.outputPathWritten,
      projectionReport.outputPathWritten,
    ]
      .filter(Boolean)
      .map((filePath) => path.relative(rootDir, filePath)),
  };

  writeOutput(formatReactionResetSummary(report));
  return report;
}
