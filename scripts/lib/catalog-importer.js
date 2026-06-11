import fs from 'node:fs/promises';
import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import {
  appendEvents,
  readEvents,
  replayCatalogAddEvents,
  validateCatalogAddEvent,
} from './catalog-events.js';
import { isNonEmptyString } from './catalog-utils.js';

const allowedImportFields = new Set([
  'canonicalId',
  'source',
  'metadataLookup',
  'occurredAt',
]);

export function createCatalogImportReport(eventsPath = null) {
  return {
    inputItemsRead: 0,
    validInputItems: 0,
    invalidInputItems: 0,
    duplicateInputItemsSkipped: 0,
    alreadyExistingCatalogItemsSkipped: 0,
    eventsPlanned: 0,
    eventsAppended: 0,
    invalidItems: [],
    duplicateInputItems: [],
    alreadyExistingCatalogItems: [],
    plannedEvents: [],
    fatalErrors: [],
    outputPathWritten: null,
    intendedOutputPath: eventsPath,
  };
}

export function formatCatalogImportReport(report) {
  const lines = [
    'Catalog import report',
    `- input items read: ${report.inputItemsRead}`,
    `- valid input items: ${report.validInputItems}`,
    `- invalid input items: ${report.invalidInputItems}`,
  ];

  for (const item of report.invalidItems) {
    lines.push(`  - item ${item.index}: ${item.reason}`);
  }

  lines.push(
    `- duplicate input items skipped: ${report.duplicateInputItemsSkipped}`,
  );

  for (const item of report.duplicateInputItems) {
    lines.push(`  - item ${item.index}: ${item.canonicalId}`);
  }

  lines.push(
    `- already-existing catalog items skipped: ${report.alreadyExistingCatalogItemsSkipped}`,
  );

  for (const item of report.alreadyExistingCatalogItems) {
    lines.push(`  - item ${item.index}: ${item.canonicalId}`);
  }

  lines.push(
    `- events planned: ${report.eventsPlanned}`,
    `- events appended: ${report.eventsAppended}`,
  );

  for (const event of report.plannedEvents) {
    lines.push(`  - ${event.canonicalId}`);
  }

  if (report.fatalErrors.length > 0) {
    lines.push(`- fatal errors: ${report.fatalErrors.length}`);

    for (const error of report.fatalErrors) {
      lines.push(`  - ${error}`);
    }
  } else {
    lines.push('- fatal errors: 0');
  }

  lines.push(
    `- output path written: ${report.outputPathWritten ?? 'none'}`,
  );

  return lines.join('\n');
}

export function resolveCatalogImportMode(args) {
  const hasPlan = args.includes('--plan');
  const hasWrite = args.includes('--write');

  if (hasPlan === hasWrite) {
    throw new CatalogBuildError(
      'Catalog import requires exactly one of --plan or --write.',
    );
  }

  return hasWrite ? 'write' : 'plan';
}

function rejectUnknownFlags(args, allowedFlags, usage) {
  const unknownFlag = args.find(
    (arg) => arg.startsWith('--') && !allowedFlags.has(arg),
  );

  if (unknownFlag) {
    throw new CatalogBuildError(
      `${usage} Unknown flag: ${unknownFlag}`,
    );
  }
}

export function parseCatalogImportCliArgs(args) {
  rejectUnknownFlags(
    args,
    new Set(['--plan', '--write']),
    'Usage: yarn catalog:import <path> --plan|--write',
  );
  const mode = resolveCatalogImportMode(args);
  const positional = args.filter((arg) => !arg.startsWith('--'));

  if (positional.length !== 1) {
    throw new CatalogBuildError(
      'Usage: yarn catalog:import <path> --plan|--write',
    );
  }

  return {
    mode,
    inputPath: positional[0],
  };
}

export function parseCatalogAddCliArgs(args) {
  const usage =
    'Usage: yarn catalog:add <canonicalId> --source <manual|plex> --plan|--write';

  rejectUnknownFlags(
    args,
    new Set(['--source', '--plan', '--write']),
    usage,
  );
  const mode = resolveCatalogImportMode(args);
  const sourceFlagIndex = args.indexOf('--source');

  if (
    sourceFlagIndex === -1 ||
    !args[sourceFlagIndex + 1] ||
    args[sourceFlagIndex + 1].startsWith('--')
  ) {
    throw new CatalogBuildError(usage);
  }

  const positional = args.filter((arg, index) => {
    if (arg.startsWith('--')) {
      return false;
    }

    return index !== sourceFlagIndex + 1;
  });

  if (positional.length !== 1) {
    throw new CatalogBuildError(usage);
  }

  return {
    mode,
    item: {
      canonicalId: positional[0],
      source: args[sourceFlagIndex + 1],
    },
  };
}

export async function readCatalogImportItems(inputPath) {
  const text = await fs.readFile(inputPath, 'utf8');
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new CatalogBuildError(
      'Catalog import input must be a JSON array.',
    );
  }

  return parsed;
}

