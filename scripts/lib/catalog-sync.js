import path from 'node:path';
import { buildCatalog } from './catalog-builder.js';
import { CatalogBuildError } from './catalog-build-error.js';
import { createBaseReport, formatReport } from './catalog-report.js';
import { executeMetadataEnrichment } from './metadata-enrichment-executor.js';
import {
  createMetadataEnrichmentReport,
  formatMetadataEnrichmentReport,
} from './metadata-enrichment-report.js';

function reportFromMetadataError(error) {
  if (error.report) {
    return error.report;
  }

  const report = createMetadataEnrichmentReport();
  report.mode = 'execute';
  report.fatalErrors.push(error.message);
  return report;
}

function reportFromCatalogError(error, outputPath) {
  if (error.report) {
    return error.report;
  }

  const report = createBaseReport(outputPath);
  report.fatalErrors.push(error.message);
  return report;
}

export function createCatalogSyncReport({
  metadataEnrichmentReport = createMetadataEnrichmentReport(),
  catalogBuildReport,
  catalogBuildSkipped = false,
} = {}) {
  return {
    metadataEnrichmentReport,
    catalogBuildReport,
    catalogBuildSkipped,
  };
}

export function hasCatalogSyncFatalErrors(report) {
  return (
    report.metadataEnrichmentReport.fatalErrors.length > 0 ||
    report.catalogBuildReport.fatalErrors.length > 0
  );
}

export function formatCatalogSyncReport(report) {
  const catalogBuildLines = formatReport(
    report.catalogBuildReport,
  ).split('\n');
  catalogBuildLines.splice(
    1,
    0,
    `- catalog build skipped: ${report.catalogBuildSkipped}`,
  );

  return [
    formatMetadataEnrichmentReport(report.metadataEnrichmentReport),
    catalogBuildLines.join('\n'),
  ].join('\n\n');
}

export async function syncCatalog({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'catalog.events.ndjson'),
  metadataCachePath = path.join(rootDir, 'data', 'metadata-cache.json'),
  outputPath = path.join(rootDir, 'data', 'catalog.json'),
  providers,
  now,
  enrichmentExecutor = executeMetadataEnrichment,
  catalogBuilder = buildCatalog,
} = {}) {
  let metadataEnrichmentReport;

  try {
    metadataEnrichmentReport = await enrichmentExecutor({
      rootDir,
      eventsPath,
      metadataCachePath,
      providers,
      now,
    });
  } catch (error) {
    if (!(error instanceof CatalogBuildError) && !error.report) {
      throw error;
    }

    return createCatalogSyncReport({
      metadataEnrichmentReport: reportFromMetadataError(error),
      catalogBuildReport: createBaseReport(outputPath),
      catalogBuildSkipped: true,
    });
  }

  try {
    const catalogBuildReport = await catalogBuilder({
      rootDir,
      eventsPath,
      metadataCachePath,
      outputPath,
    });

    return createCatalogSyncReport({
      metadataEnrichmentReport,
      catalogBuildReport,
      catalogBuildSkipped: false,
    });
  } catch (error) {
    if (!(error instanceof CatalogBuildError) && !error.report) {
      throw error;
    }

    return createCatalogSyncReport({
      metadataEnrichmentReport,
      catalogBuildReport: reportFromCatalogError(error, outputPath),
      catalogBuildSkipped: false,
    });
  }
}
