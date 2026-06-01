import { CatalogBuildError } from './catalog-build-error.js';

export const plexPlanUsage = [
  'Usage:',
  '  yarn plex:plan [--json]',
  '',
  'Options:',
  '  --json',
].join('\n');

export function parsePlexPlanCliArgs(args) {
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new CatalogBuildError(
        `${plexPlanUsage} Unknown flag: ${arg}`,
      );
    }

    throw new CatalogBuildError(plexPlanUsage);
  }

  return { json };
}

function countImportableItems(report) {
  return (
    report.plannedItems.length + report.alreadyRepresentedItems.length
  );
}

function formatTitleYear(item) {
  return item.year ? `${item.title} (${item.year})` : item.title;
}

function createPlexPlanSummary(report) {
  return {
    moviesScanned: report.moviesScanned,
    importable: countImportableItems(report),
    needsReview: report.needsReviewItems.length,
    alreadyRepresented: report.alreadyRepresentedItems.length,
    wouldAdd: report.plannedItems.length,
  };
}

export function createPlexPlanJsonReport(report) {
  return {
    ...createPlexPlanSummary(report),
    plannedItems: report.plannedItems,
    needsReviewItems: report.needsReviewItems,
  };
}

export function formatPlexPlanJsonReport(report) {
  return JSON.stringify(createPlexPlanJsonReport(report), null, 2);
}

export function formatPlexPlanReport(report) {
  const summary = createPlexPlanSummary(report);
  const lines = [
    `Movies scanned: ${summary.moviesScanned}`,
    '',
    `Importable: ${summary.importable}`,
    `Needs review: ${summary.needsReview}`,
    '',
    `Already represented: ${summary.alreadyRepresented}`,
    `Would add: ${summary.wouldAdd}`,
    '',
    'Would add:',
  ];

  for (const item of report.plannedItems) {
    lines.push(`  ${item.canonicalId} | ${formatTitleYear(item)}`);
  }

  lines.push('', 'Needs review:');

  for (const item of report.needsReviewItems) {
    lines.push(
      `  ${formatTitleYear(item)} | ratingKey ${item.plexRatingKey} | ${item.reason}`,
    );
  }

  return lines.join('\n');
}
