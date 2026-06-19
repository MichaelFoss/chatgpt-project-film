import fs from 'node:fs/promises';
import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { readCatalog } from './catalog-query.js';
import { isNonEmptyString } from './catalog-utils.js';
import {
  appendTitleReactionEvents,
  buildTitleReactions,
} from './title-reactions.js';
import { createTitleReactionEvent } from './reaction-cli.js';
import { isValidReactionRating } from './reaction-ratings.js';
import { hasNormalizedReasonValues } from './reaction-validation.js';

export const reactionApplyDraftUsage =
  'Usage: yarn reactions:apply-draft <draft-file>';

function hasOwn(object, fieldName) {
  return Object.hasOwn(object, fieldName);
}

function uniqueNonEmptyStrings(values) {
  return [
    ...new Set(
      values.filter(
        (value) => typeof value === 'string' && value.length > 0,
      ),
    ),
  ];
}

function shellQuotePath(filePath) {
  return /^[A-Za-z0-9_./:-]+$/.test(filePath)
    ? filePath
    : `'${filePath.replaceAll("'", "'\\''")}'`;
}

function parseReactionApplyDraftCliArgs(args) {
  if (!Array.isArray(args) || args.length !== 1) {
    throw new CatalogBuildError(reactionApplyDraftUsage);
  }

  const [draftFile] = args;

  if (!isNonEmptyString(draftFile) || draftFile.startsWith('--')) {
    throw new CatalogBuildError(reactionApplyDraftUsage);
  }

  return { draftPath: draftFile };
}

export { parseReactionApplyDraftCliArgs };

function assertDraftObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogBuildError(
      'Reaction draft must be a JSON object.',
    );
  }

  const unknownFields = Object.keys(value).filter(
    (field) =>
      !['generatedAt', 'titleCount', 'reactions'].includes(field),
  );

  if (unknownFields.length > 0) {
    throw new CatalogBuildError(
      `Reaction draft has unknown field(s): ${unknownFields.join(', ')}.`,
    );
  }

  if (!isNonEmptyString(value.generatedAt)) {
    throw new CatalogBuildError(
      'Reaction draft generatedAt must be a non-empty string.',
    );
  }

  if (!Number.isInteger(value.titleCount) || value.titleCount < 0) {
    throw new CatalogBuildError(
      'Reaction draft titleCount must be a non-negative integer.',
    );
  }

  if (!Array.isArray(value.reactions)) {
    throw new CatalogBuildError(
      'Reaction draft reactions must be an array.',
    );
  }
}

function normalizeDraftTitleId(titleId) {
  if (!isNonEmptyString(titleId)) {
    return null;
  }

  const normalized = titleId.trim();
  return /^tt\d+$/.test(normalized) ? `imdb:${normalized}` : normalized;
}

function validateDraftReasons(reaction, label) {
  if (!hasOwn(reaction, 'reasons')) {
    return [];
  }

  if (
    !hasNormalizedReasonValues(reaction.reasons, { allowEmpty: true })
  ) {
    throw new CatalogBuildError(
      `${label} reasons must be a normalized array of non-empty lowercase strings without duplicates.`,
    );
  }

  return [...reaction.reasons];
}

function validateDraftNotes(reaction, label) {
  if (!hasOwn(reaction, 'notes')) {
    return null;
  }

  if (typeof reaction.notes !== 'string') {
    throw new CatalogBuildError(`${label} notes must be a string.`);
  }

  return reaction.notes;
}

