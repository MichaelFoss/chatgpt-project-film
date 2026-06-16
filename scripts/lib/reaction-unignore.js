import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readCatalog } from './catalog-query.js';
import { titleUnignoredEventType } from './title-reactions.js';
import { readReactionIgnoredState } from './reaction-cli.js';
import {
  appendAndBuildTitleReactionEvents,
  parseCanonicalIdListArgs,
  validateCatalogTargets,
} from './reaction-command-utils.js';

export const reactionUnignoreUsage = [
  'Usage:',
  '  yarn reactions:unignore <canonicalId> [...<canonicalId>]',
].join('\n');

export function parseReactionUnignoreCliArgs(args) {
  return parseCanonicalIdListArgs(args, reactionUnignoreUsage);
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
  return validateCatalogTargets({ catalog, canonicalIds });
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

  const { appendReport, filesWritten } =
    await appendAndBuildTitleReactionEvents({
      rootDir,
      eventsPath,
      events,
      catalog,
      projectionPathKeys: [
        'outputPathWritten',
        'ignoredOutputPathWritten',
      ],
    });

  const report = {
    eventsWritten: appendReport.eventsAppended,
    events,
    alreadyUnignored,
    filesWritten,
  };

  writeOutput(formatReactionUnignoreSummary(report));
  return report;
}
