import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import {
  loadMetadataCache,
  mapMetadataRecord,
} from './catalog-metadata.js';
import { writeGeneratedJsonFile } from './json-file.js';
import { planMetadataHydration } from './metadata-hydration-planner.js';
import {
  classifyMetadataLookupResult,
  metadataLookupResultCategories,
  mockMetadataProvider,
} from './metadata-providers/index.js';

export const metadataHydrationWriteDefaults = Object.freeze({
  defaultLimit: 25,
  hardMaxLimit: 100,
});

function findProvider(providerId, providers) {
  return providers.find((provider) => provider.id === providerId);
}

function assertMockProviderOnly(providerId) {
  if (providerId !== 'mock') {
    throw new CatalogBuildError(
      'Metadata hydration write mode currently supports only "--provider mock".',
    );
  }
}

function normalizeLimit({ limit, defaultLimit, hardMaxLimit }) {
  const effectiveLimit = limit ?? defaultLimit;

  if (!Number.isInteger(effectiveLimit) || effectiveLimit < 1) {
    throw new CatalogBuildError(
      'Metadata hydration write limit must be a positive integer.',
    );
  }

  if (effectiveLimit > hardMaxLimit) {
    throw new CatalogBuildError(
      `Metadata hydration write limit must be ${hardMaxLimit} or less.`,
    );
  }

  return effectiveLimit;
}

function createMetadataRecordFromLookupResult({
  canonicalId,
  providerId,
  result,
  fetchedAt,
}) {
  return {
    canonicalId,
    provider: providerId,
    isValid: true,
    lastUpdatedAt: fetchedAt,
    provenance: {
      source: 'provider-lookup',
      provider: providerId,
      lookupKey: result.lookupKey,
    },
    metadata: result.metadata,
  };
}

function sortMetadataCache(cache) {
  return Object.fromEntries(
    Object.entries(cache).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

export async function executeMetadataHydrationWrite({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'catalog.events.ndjson'),
  metadataCachePath = path.join(rootDir, 'data', 'metadata-cache.json'),
  providerId = 'mock',
  providers = [mockMetadataProvider],
  limit,
  targetCanonicalId,
  dryRun = false,
  defaultLimit = metadataHydrationWriteDefaults.defaultLimit,
  hardMaxLimit = metadataHydrationWriteDefaults.hardMaxLimit,
  now = () => new Date(),
} = {}) {
  assertMockProviderOnly(providerId);

  const effectiveLimit = normalizeLimit({
    limit,
    defaultLimit,
    hardMaxLimit,
  });

  const report = await planMetadataHydration({
    rootDir,
    eventsPath,
    metadataCachePath,
    providers,
  });
  report.mode = dryRun ? 'dry-run' : 'write';
  report.provider = providerId;
  report.requestedLimit = limit ?? null;
  report.effectiveLimit = effectiveLimit;
  report.targetedCanonicalId = targetCanonicalId ?? null;
  report.dryRun = dryRun;

  try {
    const provider = findProvider(providerId, providers);

    if (!provider) {
      throw new CatalogBuildError(
        `Metadata hydration provider is not configured: ${providerId}.`,
      );
    }

    const eligibleProviderLookups = report.eligibleLookups.filter(
      (item) =>
        ['missing', 'invalid-cache'].includes(item.reason) &&
        item.provider === providerId,
    );
    const candidateLookups = targetCanonicalId
      ? eligibleProviderLookups.filter(
          (item) => item.canonicalId === targetCanonicalId,
        )
      : eligibleProviderLookups;
    const cappedLookups = candidateLookups.slice(0, effectiveLimit);
    const { cache } = await loadMetadataCache(metadataCachePath);
    const updatedCache = { ...cache };
    let changed = false;

    for (const lookup of cappedLookups) {
      const { canonicalId } = lookup;

      if (mapMetadataRecord(canonicalId, updatedCache[canonicalId])) {
        continue;
      }

      const result = await provider.lookup({ canonicalId });
      const { category } = classifyMetadataLookupResult(result);
      report.requestsAttempted += 1;
      report.lookupResults.push({
        canonicalId,
        provider: providerId,
        status: category,
      });

      if (category !== metadataLookupResultCategories.found) {
        report.unresolvedLookupRecords.push({
          canonicalId,
          provider: providerId,
          status: category,
        });
        continue;
      }

      report.metadataRecordWriteCandidates.push(canonicalId);

      if (dryRun) {
        continue;
      }

      const record = createMetadataRecordFromLookupResult({
        canonicalId,
        providerId,
        result,
        fetchedAt: now().toISOString(),
      });

      if (!mapMetadataRecord(canonicalId, record)) {
        report.lookupResults.push({
          canonicalId,
          provider: providerId,
          status: metadataLookupResultCategories.invalidResponse,
        });
        report.unresolvedLookupRecords.push({
          canonicalId,
          provider: providerId,
          status: metadataLookupResultCategories.invalidResponse,
        });
        continue;
      }

      updatedCache[canonicalId] = record;
      report.metadataRecordsWritten.push(canonicalId);
      changed = true;
    }

    report.remainingEligibleRecords =
      eligibleProviderLookups.length - cappedLookups.length;

    if (changed) {
      await writeGeneratedJsonFile(
        metadataCachePath,
        sortMetadataCache(updatedCache),
      );
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
