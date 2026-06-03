import { describe, expect, it, vi } from 'vitest';
import {
  classifyMetadataLookupResult,
  createMockMetadataProvider,
  metadataProviders,
  metadataLookupResultCategories,
  mockMetadataFixtures,
  mockMetadataProvider,
} from '../../scripts/lib/metadata-providers/index.js';

describe('mock metadata provider', () => {
  it('is permanent no-network infrastructure with no API key requirement', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(mockMetadataProvider.id).toBe('mock');
    expect(mockMetadataProvider.supports('imdb:tt0112573')).toBe(true);

    const result = await mockMetadataProvider.lookup({
      canonicalId: 'imdb:tt0112573',
    });

    expect(result.status).toBe(metadataLookupResultCategories.found);
    expect(result.metadata).toEqual({
      mediaType: 'movie',
      title: 'Mock Fixture: Braveheart',
      genres: ['Biography', 'Drama'],
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('is exported for explicit use but excluded from default provider selection', () => {
    expect(mockMetadataProvider).not.toHaveProperty('toMetadataRecord');
    expect(
      metadataProviders.map((provider) => provider.id),
    ).not.toContain('mock');
  });

  it('covers all required lookup result categories with fixtures', async () => {
    const expectedStatuses = new Set(
      Object.values(metadataLookupResultCategories),
    );
    const fixtureStatuses = new Set(
      [...mockMetadataFixtures.values()].map(
        (fixture) => fixture.status,
      ),
    );

    expect(fixtureStatuses).toEqual(expectedStatuses);
  });

  it.each([
    ['imdb:tt0112573', 'found'],
    ['mock:not-found', 'not-found'],
    ['mock:invalid-response', 'invalid-response'],
    ['mock:retryable-failure', 'retryable-failure'],
    ['mock:permanent-failure', 'permanent-failure'],
    ['mock:rate-limited', 'rate-limited'],
    ['mock:timed-out', 'timed-out'],
  ])(
    'returns deterministic lookup results for %s',
    async (canonicalId, status) => {
      const firstResult = await mockMetadataProvider.lookup({
        canonicalId,
      });
      const secondResult = await mockMetadataProvider.lookup({
        canonicalId,
      });

      expect(firstResult).toEqual(secondResult);
      expect(firstResult).toMatchObject({
        provider: 'mock',
        canonicalId,
        status,
      });
      expect(classifyMetadataLookupResult(firstResult).category).toBe(
        status,
      );
    },
  );

  it('supports configurable artificial delay disabled by default', async () => {
    const provider = createMockMetadataProvider();

    const startedAt = Date.now();
    await provider.lookup({ canonicalId: 'imdb:tt0112573' });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(20);
  });

  it('simulates timeout behavior without network access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = createMockMetadataProvider({ delayMs: 25 });

    const result = await provider.lookup({
      canonicalId: 'imdb:tt0112573',
      timeoutMs: 1,
    });

    expect(result).toMatchObject({
      provider: 'mock',
      canonicalId: 'imdb:tt0112573',
      lookupKey: 'tt0112573',
      status: 'timed-out',
      error: {
        source: 'transport',
        message: 'Mock lookup exceeded configured timeout.',
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
