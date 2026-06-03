export function createMetadataHydrationPlanReport() {
  return {
    mode: 'plan',
    provider: null,
    requestedLimit: null,
    effectiveLimit: null,
    targetedCanonicalId: null,
    dryRun: false,
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
    requestsAttempted: 0,
    lookupResults: [],
    metadataRecordWriteCandidates: [],
    metadataRecordsWritten: [],
    remainingEligibleRecords: 0,
    unresolvedLookupRecords: [],
    filesWritten: [],
    fatalErrors: [],
  };
}

function countLookupResultsByStatus(lookupResults = []) {
  return lookupResults.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
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

  if (report.mode === 'write' || report.mode === 'dry-run') {
    const lookupResultCounts = countLookupResultsByStatus(
      report.lookupResults,
    );
    const rateLimitCount = lookupResultCounts['rate-limited'] ?? 0;
    const fatalErrorCount = report.fatalErrors.length;
    const anotherRunSafe =
      fatalErrorCount === 0 && rateLimitCount === 0 ? 'yes' : 'no';

    lines.push(`- provider: ${report.provider}`);
    lines.push(`- requested limit: ${report.requestedLimit}`);
    lines.push(`- effective limit: ${report.effectiveLimit}`);

    if (report.targetedCanonicalId) {
      lines.push(
        `- targeted canonical ID: ${report.targetedCanonicalId}`,
      );
    }

    lines.push(`- dry run: ${report.dryRun}`);
    lines.push(`- requests attempted: ${report.requestsAttempted}`);
    lines.push(
      `- successful writes: ${report.metadataRecordsWritten.length}`,
    );
    lines.push(
      `- not-found count: ${lookupResultCounts['not-found'] ?? 0}`,
    );
    lines.push(
      `- invalid response count: ${lookupResultCounts['invalid-response'] ?? 0}`,
    );
    lines.push(
      `- retryable failure count: ${lookupResultCounts['retryable-failure'] ?? 0}`,
    );
    lines.push(
      `- permanent failure count: ${lookupResultCounts['permanent-failure'] ?? 0}`,
    );
    lines.push(
      `- timeout count: ${lookupResultCounts['timed-out'] ?? 0}`,
    );
    lines.push(`- rate-limit count: ${rateLimitCount}`);
    lines.push(`- skipped count: ${report.skippedRecords.length}`);

    for (const item of report.lookupResults) {
      lines.push(
        `  - ${item.canonicalId} (${item.provider}, ${item.status})`,
      );
    }

    lines.push(
      `- metadata record write candidates: ${report.metadataRecordWriteCandidates.length}`,
    );

    for (const canonicalId of report.metadataRecordWriteCandidates) {
      lines.push(`  - ${canonicalId}`);
    }

    lines.push(
      `- metadata records written: ${report.metadataRecordsWritten.length}`,
    );
    lines.push(
      `- cache records written: ${report.metadataRecordsWritten.length}`,
    );

    for (const canonicalId of report.metadataRecordsWritten) {
      lines.push(`  - ${canonicalId}`);
    }

    lines.push(
      `- remaining eligible records: ${report.remainingEligibleRecords}`,
    );
    lines.push(
      `- unresolved lookup records: ${report.unresolvedLookupRecords.length}`,
    );

    for (const item of report.unresolvedLookupRecords) {
      lines.push(
        `  - ${item.canonicalId} (${item.provider}, ${item.status})`,
      );
    }

    lines.push(`- another run safe: ${anotherRunSafe}`);
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
