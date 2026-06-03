export function createMetadataHydrationPlanReport() {
  return {
    mode: 'plan',
    totalCatalogEvents: 0,
    uniqueCanonicalCatalogIds: 0,
    duplicateEventCount: 0,
    duplicateCatalogIds: [],
    existingValidMetadataRecords: [],
    missingMetadataRecords: [],
    skippedRecords: [],
    invalidCacheRecords: [],
    eligibleLookups: [],
    ineligibleLookups: [],
    metadataCacheMissing: false,
    filesWritten: [],
    fatalErrors: [],
  };
}

export function formatMetadataHydrationPlanReport(report) {
  const lines = [
    'Metadata hydration plan',
    `- mode: ${report.mode}`,
    `- total catalog events: ${report.totalCatalogEvents}`,
    `- unique canonical catalog IDs: ${report.uniqueCanonicalCatalogIds}`,
    `- duplicate event count: ${report.duplicateEventCount}`,
  ];

  for (const canonicalId of report.duplicateCatalogIds) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- existing valid metadata records: ${report.existingValidMetadataRecords.length}`,
  );

  for (const canonicalId of report.existingValidMetadataRecords) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- missing metadata records: ${report.missingMetadataRecords.length}`,
  );

  for (const canonicalId of report.missingMetadataRecords) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(`- skipped records: ${report.skippedRecords.length}`);

  for (const item of report.skippedRecords) {
    lines.push(`  - ${item.canonicalId} (${item.metadataLookup})`);
  }

  lines.push(
    `- invalid cache records: ${report.invalidCacheRecords.length}`,
  );

  for (const canonicalId of report.invalidCacheRecords) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- eligible lookup count: ${report.eligibleLookups.length}`,
  );

  for (const item of report.eligibleLookups) {
    lines.push(
      `  - ${item.canonicalId} (${item.reason}, ${item.provider})`,
    );
  }

  lines.push(
    `- ineligible lookup count: ${report.ineligibleLookups.length}`,
  );

  for (const item of report.ineligibleLookups) {
    lines.push(`  - ${item.canonicalId} (${item.reason})`);
  }

  if (report.metadataCacheMissing) {
    lines.push('- metadata cache file missing: true');
  }

  if (report.fatalErrors.length > 0) {
    lines.push(`- fatal errors: ${report.fatalErrors.length}`);

    for (const error of report.fatalErrors) {
      lines.push(`  - ${error}`);
    }
  } else {
    lines.push('- fatal errors: 0');
  }

  lines.push(`- files written: ${report.filesWritten.length}`);

  return lines.join('\n');
}
