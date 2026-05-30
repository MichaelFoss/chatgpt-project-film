export function createFakeMetadataProvider() {
  const calls = {
    lookup: [],
    toMetadataRecord: [],
  };

  return {
    id: 'fake',
    calls,

    supports(canonicalId) {
      return canonicalId.startsWith('imdb:');
    },

    async lookup({ canonicalId }) {
      calls.lookup.push(canonicalId);

      return {
        mediaType: 'movie',
        title: `Fixture title for ${canonicalId}`,
        genres: ['Fixture'],
      };
    },

    toMetadataRecord({ canonicalId, response, fetchedAt }) {
      calls.toMetadataRecord.push(canonicalId);

      return {
        canonicalId,
        provider: 'fake',
        isValid: true,
        lastUpdatedAt: fetchedAt,
        provenance: {
          source: 'provider-lookup',
          provider: 'fake',
        },
        metadata: response,
      };
    },
  };
}
