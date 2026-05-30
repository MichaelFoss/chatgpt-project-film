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
import { createMetadataEnrichmentReport } from './metadata-enrichment-report.js';
import { metadataProviders } from './metadata-providers/index.js';

function selectProvider(canonicalId, providers) {
  return providers.find((provider) => provider.supports(canonicalId));
}

function addPlannedLookup(report, canonicalId, reason, providers) {
  const provider = selectProvider(canonicalId, providers);

  if (!provider) {
    report.noSupportingProviderConfigured.push({
      canonicalId,
      reason,
    });
    return;
  }

  report.plannedLookups.push({
    canonicalId,
    reason,
    provider: provider.id,
  });
}

export async function planMetadataEnrichment({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'catalog.events.ndjson'),
  metadataCachePath = path.join(rootDir, 'data', 'metadata-cache.json'),
  providers = metadataProviders,
} = {}) {
  const report = createMetadataEnrichmentReport();

  try {
    const events = await readEvents(eventsPath);
    report.eventsRead = events.length;

    const replay = replayCatalogAddEvents(events);
    report.uniqueCatalogAdds = replay.catalogAdds.length;
    report.duplicateCatalogAddsSkipped =
      replay.duplicateCatalogAdds.length;
    report.duplicateCatalogAdds = replay.duplicateCatalogAdds;

    const { cache, missingFile } =
      await loadMetadataCache(metadataCachePath);
    report.metadataCacheMissing = missingFile;

    for (const catalogAdd of replay.catalogAdds) {
      const { canonicalId, metadataLookup } = catalogAdd;

      if (metadataLookup === 'skip') {
        report.skippedMetadataLookup.push(canonicalId);
        continue;
      }

      const record = cache[canonicalId];

      if (!record) {
        report.missingMetadata.push(canonicalId);
        addPlannedLookup(report, canonicalId, 'missing', providers);
        continue;
      }

      const mapped = mapMetadataRecord(canonicalId, record);

      if (!mapped) {
        report.invalidMetadata.push(canonicalId);
        addPlannedLookup(report, canonicalId, 'invalid', providers);
        continue;
      }

      report.alreadyValidMetadata.push(canonicalId);
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
