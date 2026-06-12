import fs from 'node:fs/promises';
import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { appendEvents, parseNdjson } from './catalog-events.js';
import { isNonEmptyString } from './catalog-utils.js';
import { writeGeneratedJsonFile } from './json-file.js';

export const titleReactionEventType = 'title.reaction.updated';

const watchStatuses = new Set([
  'completed',
  'incomplete',
  'abandoned',
  'planned',
]);
const memoryConfidences = new Set(['high', 'medium', 'low']);
const householdSuitabilities = new Set(['any', 'kid', 'teen', 'adult']);
const spoilerDiscussions = new Set([
  'premise-only',
  'known-safe',
  'full',
]);

const requiredFields = ['eventId', 'type', 'occurredAt', 'canonicalId'];
const updateFields = [
  'rating',
  'watchStatus',
  'memoryConfidence',
  'reasonTags',
  'notes',
  'reasons',
  'householdSuitability',
  'spoilerDiscussion',
];
const allowedFields = new Set([...requiredFields, ...updateFields]);

function isValidIsoTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function hasOwn(object, field) {
  return Object.hasOwn(object, field);
}

function validateEnum({ event, field, allowed, label }) {
  if (hasOwn(event, field) && !allowed.has(event[field])) {
    throw new CatalogBuildError(
      `${label} ${field} must be one of: ${[...allowed].join(', ')}.`,
    );
  }
}

function hasPresentReactionUpdateField(event, field) {
  if (field === 'reasons') {
    return (
      hasOwn(event, field) &&
      (!Array.isArray(event.reasons) ||
        event.reasons.some((reason) => typeof reason !== 'string') ||
        normalizeReactionReasons(event.reasons).length > 0)
    );
  }

  return (
    hasOwn(event, field) &&
    (field !== 'notes' ||
      (typeof event.notes === 'string' &&
        event.notes.trim().length > 0))
  );
}

export function normalizeReactionReasons(value) {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const reasons = [];

  for (const item of values) {
    if (typeof item !== 'string') {
      continue;
    }

    for (const rawReason of item.split(',')) {
      const reason = rawReason.trim();

      if (reason.length === 0 || seen.has(reason)) {
        continue;
      }

      seen.add(reason);
      reasons.push(reason);
    }
  }

  return reasons;
}

export function validateTitleReactionEvent(event, index, catalog) {
  const label = `event ${index + 1}`;

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new CatalogBuildError(`${label} must be a JSON object.`);
  }

  const unknownFields = Object.keys(event).filter(
    (field) => !allowedFields.has(field),
  );

  if (unknownFields.length > 0) {
    throw new CatalogBuildError(
      `${label} has unknown field(s): ${unknownFields.join(', ')}.`,
    );
  }

  if (!isNonEmptyString(event.eventId)) {
    throw new CatalogBuildError(
      `${label} eventId must be a non-empty string.`,
    );
  }

  if (event.type !== titleReactionEventType) {
    throw new CatalogBuildError(
      `${label} type must be ${titleReactionEventType}.`,
    );
  }

  if (!isValidIsoTimestamp(event.occurredAt)) {
    throw new CatalogBuildError(
      `${label} must have a valid occurredAt ISO timestamp.`,
    );
  }

  if (!isNonEmptyString(event.canonicalId)) {
    throw new CatalogBuildError(
      `${label} canonicalId must be a non-empty string.`,
    );
  }

  const canonicalId = event.canonicalId.trim();

  if (!catalog || !hasOwn(catalog, canonicalId)) {
    throw new CatalogBuildError(
      `${label} canonicalId does not exist in data/catalog.json: ${canonicalId}`,
    );
  }

  if (
    hasOwn(event, 'notes') &&
    event.notes !== null &&
    typeof event.notes !== 'string'
  ) {
    throw new CatalogBuildError(`${label} notes must be a string.`);
  }

  const presentUpdateFields = updateFields.filter((field) =>
    hasPresentReactionUpdateField(event, field),
  );

  if (presentUpdateFields.length === 0) {
    throw new CatalogBuildError(
      `${label} must include at least one reaction update field.`,
    );
  }

  if (
    hasOwn(event, 'rating') &&
    (!Number.isInteger(event.rating) ||
      event.rating < 1 ||
      event.rating > 10)
  ) {
    throw new CatalogBuildError(
      `${label} rating must be an integer from 1 through 10.`,
    );
  }

  validateEnum({
    event,
    field: 'watchStatus',
    allowed: watchStatuses,
    label,
  });
  validateEnum({
    event,
    field: 'memoryConfidence',
    allowed: memoryConfidences,
    label,
  });
  validateEnum({
    event,
    field: 'householdSuitability',
    allowed: householdSuitabilities,
    label,
  });
  validateEnum({
    event,
    field: 'spoilerDiscussion',
    allowed: spoilerDiscussions,
    label,
  });

  if (
    hasOwn(event, 'reasonTags') &&
    (!Array.isArray(event.reasonTags) ||
      event.reasonTags.some((tag) => !isNonEmptyString(tag)))
  ) {
    throw new CatalogBuildError(
      `${label} reasonTags must be an array of non-empty strings.`,
    );
  }

  if (
    hasOwn(event, 'reasons') &&
    (!Array.isArray(event.reasons) ||
      event.reasons.some((reason) => typeof reason !== 'string'))
  ) {
    throw new CatalogBuildError(
      `${label} reasons must be an array of strings.`,
    );
  }

  const validated = {
    eventId: event.eventId.trim(),
    type: event.type,
    occurredAt: event.occurredAt,
    canonicalId,
  };

  for (const field of presentUpdateFields) {
    if (field === 'notes') {
      const notes = event.notes.trim();

      if (notes.length > 0) {
        validated.notes = notes;
      }

      continue;
    }

    if (field === 'reasons') {
      const reasons = normalizeReactionReasons(event.reasons);

      if (reasons.length > 0) {
        validated.reasons = reasons;
      }

      continue;
    }

    validated[field] =
      field === 'reasonTags' ? [...event.reasonTags] : event[field];
  }

  return validated;
}