export function validateReactionDraft({ draft, catalog }) {
  assertDraftObject(draft);

  if (
    !catalog ||
    typeof catalog !== 'object' ||
    Array.isArray(catalog)
  ) {
    throw new CatalogBuildError('catalog must be a JSON object.');
  }

  const seenTitleIds = new Set();

  return draft.reactions.map((reaction, index) => {
    const label = `reaction ${index + 1}`;

    if (
      !reaction ||
      typeof reaction !== 'object' ||
      Array.isArray(reaction)
    ) {
      throw new CatalogBuildError(`${label} must be a JSON object.`);
    }

    const unknownFields = Object.keys(reaction).filter(
      (field) =>
        !['titleId', 'rating', 'notes', 'reasons'].includes(field),
    );

    if (unknownFields.length > 0) {
      throw new CatalogBuildError(
        `${label} has unknown field(s): ${unknownFields.join(', ')}.`,
      );
    }

    const canonicalId = normalizeDraftTitleId(reaction.titleId);

    if (!canonicalId) {
      throw new CatalogBuildError(`${label} titleId is required.`);
    }

    if (!catalog[canonicalId]) {
      throw new CatalogBuildError(
        `${label} titleId does not exist in data/catalog.json: ${reaction.titleId}`,
      );
    }

    if (seenTitleIds.has(canonicalId)) {
      throw new CatalogBuildError(
        `Duplicate titleId found in reaction draft: ${reaction.titleId}`,
      );
    }

    seenTitleIds.add(canonicalId);

    if (!hasOwn(reaction, 'rating')) {
      throw new CatalogBuildError(`${label} rating is required.`);
    }

    if (!isValidReactionRating(reaction.rating)) {
      throw new CatalogBuildError(
        `${label} rating must be an integer from 1 through 10.`,
      );
    }

    return {
      item: catalog[canonicalId],
      rating: reaction.rating,
      notes: validateDraftNotes(reaction, label),
      reasons: validateDraftReasons(reaction, label),
    };
  });
}

export async function readReactionDraft(draftPath) {
  let text;

  try {
    text = await fs.readFile(draftPath, 'utf8');
  } catch (error) {
    throw new CatalogBuildError(
      `Unable to read reaction draft at ${draftPath}: ${error.message}`,
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CatalogBuildError(
      `Invalid reaction draft JSON at ${draftPath}: ${error.message}`,
    );
  }
}

export function createReactionDraftEvents({
  validatedReactions,
  eventIdFactory,
  occurredAt = new Date().toISOString(),
}) {
  return validatedReactions.map(({ item, rating, notes, reasons }) =>
    createTitleReactionEvent(item, rating, {
      eventId: eventIdFactory?.(),
      occurredAt,
      notes,
      reasons,
    }),
  );
}

export async function applyReactionDraft({
  rootDir = process.cwd(),
  draftPath,
  args,
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
  eventsPath = path.join(
    rootDir,
    'events',
    'title-reactions.events.ndjson',
  ),
  appendEvents = appendTitleReactionEvents,
  rebuildProjections = buildTitleReactions,
  eventIdFactory,
  occurredAt,
  writeOutput = console.log,
} = {}) {
  const parsedArgs = args
    ? parseReactionApplyDraftCliArgs(args)
    : { draftPath };
  const resolvedDraftPath = path.resolve(rootDir, parsedArgs.draftPath);
  const [draft, catalog] = await Promise.all([
    readReactionDraft(resolvedDraftPath),
    readCatalog({ rootDir, catalogPath }),
  ]);
  const validatedReactions = validateReactionDraft({ draft, catalog });
  const events = createReactionDraftEvents({
    validatedReactions,
    eventIdFactory,
    occurredAt,
  });
  const appendReport = await appendEvents({
    eventsPath,
    events,
    catalog,
  });
  const projectionReport = await rebuildProjections({ rootDir });

  const report = {
    draftPath: resolvedDraftPath,
    reactionsImported: validatedReactions.length,
    eventsWritten: appendReport.eventsAppended,
    appendReport,
    projectionReport,
    filesWritten: uniqueNonEmptyStrings(
      [
        appendReport.outputPathWritten,
        projectionReport.outputPathWritten,
      ]
        .filter(Boolean)
        .map((filePath) => path.relative(rootDir, filePath)),
    ),
  };

  writeOutput(formatReactionApplyDraftSummary(report));

  return report;
}

export function formatReactionApplyDraftSummary(report) {
  const lines = [
    `Imported ${report.reactionsImported} reaction draft entr${report.reactionsImported === 1 ? 'y' : 'ies'}.`,
    `Wrote ${report.eventsWritten} title reaction event(s).`,
    `Rebuilt ${path.relative(
      process.cwd(),
      report.projectionReport.outputPathWritten,
    )}.`,
  ];
  const filesWritten = uniqueNonEmptyStrings(report.filesWritten ?? []);

  if (filesWritten.length > 0) {
    const quotedFiles = filesWritten.map(shellQuotePath).join(' ');

    lines.push(
      '',
      'Files changed:',
      ...filesWritten.map((filePath) => `- ${filePath}`),
      '',
      'Next:',
      `git diff ${quotedFiles}`,
      `git add ${quotedFiles}`,
      'git commit -m "Add movie reactions"',
    );
  }

  return lines.join('\n');
}
