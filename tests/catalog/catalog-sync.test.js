import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogBuildError } from '../../scripts/lib/catalog-build-error.js';
import {
  formatCatalogSyncReport,
  hasCatalogSyncFatalErrors,
  syncCatalog,
} from '../../scripts/lib/catalog-sync.js';
import { createMetadataEnrichmentReport } from '../../scripts/lib/metadata-enrichment-report.js';
import { createFakeMetadataProvider } from './fake-metadata-provider.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-sync-'),
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

async function readJson(rootDir, relativePath) {
  return JSON.parse(
    await fs.readFile(path.join(rootDir, relativePath), 'utf8'),
  );
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

function unavailableProvider() {
  return {
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
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('syncCatalog', () => {
  it('runs enrichment before catalog build', async () => {
    const calls = [];

    const report = await syncCatalog({
      enrichmentExecutor: async () => {
        calls.push('enrichment');
        const enrichmentReport = createMetadataEnrichmentReport();
        enrichmentReport.mode = 'execute';
        return enrichmentReport;
      },
      catalogBuilder: async () => {
        calls.push('catalog');
        return {
          eventsRead: 0,
          uniqueCatalogAdds: 0,
          duplicateCatalogAddsSkipped: 0,
          duplicateCatalogAdds: [],
          catalogRecordsWritten: 0,
          missingMetadata: [],
          invalidMetadata: [],
          fatalErrors: [],
          outputPathWritten: null,
          intendedOutputPath: null,
          metadataCacheMissing: false,
        };
      },
    });

    expect(calls).toEqual(['enrichment', 'catalog']);
    expect(report.catalogBuildSkipped).toBe(false);
  });

  it('writes metadata cache when fake provider fills missing metadata', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await syncCatalog({
      rootDir,
      providers: [fakeProvider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = await readJson(rootDir, 'data/metadata-cache.json');

    expect(
      report.metadataEnrichmentReport.metadataRecordsCreated,
    ).toEqual(['imdb:tt0112573']);
    expect(report.metadataEnrichmentReport.filesWritten).toEqual([
      path.join(rootDir, 'data', 'metadata-cache.json'),
    ]);
    expect(cache['imdb:tt0112573']).toMatchObject({
      canonicalId: 'imdb:tt0112573',
      provider: 'fake',
      isValid: true,
      metadata: {
        mediaType: 'movie',
        title: 'Fixture title for imdb:tt0112573',
        genres: ['Fixture'],
      },
    });
  });

  it('writes catalog output after enrichment', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await syncCatalog({
      rootDir,
      providers: [fakeProvider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const catalog = await readJson(rootDir, 'data/catalog.json');

    expect(report.catalogBuildReport.catalogRecordsWritten).toBe(1);
    expect(report.catalogBuildReport.outputPathWritten).toBe(
      path.join(rootDir, 'data', 'catalog.json'),
    );
    expect(catalog).toEqual({
      'imdb:tt0112573': {
        canonicalId: 'imdb:tt0112573',
        mediaType: 'movie',
        title: 'Fixture title for imdb:tt0112573',
        genres: ['Fixture'],
      },
    });
  });

  it('skips catalog build when enrichment has fatal errors', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [
      catalogAdd({ eventId: 'duplicate' }),
      catalogAdd({ eventId: 'duplicate' }),
    ]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': validMetadata(),
    });

    const report = await syncCatalog({ rootDir });

    await expect(
      fs.access(path.join(rootDir, 'data', 'catalog.json')),
    ).rejects.toThrow();
    expect(report.catalogBuildSkipped).toBe(true);
    expect(report.metadataEnrichmentReport.fatalErrors).toHaveLength(1);
    expect(report.catalogBuildReport.eventsRead).toBe(0);
    expect(hasCatalogSyncFatalErrors(report)).toBe(true);
    expect(formatCatalogSyncReport(report)).toContain(
      '- catalog build skipped: true',
    );
  });

  it('provider lookup failures do not block catalog build', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await syncCatalog({
      rootDir,
      providers: [unavailableProvider()],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const catalog = await readJson(rootDir, 'data/catalog.json');

    expect(report.catalogBuildSkipped).toBe(false);
    expect(
      report.metadataEnrichmentReport.providerLookupFailures,
    ).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        provider: 'unavailable',
        reason: 'Provider is not configured.',
      },
    ]);
    expect(report.catalogBuildReport.missingMetadata).toEqual([
      'imdb:tt0112573',
    ]);
    expect(catalog).toEqual({});
    expect(hasCatalogSyncFatalErrors(report)).toBe(false);
  });

  it('does not append or rewrite events/catalog.events.ndjson', async () => {
    const rootDir = await createTempProject();
    const fakeProvider = createFakeMetadataProvider();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});
    const eventsPath = path.join(
      rootDir,
      'events',
      'catalog.events.ndjson',
    );
    const before = await fs.readFile(eventsPath, 'utf8');

    await syncCatalog({
      rootDir,
      providers: [fakeProvider],
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const after = await fs.readFile(eventsPath, 'utf8');

    expect(after).toBe(before);
  });

  it('records catalog build failures without marking the build skipped', async () => {
    const report = await syncCatalog({
      enrichmentExecutor: async () => {
        const enrichmentReport = createMetadataEnrichmentReport();
        enrichmentReport.mode = 'execute';
        return enrichmentReport;
      },
      catalogBuilder: async () => {
        throw new CatalogBuildError('catalog failed');
      },
    });

    expect(report.catalogBuildSkipped).toBe(false);
    expect(report.catalogBuildReport.fatalErrors).toEqual([
      'catalog failed',
    ]);
    expect(hasCatalogSyncFatalErrors(report)).toBe(true);
  });
});
