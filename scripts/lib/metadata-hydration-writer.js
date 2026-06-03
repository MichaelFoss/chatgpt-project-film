import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
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

    const eligibleMissingLookups = report.eligibleLookups.filter(
      (item) =>
        item.reason === 'missing' && item.provider === providerId,
    );
    const candidateLookups = targetCanonicalId
      ? eligibleMissingLookups.filter(
          (item) => item.canonicalId === targetCanonicalId,
        )
      : eligibleMissingLookups;
    const cappedLookups = candidateLookups.slice(0, effectiveLimit);

    for (const lookup of cappedLookups) {
      const { canonicalId } = lookup;

      const result = await provider.lookup({ canonicalId });
      const { category } = classifyMetadataLookupResult(result);
      report.requestsAttempted += 1;
      report.lookupResults.push({
        canonicalId,
        provider: providerId,
        status: category,
      });

      if (category !== metadataLookupResultCategories.found) {
        continue;
      }

      report.metadataRecordWriteCandidates.push(canonicalId);
    }

    report.remainingEligibleRecords = eligibleMissingLookups.length;

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
