import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';
import { readCatalog } from './catalog-query.js';
import { readReactionState } from './reaction-cli.js';
import { isValidReactionRating } from './reaction-ratings.js';

function assertProjectionObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogBuildError(`${label} must be a JSON object`);
  }
}

function compareByKey(left, right) {
  return left.key.localeCompare(right.key);
}

function formatProblemValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function getRecordField(record, fieldName) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return undefined;
  }

  return record[fieldName];
}

function hasRecordField(record, fieldName) {
  return (
    record &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    Object.hasOwn(record, fieldName)
  );
}

export function hasNormalizedReasonValues(
  reasons,
  { allowEmpty = false } = {},
) {
  if (!Array.isArray(reasons)) {
    return false;
  }

  if (reasons.length === 0) {
    return allowEmpty;
  }

  return hasNormalizedNonEmptyReasonValues(reasons);
}

function hasNormalizedNonEmptyReasonValues(reasons) {
  if (reasons.length === 0) {
    return false;
  }

  const seen = new Set();

  for (const reason of reasons) {
    if (
      !isNonEmptyString(reason) ||
      reason !== reason.trim() ||
      reason !== reason.toLowerCase() ||
      seen.has(reason)
    ) {
      return false;
    }

    seen.add(reason);
  }

  return true;
}

function createEmptyProblems() {
  return {
    missingCatalogReferences: [],
    missingCanonicalIds: [],
    missingRatings: [],
    invalidRatings: [],
    invalidNotes: [],
    invalidReasons: [],
    duplicateReactionEntries: [],
  };
}