export function validateTitleReactionEvents(events, catalog) {
  const seenEventIds = new Set();

  return events.map((event, index) => {
    const validated = validateTitleReactionEvent(event, index, catalog);

    if (seenEventIds.has(validated.eventId)) {
      throw new CatalogBuildError(
        `Duplicate eventId found: ${validated.eventId}`,
      );
    }

    seenEventIds.add(validated.eventId);
    return validated;
  });
}

export function projectTitleReactions(events) {
  const reactions = {};

  for (const event of events) {
    const existing = reactions[event.canonicalId] ?? {
      canonicalId: event.canonicalId,
      eventIds: [],
    };

    const next = {
      ...existing,
      updatedAt: event.occurredAt,
      eventIds: [...existing.eventIds, event.eventId],
    };

    if (hasOwn(event, 'rating')) {
      delete next.notes;
      delete next.reasons;
    }

    for (const field of updateFields) {
      if (hasOwn(event, field)) {
        next[field] =
          field === 'reasonTags' || field === 'reasons'
            ? [...event[field]]
            : event[field];
      }
    }

    reactions[event.canonicalId] = next;
  }

  return Object.fromEntries(
    Object.entries(reactions).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export async function readTitleReactionEvents(eventsPath) {
  let text;

  try {
    text = await fs.readFile(eventsPath, 'utf8');
  } catch (error) {
    throw new CatalogBuildError(
      `Unable to read title reaction event stream at ${eventsPath}: ${error.message}`,
    );
  }

  return parseNdjson(text, eventsPath);
}

export async function appendTitleReactionEvents({
  eventsPath,
  events,
  catalog,
} = {}) {
  if (!eventsPath) {
    throw new CatalogBuildError('eventsPath is required.');
  }

  if (!Array.isArray(events)) {
    throw new CatalogBuildError(
      'Title reaction events must be an array.',
    );
  }

  if (events.length === 0) {
    return {
      eventsAppended: 0,
      outputPathWritten: null,
    };
  }

  const existingEvents = await readTitleReactionEvents(eventsPath);
  validateTitleReactionEvents([...existingEvents, ...events], catalog);
  await appendEvents(eventsPath, events);

  return {
    eventsAppended: events.length,
    outputPathWritten: eventsPath,
  };
}

export async function buildTitleReactions({
  rootDir = process.cwd(),
  eventsPath = path.join(
    rootDir,
    'events',
    'title-reactions.events.ndjson',
  ),
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
  outputPath = path.join(rootDir, 'data', 'title-reactions.json'),
} = {}) {
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  const rawEvents = await readTitleReactionEvents(eventsPath);
  const events = validateTitleReactionEvents(rawEvents, catalog);
  const reactions = projectTitleReactions(events);

  await writeGeneratedJsonFile(outputPath, reactions);

  return {
    eventsRead: events.length,
    reactionRecordsWritten: Object.keys(reactions).length,
    outputPathWritten: outputPath,
  };
}
