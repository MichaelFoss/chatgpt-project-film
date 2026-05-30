export function createBaseReport(outputPath) {
  return {
    eventsRead: 0,
    uniqueCatalogAdds: 0,
    duplicateCatalogAddsSkipped: 0,
    duplicateCatalogAdds: [],
    catalogRecordsWritten: 0,
    missingMetadata: [],
    invalidMetadata: [],
    fatalErrors: [],
    outputPathWritten: null,
    intendedOutputPath: outputPath,
    metadataCacheMissing: false,
  };
}

export function formatReport(report) {
  const lines = [
    'Catalog build report',
    `- events read: ${report.eventsRead}`,
    `- unique catalog adds: ${report.uniqueCatalogAdds}`,
    `- duplicate catalog adds skipped: ${report.duplicateCatalogAddsSkipped}`,
  ];

  for (const canonicalId of report.duplicateCatalogAdds) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- catalog records written: ${report.catalogRecordsWritten}`,
    `- missing metadata: ${report.missingMetadata.length}`,
  );

  for (const canonicalId of report.missingMetadata) {
    lines.push(`  - ${canonicalId}`);
  }

  lines.push(
    `- invalid/unusable metadata: ${report.invalidMetadata.length}`,
  );

  for (const canonicalId of report.invalidMetadata) {
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

  lines.push(
    `- output path written: ${report.outputPathWritten ?? 'none'}`,
  );

  if (report.metadataCacheMissing) {
    lines.push('- metadata cache file missing: true');
  }

  return lines.join('\n');
}
