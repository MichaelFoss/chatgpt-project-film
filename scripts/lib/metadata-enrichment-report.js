export function createMetadataEnrichmentReport() {
  return {
    mode: 'dry-run',
    eventsRead: 0,
    uniqueCatalogAdds: 0,
    duplicateCatalogAddsSkipped: 0,
    duplicateCatalogAdds: [],
    alreadyValidMetadata: [],
    missingMetadata: [],
    invalidMetadata: [],
    skippedMetadataLookup: [],
    noSupportingProviderConfigured: [],
    plannedLookups: [],
    executedLookups: [],
    metadataRecordsCreated: [],
    fatalErrors: [],
    metadataCacheMissing: false,
    filesWritten: [],
  };
}

export function formatMetadataEnrichmentReport(report) {
  const lines = [
    'Metadata enrichment report',
    `- mode: ${report.mode}`,
    `- events read: ${report.eventsRead}`,
    `- unique catalog adds: ${report.uniqueCatalogAdds}`,
    `- duplicate catalog adds skipped: ${report.duplicateCatalogAddsSkipped}`,
  ];

  for (const canonicalId of report.duplicateCatalogAdds) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- already valid metadata: ${report.alreadyValidMetadata.length}`,
  );

  for (const canonicalId of report.alreadyValidMetadata) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(`- missing metadata: ${report.missingMetadata.length}`);

  for (const canonicalId of report.missingMetadata) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- invalid/unusable metadata: ${report.invalidMetadata.length}`,
  );

  for (const canonicalId of report.invalidMetadata) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- skipped because metadataLookup is skip: ${report.skippedMetadataLookup.length}`,
  );

  for (const canonicalId of report.skippedMetadataLookup) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- no supporting provider configured: ${report.noSupportingProviderConfigured.length}`,
  );

  for (const item of report.noSupportingProviderConfigured) {
    lines.push(`  - ${item.canonicalId} (${item.reason})`);
  }

  lines.push(`- planned lookups: ${report.plannedLookups.length}`);

  for (const plannedLookup of report.plannedLookups) {
    lines.push(
      `  - ${plannedLookup.canonicalId} (${plannedLookup.reason}, ${plannedLookup.provider})`,
    );
  }

  lines.push(`- executed lookups: ${report.executedLookups.length}`);

  for (const executedLookup of report.executedLookups) {
    lines.push(
      `  - ${executedLookup.canonicalId} (${executedLookup.provider})`,
    );
  }

  lines.push(
    `- metadata records created: ${report.metadataRecordsCreated.length}`,
  );

  for (const canonicalId of report.metadataRecordsCreated) {
    lines.push(`  - ${canonicalId}`);
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

  if (report.metadataCacheMissing) {
    lines.push('- metadata cache file missing: true');
  }

  return lines.join('\n');
}
