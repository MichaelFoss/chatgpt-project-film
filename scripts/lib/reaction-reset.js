import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readCatalog } from './catalog-query.js';
import { titleReactionResetEventType } from './title-reactions.js';
import { readReactionState } from './reaction-cli.js';
import {
  appendAndBuildTitleReactionEvents,
  parseCanonicalIdListArgs,
  validateCatalogTargets,
} from './reaction-command-utils.js';

export const reactionResetUsage = [
  'Usage:',
  '  yarn reactions:reset <canonicalId> [...<canonicalId>]',
].join('\n');

export function parseReactionResetCliArgs(args) {
  return parseCanonicalIdListArgs(args, reactionResetUsage);
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
  return validateCatalogTargets({ catalog, canonicalIds });
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

  const { appendReport, filesWritten } =
    await appendAndBuildTitleReactionEvents({
      rootDir,
      eventsPath,
      events,
      catalog,
      projectionPathKeys: ['outputPathWritten'],
    });

  const report = {
    eventsWritten: appendReport.eventsAppended,
    events,
    alreadyUnreacted,
    filesWritten,
  };

  writeOutput(formatReactionResetSummary(report));
  return report;
}