function collectDuplicateCanonicalIds(entries) {
  const keysByCanonicalId = new Map();

  for (const [key, record] of entries) {
    const canonicalId = getRecordField(record, 'canonicalId');

    if (!isNonEmptyString(canonicalId)) {
      continue;
    }

    const trimmedCanonicalId = canonicalId.trim();
    const keys = keysByCanonicalId.get(trimmedCanonicalId) ?? [];
    keys.push(key);
    keysByCanonicalId.set(trimmedCanonicalId, keys);
  }

  return new Map(
    [...keysByCanonicalId.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([canonicalId, keys]) => [
        canonicalId,
        [...keys].sort((left, right) => left.localeCompare(right)),
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function validateReactionProjection({
  catalog,
  reactions,
} = {}) {
  assertProjectionObject(catalog, 'catalog');
  assertProjectionObject(reactions, 'title reaction state');

  const entries = Object.entries(reactions).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const duplicateCanonicalIds = collectDuplicateCanonicalIds(entries);
  const duplicateRecordKeys = new Set(
    [...duplicateCanonicalIds.values()].flat(),
  );
  const problems = createEmptyProblems();
  const invalidRecordKeys = new Set();

  for (const [key, record] of entries) {
    const canonicalId = getRecordField(record, 'canonicalId');
    const hasCanonicalId = isNonEmptyString(canonicalId);
    const normalizedCanonicalId = hasCanonicalId
      ? canonicalId.trim()
      : null;

    if (!hasCanonicalId) {
      problems.missingCanonicalIds.push({ key });
      invalidRecordKeys.add(key);
    } else if (!catalog[normalizedCanonicalId]) {
      problems.missingCatalogReferences.push({
        key,
        canonicalId: normalizedCanonicalId,
      });
      invalidRecordKeys.add(key);
    }

    if (!hasRecordField(record, 'rating')) {
      problems.missingRatings.push({ key });
      invalidRecordKeys.add(key);
    } else {
      const rating = getRecordField(record, 'rating');

      if (!isValidReactionRating(rating)) {
        problems.invalidRatings.push({ key, rating });
        invalidRecordKeys.add(key);
      }
    }

    if (
      hasRecordField(record, 'notes') &&
      typeof getRecordField(record, 'notes') !== 'string'
    ) {
      problems.invalidNotes.push({
        key,
        notes: getRecordField(record, 'notes'),
      });
      invalidRecordKeys.add(key);
    }

    if (hasRecordField(record, 'reasons')) {
      const reasons = getRecordField(record, 'reasons');

      if (!hasNormalizedReasonValues(reasons)) {
        problems.invalidReasons.push({ key, reasons });
        invalidRecordKeys.add(key);
      }
    }

    if (duplicateRecordKeys.has(key)) {
      invalidRecordKeys.add(key);
    }
  }

  problems.duplicateReactionEntries = [
    ...duplicateCanonicalIds.entries(),
  ].map(([canonicalId, keys]) => ({ canonicalId, keys }));

  return {
    totalRecords: entries.length,
    validRecords: entries.length - invalidRecordKeys.size,
    invalidRecords: invalidRecordKeys.size,
    problems: {
      missingCatalogReferences:
        problems.missingCatalogReferences.sort(compareByKey),
      missingCanonicalIds:
        problems.missingCanonicalIds.sort(compareByKey),
      missingRatings: problems.missingRatings.sort(compareByKey),
      invalidRatings: problems.invalidRatings.sort(compareByKey),
      invalidNotes: problems.invalidNotes.sort(compareByKey),
      invalidReasons: problems.invalidReasons.sort(compareByKey),
      duplicateReactionEntries: problems.duplicateReactionEntries,
    },
  };
}

export async function validateReactionProjectionFromFiles({
  rootDir = process.cwd(),
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
  reactionsPath = path.join(rootDir, 'data', 'title-reactions.json'),
} = {}) {
  const [catalog, reactions] = await Promise.all([
    readCatalog({ rootDir, catalogPath }),
    readReactionState({ rootDir, reactionsPath }),
  ]);

  return validateReactionProjection({ catalog, reactions });
}

export function formatReactionValidationReport(report) {
  const lines = [
    'Reaction validation',
    '',
    'Summary:',
    `- Total reaction records inspected: ${report.totalRecords}`,
    `- Valid reaction records: ${report.validRecords}`,
    `- Invalid reaction records: ${report.invalidRecords}`,
    '',
    'Problems:',
  ];

  const problemLines = [
    ...formatMissingCatalogReferences(
      report.problems.missingCatalogReferences,
    ),
    ...formatMissingCanonicalIds(report.problems.missingCanonicalIds),
    ...formatMissingRatings(report.problems.missingRatings),
    ...formatInvalidRatings(report.problems.invalidRatings),
    ...formatInvalidNotes(report.problems.invalidNotes),
    ...formatInvalidReasons(report.problems.invalidReasons),
    ...formatDuplicateReactionEntries(
      report.problems.duplicateReactionEntries,
    ),
  ];

  lines.push(...(problemLines.length > 0 ? problemLines : ['- none']));

  return lines.join('\n');
}

function formatMissingCatalogReferences(problems) {
  if (problems.length === 0) {
    return [];
  }

  return [
    'Missing catalog references:',
    ...problems.map(
      (problem) =>
        `- key: ${problem.key}; canonicalId: ${problem.canonicalId}`,
    ),
  ];
}

function formatMissingCanonicalIds(problems) {
  if (problems.length === 0) {
    return [];
  }

  return [
    'Missing canonical IDs:',
    ...problems.map((problem) => `- key: ${problem.key}`),
  ];
}

function formatMissingRatings(problems) {
  if (problems.length === 0) {
    return [];
  }

  return [
    'Missing ratings:',
    ...problems.map((problem) => `- key: ${problem.key}`),
  ];
}

function formatInvalidRatings(problems) {
  if (problems.length === 0) {
    return [];
  }

  return [
    'Invalid ratings:',
    ...problems.map(
      (problem) =>
        `- key: ${problem.key}; rating: ${formatProblemValue(
          problem.rating,
        )}`,
    ),
  ];
}

function formatInvalidNotes(problems) {
  if (problems.length === 0) {
    return [];
  }

  return [
    'Invalid notes:',
    ...problems.map(
      (problem) =>
        `- key: ${problem.key}; notes: ${formatProblemValue(
          problem.notes,
        )}`,
    ),
  ];
}

function formatInvalidReasons(problems) {
  if (problems.length === 0) {
    return [];
  }

  return [
    'Invalid reasons:',
    ...problems.map(
      (problem) =>
        `- key: ${problem.key}; reasons: ${formatProblemValue(
          problem.reasons,
        )}`,
    ),
  ];
}

function formatDuplicateReactionEntries(problems) {
  if (problems.length === 0) {
    return [];
  }

  return [
    'Duplicate reaction entries:',
    ...problems.map(
      (problem) =>
        `- canonicalId: ${problem.canonicalId}; keys: ${problem.keys.join(
          ', ',
        )}`,
    ),
  ];
}
