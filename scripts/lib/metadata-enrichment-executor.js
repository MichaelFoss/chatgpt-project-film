import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import {
  loadMetadataCache,
  mapMetadataRecord,
} from './catalog-metadata.js';
import { writeGeneratedJsonFile } from './json-file.js';
import { planMetadataEnrichment } from './metadata-enrichment-planner.js';
import { metadataProviders } from './metadata-providers/index.js';

function findProvider(providerId, providers) {
  return providers.find((provider) => provider.id === providerId);
}

function assertValidCreatedRecord(canonicalId, providerId, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new CatalogBuildError(
      `Provider ${providerId} returned an invalid metadata record for ${canonicalId}.`,
    );
  }

  if (
    record.canonicalId !== canonicalId ||
    record.provider !== providerId ||
    record.isValid !== true ||
    !record.lastUpdatedAt ||
    record.provenance?.source !== 'provider-lookup' ||
    record.provenance?.provider !== providerId ||
    !record.metadata ||
    typeof record.metadata !== 'object' ||
    Array.isArray(record.metadata)
  ) {
    throw new CatalogBuildError(
      `Provider ${providerId} returned an incomplete metadata record for ${canonicalId}.`,
    );
  }

  if (!mapMetadataRecord(canonicalId, record)) {
    throw new CatalogBuildError(
      `Provider ${providerId} returned unusable metadata for ${canonicalId}.`,
    );
  }
}

export async function executeMetadataEnrichment({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'catalog.events.ndjson'),
  metadataCachePath = path.join(rootDir, 'data', 'metadata-cache.json'),
  providers = metadataProviders,
  now = () => new Date(),
} = {}) {
  const report = await planMetadataEnrichment({
    rootDir,
    eventsPath,
    metadataCachePath,
    providers,
  });
  report.mode = 'execute';

  try {
    const { cache } = await loadMetadataCache(metadataCachePath);
    const updatedCache = { ...cache };
    let changed = false;

    for (const plannedLookup of report.plannedLookups) {
      const {
        canonicalId,
        provider: providerId,
        reason,
      } = plannedLookup;

      if (reason !== 'missing') {
        continue;
      }

      if (mapMetadataRecord(canonicalId, updatedCache[canonicalId])) {
        continue;
      }

      const provider = findProvider(providerId, providers);

      if (!provider) {
        throw new CatalogBuildError(
          `Planned provider ${providerId} is not configured.`,
        );
      }

      const fetchedAt = now().toISOString();
      const response = await provider.lookup({ canonicalId });
      const record = provider.toMetadataRecord({
        canonicalId,
        response,
        fetchedAt,
      });

      assertValidCreatedRecord(canonicalId, providerId, record);
      updatedCache[canonicalId] = record;
      report.executedLookups.push({
        canonicalId,
        provider: providerId,
      });
      report.metadataRecordsCreated.push(canonicalId);
      changed = true;
    }

    if (changed) {
      await writeGeneratedJsonFile(metadataCachePath, updatedCache);
      report.filesWritten.push(metadataCachePath);
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
