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
  createMockMetadataProvider,
  metadataLookupResultCategories,
  omdbProvider,
} from './metadata-providers/index.js';

export const metadataHydrationWriteDefaults = Object.freeze({
  defaultLimit: 25,
  hardMaxLimit: 100,
  delayMs: 0,
  mockDelayMs: 0,
  timeoutMs: null,
  retryLimit: 0,
});

function findProvider(providerId, providers) {
  return providers.find((provider) => provider.id === providerId);
}

function resolveDefaultProviders({ providerId, mockDelayMs }) {
  if (providerId === 'omdb') {
    return [omdbProvider];
  }

  return [createMockMetadataProvider({ delayMs: mockDelayMs })];
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

function normalizeNonNegativeInteger({ value, name }) {
  if (value === null || value === undefined) {
    return value;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new CatalogBuildError(
      `Metadata hydration option ${name} must be a non-negative integer.`,
    );
  }

  return value;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function createMetadataRecord({
  provider,
  canonicalId,
  providerId,
  result,
  fetchedAt,
}) {
  if (typeof provider.toMetadataRecord === 'function') {
    return provider.toMetadataRecord({
      canonicalId,
      response: result,
      result,
      fetchedAt,
    });
  }

  return createMetadataRecordFromLookupResult({
    canonicalId,
    providerId,
    result,
    fetchedAt,
  });
}

function sortMetadataCache(cache) {
  return Object.fromEntries(
    Object.entries(cache).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function shouldRetryLookup(category) {
  return [
    metadataLookupResultCategories.retryableFailure,
    metadataLookupResultCategories.timedOut,
  ].includes(category);
}

async function controlledLookup({
  provider,
  canonicalId,
  providerId,
  report,
  effectiveLimit,
  delayMs,
  timeoutMs,
  retryLimit,
}) {
  let attemptsForLookup = 0;
  let lastResult;
  let lastCategory;

  // The per-run cap covers every provider lookup attempt, including retries.
  while (report.requestsAttempted < effectiveLimit) {
    if (report.requestsAttempted > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    lastResult = await provider.lookup({
      canonicalId,
      timeoutMs: timeoutMs ?? undefined,
    });
    const classification = classifyMetadataLookupResult(lastResult);
    lastCategory = classification.category;
    attemptsForLookup += 1;
    report.requestsAttempted += 1;
    report.lookupResults.push({
      canonicalId,
      provider: providerId,
      status: lastCategory,
      detail: classification.detail,
    });

    if (
      !shouldRetryLookup(lastCategory) ||
      attemptsForLookup > retryLimit
    ) {
      break;
    }
  }

  return {
    result: lastResult,
    category: lastCategory,
  };
}

export async function executeMetadataHydrationWrite({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'catalog.events.ndjson'),
  metadataCachePath = path.join(rootDir, 'data', 'metadata-cache.json'),
  providerId = 'mock',
  providers,
  limit,
  targetCanonicalId,
  dryRun = false,
  defaultLimit = metadataHydrationWriteDefaults.defaultLimit,
  hardMaxLimit = metadataHydrationWriteDefaults.hardMaxLimit,
  delayMs = metadataHydrationWriteDefaults.delayMs,
  timeoutMs = metadataHydrationWriteDefaults.timeoutMs,
  retryLimit = metadataHydrationWriteDefaults.retryLimit,
  mockDelayMs = metadataHydrationWriteDefaults.mockDelayMs,
  now = () => new Date(),
} = {}) {
  const effectiveMockDelayMs = normalizeNonNegativeInteger({
    value: mockDelayMs,
    name: '--mock-delay-ms',
  });
  const effectiveProviders =
    providers ??
    resolveDefaultProviders({
      providerId,
      mockDelayMs: effectiveMockDelayMs,
    });
  const effectiveLimit = normalizeLimit({
    limit,
    defaultLimit,
    hardMaxLimit,
  });
  const effectiveDelayMs = normalizeNonNegativeInteger({
    value: delayMs,
    name: '--delay-ms',
  });
  const effectiveTimeoutMs = normalizeNonNegativeInteger({
    value: timeoutMs,
    name: '--timeout-ms',
  });
  const effectiveRetryLimit = normalizeNonNegativeInteger({
    value: retryLimit,
    name: '--retry-limit',
  });

  const report = await planMetadataHydration({
    rootDir,
    eventsPath,
    metadataCachePath,
    providers: effectiveProviders,
    providerId,
  });
  report.mode = dryRun ? 'dry-run' : 'write';
  report.provider = providerId;
  report.requestedLimit = limit ?? null;
  report.effectiveLimit = effectiveLimit;
  report.targetedCanonicalId = targetCanonicalId ?? null;
  report.dryRun = dryRun;

  try {
    const provider = findProvider(providerId, effectiveProviders);

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
    const { cache } = await loadMetadataCache(metadataCachePath);
    const updatedCache = { ...cache };
    let changed = false;
    let stopRequested = false;

    for (const lookup of candidateLookups) {
      if (report.requestsAttempted >= effectiveLimit || stopRequested) {
        break;
      }

      const { canonicalId } = lookup;

      if (mapMetadataRecord(canonicalId, updatedCache[canonicalId])) {
        continue;
      }

      const { result, category } = await controlledLookup({
        provider,
        canonicalId,
        providerId,
        report,
        effectiveLimit,
        delayMs: effectiveDelayMs,
        timeoutMs: effectiveTimeoutMs,
        retryLimit: effectiveRetryLimit,
      });

      if (category !== metadataLookupResultCategories.found) {
        report.unresolvedLookupRecords.push({
          canonicalId,
          provider: providerId,
          status: category,
        });
        stopRequested =
          category === metadataLookupResultCategories.rateLimited;
        continue;
      }

      report.metadataRecordWriteCandidates.push(canonicalId);

      if (dryRun) {
        continue;
      }

      const record = createMetadataRecord({
        provider,
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
          detail: {
            provider: providerId,
            canonicalId,
            lookupKey: result.lookupKey,
            error: {
              source: 'application',
              message:
                'Provider result could not be mapped into a valid metadata cache record.',
            },
          },
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

    report.remainingEligibleRecords = eligibleProviderLookups.filter(
      ({ canonicalId }) =>
        !mapMetadataRecord(canonicalId, updatedCache[canonicalId]),
    ).length;

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
