import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  executeMetadataEnrichment,
  planMetadataEnrichment,
  resolveMetadataEnrichmentCommand,
} from '../../scripts/enrich-metadata.js';
import { buildCatalog } from '../../scripts/lib/catalog-builder.js';
import {
  createOmdbProvider,
  metadataProviders,
  notImplementedProvider,
} from '../../scripts/lib/metadata-providers/index.js';
import { createFakeMetadataProvider } from './fake-metadata-provider.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-enrichment-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  return rootDir;
}

async function writeEvents(rootDir, events) {
  const lines = events.map((event) => JSON.stringify(event)).join('\n');
  await fs.writeFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    `${lines}\n`,
    'utf8',
  );
}

async function writeMetadata(rootDir, metadataCache) {
  await fs.writeFile(
    path.join(rootDir, 'data', 'metadata-cache.json'),
    `${JSON.stringify(metadataCache, null, 2)}\n`,
    'utf8',
  );
}

async function readProjectFiles(rootDir) {
  const files = {};

  for (const directory of ['events', 'data']) {
    const entries = await fs.readdir(path.join(rootDir, directory));

    for (const entry of entries) {
      const relativePath = path.join(directory, entry);
      files[relativePath] = await fs.readFile(
        path.join(rootDir, relativePath),
        'utf8',
      );
    }
  }

  return files;
}

function catalogAdd(overrides = {}) {
  return {
    eventType: 'catalog.add',
    occurredAt: '2026-05-29T00:00:00.000Z',
    source: 'manual',
    canonicalId: 'imdb:tt0112573',
    ...overrides,
  };
}

function validMetadata(canonicalId = 'imdb:tt0112573') {
  return {
    canonicalId,
    provider: 'manual',
    isValid: true,
    lastUpdatedAt: '2026-05-29T00:00:00.000Z',
    metadata: {
      mediaType: 'movie',
      title: 'Braveheart',
      genres: ['Biography', 'Drama'],
    },
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('planMetadataEnrichment', () => {
  it('recognizes explicit CLI commands', () => {
    expect(
      resolveMetadataEnrichmentCommand([
        'node',
        'scripts/enrich-metadata.js',
        'plan',
      ]),
    ).toBe('plan');
    expect(
      resolveMetadataEnrichmentCommand([
        'node',
        'scripts/enrich-metadata.js',
        'write',
      ]),
    ).toBe('write');
    expect(() =>
      resolveMetadataEnrichmentCommand([
        'node',
        'scripts/enrich-metadata.js',
      ]),
    ).toThrow('Metadata enrichment command must be "plan" or "write".');
  });

  it('plans missing metadata for lookup', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
    });

    expect(report.missingMetadata).toEqual(['imdb:tt0112573']);
    expect(report.noSupportingProviderConfigured).toEqual([]);
    expect(report.plannedLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'missing',
        provider: 'fake',
      },
    ]);
    expect(fakeProvider.calls.lookup).toEqual([]);
    expect(fakeProvider.calls.toMetadataRecord).toEqual([]);
  });

  it('plans OMDb-supported missing IMDb metadata with the default registry', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataEnrichment({
      rootDir,
      providers: metadataProviders,
    });

    expect(report.missingMetadata).toEqual(['imdb:tt0112573']);
    expect(report.noSupportingProviderConfigured).toEqual([]);
    expect(report.plannedLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'missing',
        provider: 'omdb',
      },
    ]);
  });

  it('skips valid metadata as already valid', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': validMetadata(),
    });

    const report = await planMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
    });

    expect(report.alreadyValidMetadata).toEqual(['imdb:tt0112573']);
    expect(report.noSupportingProviderConfigured).toEqual([]);
    expect(report.plannedLookups).toEqual([]);
  });

  it('plans invalid metadata for lookup', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': {
        canonicalId: 'imdb:tt0112573',
        provider: 'manual',
        isValid: true,
        metadata: {
          mediaType: 'movie',
          genres: ['Drama'],
        },
      },
    });

    const report = await planMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
    });

    expect(report.invalidMetadata).toEqual(['imdb:tt0112573']);
    expect(report.noSupportingProviderConfigured).toEqual([]);
    expect(report.plannedLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'invalid',
        provider: 'fake',
      },
    ]);
  });

  it('does not plan metadataLookup skip events for lookup', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [
      catalogAdd({ metadataLookup: 'skip' }),
    ]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
    });

    expect(report.skippedMetadataLookup).toEqual(['imdb:tt0112573']);
    expect(report.missingMetadata).toEqual([]);
    expect(report.noSupportingProviderConfigured).toEqual([]);
    expect(report.plannedLookups).toEqual([]);
  });

  it('reports missing metadata without planning when no supporting provider is configured', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataEnrichment({
      rootDir,
      providers: [notImplementedProvider],
    });

    expect(report.missingMetadata).toEqual(['imdb:tt0112573']);
    expect(report.noSupportingProviderConfigured).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'missing',
      },
    ]);
    expect(report.plannedLookups).toEqual([]);
  });

  it('reports duplicate catalog adds as non-fatal', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [
      catalogAdd({ eventId: 'event-1' }),
      catalogAdd({ eventId: 'event-2' }),
    ]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
    });

    expect(report.uniqueCatalogAdds).toBe(1);
    expect(report.duplicateCatalogAddsSkipped).toBe(1);
    expect(report.duplicateCatalogAdds).toEqual(['imdb:tt0112573']);
    expect(report.fatalErrors).toEqual([]);
    expect(report.plannedLookups).toHaveLength(1);
  });

  it('dry-run writes no files', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});
    const before = await readProjectFiles(rootDir);

    const report = await planMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
    });

    const after = await readProjectFiles(rootDir);
    await expect(
      fs.access(path.join(rootDir, 'data', 'catalog.json')),
    ).rejects.toThrow();
    expect(report.filesWritten).toEqual([]);
    expect(after).toEqual(before);
    expect(fakeProvider.calls.lookup).toEqual([]);
    expect(fakeProvider.calls.toMetadataRecord).toEqual([]);
  });

  it('provider stub does not perform network access', async () => {
    expect(notImplementedProvider.id).toBe('not-implemented');
    expect(notImplementedProvider.supports('imdb:tt0112573')).toBe(
      false,
    );
    await expect(notImplementedProvider.lookup()).rejects.toThrow(
      'Real metadata provider lookups are not implemented yet.',
    );
  });
});

