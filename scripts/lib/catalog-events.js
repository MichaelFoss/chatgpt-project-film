import fs from 'node:fs/promises';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';

const supportedEventType = 'catalog.add';
const supportedSources = new Set(['manual', 'plex']);
const supportedMetadataLookup = new Set(['auto', 'skip']);

function isValidDateString(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

export function parseNdjson(text, filePath) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ line, lineNumber }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new CatalogBuildError(
          `Invalid JSON in ${filePath} on line ${lineNumber}: ${error.message}`,
        );
      }
    });
}

export async function readEvents(eventsPath) {
  let text;

  try {
    text = await fs.readFile(eventsPath, 'utf8');
  } catch (error) {
    throw new CatalogBuildError(
      `Unable to read event stream at ${eventsPath}: ${error.message}`,
    );
  }

  return parseNdjson(text, eventsPath);
}

export function validateCatalogAddEvent(event, index) {
  const label = `event ${index + 1}`;

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new CatalogBuildError(`${label} must be a JSON object.`);
  }

  if (event.eventType !== supportedEventType) {
    throw new CatalogBuildError(
      `${label} has unsupported eventType: ${String(event.eventType)}`,
    );
  }

  if (!isValidDateString(event.occurredAt)) {
    throw new CatalogBuildError(
      `${label} must have a valid occurredAt date.`,
    );
  }

  if (!supportedSources.has(event.source)) {
    throw new CatalogBuildError(
      `${label} source must be "manual" or "plex".`,
    );
  }

  if (!isNonEmptyString(event.canonicalId)) {
    throw new CatalogBuildError(
      `${label} canonicalId must be a non-empty string.`,
    );
  }

  const schemaVersion = event.schemaVersion ?? 1;

  if (schemaVersion !== 1) {
    throw new CatalogBuildError(`${label} schemaVersion must be 1.`);
  }

  const metadataLookup = event.metadataLookup ?? 'auto';

  if (!supportedMetadataLookup.has(metadataLookup)) {
    throw new CatalogBuildError(
      `${label} metadataLookup must be "auto" or "skip".`,
    );
  }

  if (
    Object.hasOwn(event, 'eventId') &&
    !isNonEmptyString(event.eventId)
  ) {
    throw new CatalogBuildError(
      `${label} eventId must be a non-empty string when present.`,
    );
  }

  return {
    eventId: event.eventId,
    schemaVersion,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    source: event.source,
    canonicalId: event.canonicalId.trim(),
    metadataLookup,
  };
}

export function replayCatalogAdds(events) {
  const seenEventIds = new Set();
  const seenCanonicalIds = new Set();
  const catalogIds = [];
  const duplicateCatalogAdds = [];

  for (const [index, event] of events.entries()) {
    const validated = validateCatalogAddEvent(event, index);

    if (validated.eventId) {
      if (seenEventIds.has(validated.eventId)) {
        throw new CatalogBuildError(
          `Duplicate eventId found: ${validated.eventId}`,
        );
      }

      seenEventIds.add(validated.eventId);
    }

    if (seenCanonicalIds.has(validated.canonicalId)) {
      duplicateCatalogAdds.push(validated.canonicalId);
      continue;
    }

    seenCanonicalIds.add(validated.canonicalId);
    catalogIds.push(validated.canonicalId);
  }

  return {
    catalogIds,
    duplicateCatalogAdds,
  };
}
