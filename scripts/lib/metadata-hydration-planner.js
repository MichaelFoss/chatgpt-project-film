import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import {
  readEvents,
  replayCatalogAddEvents,
} from './catalog-events.js';
import {
  loadMetadataCache,
  mapMetadataRecord,
} from './catalog-metadata.js';
import {
  metadataProviders,
  selectMetadataProvider,
} from './metadata-providers/index.js';
import { createMetadataHydrationPlanReport } from './metadata-hydration-report.js';

function addLookupPlan({ report, canonicalId, reason, providers }) {
  const { provider, reason: selectionReason } = selectMetadataProvider({
    canonicalId,
    providers,
  });

  if (!provider) {
    report.ineligibleLookups.push({
      canonicalId,
      reason,
      selectionReason,
    });
    return;
  }

  report.eligibleLookups.push({
    canonicalId,
    reason,
    provider: provider.id,
  });
}

export async function planMetadataHydration({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'catalog.events.ndjson'),
  metadataCachePath = path.join(rootDir, 'data', 'metadata-cache.json'),
  providers = metadataProviders,
} = {}) {
  const report = createMetadataHydrationPlanReport();

  try {
    const events = await readEvents(eventsPath);
    report.totalCatalogEvents = events.length;

    const replay = replayCatalogAddEvents(events);
    report.uniqueCanonicalCatalogIds = replay.catalogAdds.length;
    report.duplicateEventCount = replay.duplicateCatalogAdds.length;
    report.duplicateCatalogIds = replay.duplicateCatalogAdds;

    const { cache, missingFile } =
      await loadMetadataCache(metadataCachePath);
    report.metadataCacheMissing = missingFile;

    for (const catalogAdd of replay.catalogAdds) {
      const { canonicalId, metadataLookup } = catalogAdd;

      if (metadataLookup === 'skip') {
        report.skippedRecords.push({
          canonicalId,
          metadataLookup,
        });
        continue;
      }

      const record = cache[canonicalId];

      if (!record) {
        report.missingMetadataRecords.push(canonicalId);
        addLookupPlan({
          report,
          canonicalId,
          reason: 'missing',
          providers,
        });
        continue;
      }

      if (!mapMetadataRecord(canonicalId, record)) {
        report.invalidCacheRecords.push(canonicalId);
        addLookupPlan({
          report,
          canonicalId,
          reason: 'invalid-cache',
          providers,
        });
        continue;
      }

      report.existingValidMetadataRecords.push(canonicalId);
    }

    return report;
  } catch (error) {
    report.fatalErrors.push(error.message);

    if (error instanceof CatalogBuildError) {
      error.report = report;
      throw error;
    }

    throw new CatalogBuildError(error.message, report);
  }
}