describe('executeMetadataEnrichment', () => {
  it('writes metadata-cache.json for missing metadata', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });

    const cache = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'metadata-cache.json'),
        'utf8',
      ),
    );

    expect(report.mode).toBe('execute');
    expect(report.filesWritten).toEqual([
      path.join(rootDir, 'data', 'metadata-cache.json'),
    ]);
    expect(report.executedLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        provider: 'fake',
      },
    ]);
    expect(report.metadataRecordsCreated).toEqual(['imdb:tt0112573']);
    expect(report.providerLookupFailures).toEqual([]);
    expect(fakeProvider.calls.lookup).toEqual(['imdb:tt0112573']);
    expect(fakeProvider.calls.toMetadataRecord).toEqual([
      'imdb:tt0112573',
    ]);
    expect(cache).toEqual({
      'imdb:tt0112573': {
        canonicalId: 'imdb:tt0112573',
        provider: 'fake',
        isValid: true,
        lastUpdatedAt: '2026-05-30T12:00:00.000Z',
        provenance: {
          source: 'provider-lookup',
          provider: 'fake',
        },
        metadata: {
          mediaType: 'movie',
          title: 'Fixture title for imdb:tt0112573',
          genres: ['Fixture'],
        },
      },
    });
  });

  it('reports provider failures without writing failure-state records yet', async () => {
    const rootDir = await createTempProject();
    const unavailableProvider = {
      id: 'unavailable',
      supports: () => true,
      async lookup() {
        return {
          status: 'unavailable',
        };
      },
      toMetadataRecord({ canonicalId, fetchedAt }) {
        return {
          canonicalId,
          provider: 'unavailable',
          isValid: false,
          lastUpdatedAt: fetchedAt,
          provenance: {
            source: 'provider-lookup',
            provider: 'unavailable',
          },
          request: {
            retryAttemptsCount: 0,
            error: {
              source: 'application',
              message: 'Provider is not configured.',
            },
          },
        };
      },
    };
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataEnrichment({
      rootDir,
      providers: [unavailableProvider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'metadata-cache.json'),
        'utf8',
      ),
    );

    expect(report.executedLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        provider: 'unavailable',
      },
    ]);
    expect(report.providerLookupFailures).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        provider: 'unavailable',
        reason: 'Provider is not configured.',
      },
    ]);
    expect(report.metadataRecordsCreated).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(cache).toEqual({});
  });

  it('reports unavailable OMDb lookups without writing failure-state records yet', async () => {
    const rootDir = await createTempProject();
    const provider = createOmdbProvider({
      apiKeyProvider: () => undefined,
      fetchImpl: async () => {
        throw new Error(
          'fetch should not be called without an API key',
        );
      },
    });
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataEnrichment({
      rootDir,
      providers: [provider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'metadata-cache.json'),
        'utf8',
      ),
    );

    expect(report.plannedLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'missing',
        provider: 'omdb',
      },
    ]);
    expect(report.executedLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        provider: 'omdb',
      },
    ]);
    expect(report.providerLookupFailures).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        provider: 'omdb',
        reason: 'OMDB_API_KEY is not configured.',
      },
    ]);
    expect(report.metadataRecordsCreated).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(cache).toEqual({});
  });

  it('preserves existing valid records without invoking providers', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    const existing = validMetadata();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': existing,
    });

    const before = await readProjectFiles(rootDir);
    const report = await executeMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const after = await readProjectFiles(rootDir);

    expect(report.alreadyValidMetadata).toEqual(['imdb:tt0112573']);
    expect(report.filesWritten).toEqual([]);
    expect(after).toEqual(before);
    expect(fakeProvider.calls.lookup).toEqual([]);
    expect(fakeProvider.calls.toMetadataRecord).toEqual([]);
  });

  it('keeps catalog generation independent and offline', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    await executeMetadataEnrichment({
      rootDir,
      providers: [fakeProvider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });

    const lookupCallsAfterEnrichment = [...fakeProvider.calls.lookup];
    const report = await buildCatalog({ rootDir });
    const catalog = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'catalog.json'),
        'utf8',
      ),
    );

    expect(fakeProvider.calls.lookup).toEqual(
      lookupCallsAfterEnrichment,
    );
    expect(report.catalogRecordsWritten).toBe(1);
    expect(catalog['imdb:tt0112573']).toEqual({
      canonicalId: 'imdb:tt0112573',
      mediaType: 'movie',
      title: 'Fixture title for imdb:tt0112573',
      genres: ['Fixture'],
    });
  });
});