function toCatalogBuildError(error, message) {
  if (error instanceof CatalogBuildError) {
    return error;
  }

  return new CatalogBuildError(`${message}: ${error.message}`);
}

function validateImportItem(item, index, now) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return {
      ok: false,
      reason: 'item must be a JSON object.',
    };
  }

  const unsupportedFields = Object.keys(item).filter(
    (field) => !allowedImportFields.has(field),
  );

  if (unsupportedFields.length > 0) {
    return {
      ok: false,
      reason: `unsupported field: ${unsupportedFields.sort()[0]}`,
    };
  }

  if (!isNonEmptyString(item.canonicalId)) {
    return {
      ok: false,
      reason: 'canonicalId must be a non-empty string.',
    };
  }

  if (!isNonEmptyString(item.source)) {
    return {
      ok: false,
      reason: 'source is required.',
    };
  }

  const event = {
    eventType: 'catalog.add',
    occurredAt: item.occurredAt ?? now,
    source: item.source,
    canonicalId: item.canonicalId,
    metadataLookup: item.metadataLookup ?? 'auto',
  };

  try {
    const validated = validateCatalogAddEvent(event, index);

    return {
      ok: true,
      event: {
        eventType: 'catalog.add',
        occurredAt: validated.occurredAt,
        source: validated.source,
        canonicalId: validated.canonicalId,
        metadataLookup: validated.metadataLookup,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error.message.replace(/^event \d+ /, ''),
    };
  }
}

function planCatalogImportItems({ items, existingCanonicalIds, now }) {
  const report = createCatalogImportReport();
  const seenInputCanonicalIds = new Set();

  report.inputItemsRead = items.length;

  for (const [index, item] of items.entries()) {
    const itemIndex = index + 1;
    const validation = validateImportItem(item, index, now);

    if (!validation.ok) {
      report.invalidInputItems += 1;
      report.invalidItems.push({
        index: itemIndex,
        reason: validation.reason,
      });
      continue;
    }

    report.validInputItems += 1;

    if (seenInputCanonicalIds.has(validation.event.canonicalId)) {
      report.duplicateInputItemsSkipped += 1;
      report.duplicateInputItems.push({
        index: itemIndex,
        canonicalId: validation.event.canonicalId,
      });
      continue;
    }

    seenInputCanonicalIds.add(validation.event.canonicalId);

    if (existingCanonicalIds.has(validation.event.canonicalId)) {
      report.alreadyExistingCatalogItemsSkipped += 1;
      report.alreadyExistingCatalogItems.push({
        index: itemIndex,
        canonicalId: validation.event.canonicalId,
      });
      continue;
    }

    report.plannedEvents.push(validation.event);
  }

  report.eventsPlanned = report.plannedEvents.length;

  return report;
}

export async function importCatalogItems({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'catalog.events.ndjson'),
  items,
  mode,
  now = new Date().toISOString(),
} = {}) {
  const report = createCatalogImportReport(eventsPath);

  try {
    if (mode !== 'plan' && mode !== 'write') {
      throw new CatalogBuildError(
        'Catalog import mode must be "plan" or "write".',
      );
    }

    if (!Array.isArray(items)) {
      throw new CatalogBuildError(
        'Catalog import items must be an array.',
      );
    }

    const events = await readEvents(eventsPath);
    const replay = replayCatalogAddEvents(events);
    const existingCanonicalIds = new Set(
      replay.catalogAdds.map(({ canonicalId }) => canonicalId),
    );
    const plannedReport = planCatalogImportItems({
      items,
      existingCanonicalIds,
      now,
    });

    Object.assign(report, plannedReport, {
      intendedOutputPath: eventsPath,
    });

    if (mode === 'write') {
      await appendEvents(eventsPath, report.plannedEvents);
      report.eventsAppended = report.plannedEvents.length;

      if (report.eventsAppended > 0) {
        report.outputPathWritten = eventsPath;
      }
    }

    return report;
  } catch (error) {
    const catalogError = toCatalogBuildError(
      error,
      'Catalog import failed',
    );
    report.fatalErrors.push(catalogError.message);
    catalogError.report = report;
    throw catalogError;
  }
}

export async function importCatalogFile({
  inputPath,
  mode,
  rootDir = process.cwd(),
  eventsPath,
  now,
} = {}) {
  try {
    const items = await readCatalogImportItems(inputPath);

    return await importCatalogItems({
      rootDir,
      eventsPath,
      items,
      mode,
      now,
    });
  } catch (error) {
    const report = createCatalogImportReport(
      eventsPath ??
        path.join(rootDir, 'events', 'catalog.events.ndjson'),
    );
    const catalogError = toCatalogBuildError(
      error,
      'Catalog import failed',
    );
    report.fatalErrors.push(catalogError.message);
    catalogError.report = error.report ?? report;
    throw catalogError;
  }
}
