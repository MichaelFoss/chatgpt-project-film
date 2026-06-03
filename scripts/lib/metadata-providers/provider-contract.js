export const metadataLookupResultCategories = Object.freeze({
  found: 'found',
  notFound: 'not-found',
  invalidResponse: 'invalid-response',
  retryableFailure: 'retryable-failure',
  permanentFailure: 'permanent-failure',
  rateLimited: 'rate-limited',
  timedOut: 'timed-out',
});

const categoryByLegacyStatus = new Map([
  ['valid', metadataLookupResultCategories.found],
  ['invalid', metadataLookupResultCategories.invalidResponse],
  ['unavailable', metadataLookupResultCategories.permanentFailure],
  ['unsupported', metadataLookupResultCategories.permanentFailure],
]);

const categoryByStatus = new Map([
  ...Object.values(metadataLookupResultCategories).map((category) => [
    category,
    category,
  ]),
  ...categoryByLegacyStatus,
]);

function normalizeError(error) {
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return undefined;
  }

  return Object.fromEntries(
    [
      ['source', error.source],
      ['message', error.message],
      ['statusCode', error.statusCode],
      ['retryAfterSeconds', error.retryAfterSeconds],
    ].filter(([, value]) => value !== undefined),
  );
}

export function classifyMetadataLookupResult(result) {
  const category = categoryByStatus.get(result?.status);

  if (!category) {
    return {
      category: metadataLookupResultCategories.invalidResponse,
      detail: {
        message: `Unknown provider lookup status: ${result?.status}.`,
      },
    };
  }

  return {
    category,
    detail: {
      provider: result.provider,
      canonicalId: result.canonicalId,
      lookupKey: result.lookupKey,
      error: normalizeError(result.error),
    },
  };
}

export function createMetadataLookupResult({
  provider,
  canonicalId,
  lookupKey,
  status,
  metadata,
  error,
}) {
  if (!categoryByStatus.has(status)) {
    throw new Error(
      `Unsupported metadata lookup result status: ${status}.`,
    );
  }

  return {
    provider,
    canonicalId,
    lookupKey,
    status,
    metadata,
    error: normalizeError(error),
  };
}

export function selectMetadataProvider({
  canonicalId,
  providers,
  providerId,
}) {
  const requestedProviders = providerId
    ? providers.filter((provider) => provider.id === providerId)
    : providers;

  if (providerId && requestedProviders.length === 0) {
    return {
      provider: null,
      reason: 'requested-provider-not-configured',
    };
  }

  const provider = requestedProviders.find((candidate) =>
    candidate.supports(canonicalId),
  );

  if (!provider) {
    return {
      provider: null,
      reason: providerId
        ? 'requested-provider-does-not-support-id'
        : 'no-supporting-provider',
    };
  }

  return {
    provider,
    reason: 'selected',
  };
}
