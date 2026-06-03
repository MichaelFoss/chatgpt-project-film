import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatMetadataHydrationPlanReport,
  parseMetadataHydrationCli,
  planMetadataHydration,
  resolveMetadataHydrationCommand,
} from '../../scripts/hydrate-metadata.js';
import { mockMetadataProvider } from '../../scripts/lib/metadata-providers/index.js';
import { createFakeMetadataProvider } from './fake-metadata-provider.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-hydration-plan-'),
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

function catalogAdd(canonicalId, overrides = {}) {
  return {
    eventType: 'catalog.add',
    occurredAt: '2026-05-29T00:00:00.000Z',
    source: 'manual',
    canonicalId,
    ...overrides,
  };
}

function validMetadata(canonicalId) {
  return {
    canonicalId,
    provider: 'manual',
    isValid: true,
    lastUpdatedAt: '2026-05-29T00:00:00.000Z',
    metadata: {
      mediaType: 'movie',
      title: `Valid ${canonicalId}`,
      genres: ['Drama'],
    },
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('planMetadataHydration', () => {
  it('recognizes the plan CLI command only', () => {
    expect(
      resolveMetadataHydrationCommand([
        'node',
        'scripts/hydrate-metadata.js',
        'plan',
      ]),
    ).toBe('plan');

    expect(() =>
      resolveMetadataHydrationCommand([
        'node',
        'scripts/hydrate-metadata.js',
        'write',
      ]),
    ).not.toThrow();
    expect(
      resolveMetadataHydrationCommand([
        'node',
        'scripts/hydrate-metadata.js',
        'write',
      ]),
    ).toBe('write');
    expect(() =>
      resolveMetadataHydrationCommand([
        'node',
        'scripts/hydrate-metadata.js',
      ]),
    ).toThrow('Metadata hydration command must be "plan" or "write".');
  });

  it('parses write CLI options', () => {
    expect(
      parseMetadataHydrationCli([
        'node',
        'scripts/hydrate-metadata.js',
        'write',
        '--provider',
        'mock',
        '--limit',
        '12',
        '--id',
        'imdb:tt0112573',
        '--dry-run',
      ]),
    ).toEqual({
      command: 'write',
      providerId: 'mock',
      limit: 12,
      targetCanonicalId: 'imdb:tt0112573',
      dryRun: true,
    });
  });

  it('parses plan provider selection without write-only options', () => {
    expect(
      parseMetadataHydrationCli([
        'node',
        'scripts/hydrate-metadata.js',
        'plan',
        '--provider',
        'mock',
      ]),
    ).toEqual({
      command: 'plan',
      providerId: 'mock',
      dryRun: false,
    });

    expect(() =>
      parseMetadataHydrationCli([
        'node',
        'scripts/hydrate-metadata.js',
        'plan',
        '--limit',
        '1',
      ]),
    ).toThrow(
      'Metadata hydration option --limit is only supported in write mode.',
    );
  });

  it('reports read-only hydration planning counts', async () => {
    const rootDir = await createTempProject();
    const provider = createFakeMetadataProvider();
    await writeEvents(rootDir, [
      catalogAdd('imdb:tt0112573', { eventId: 'event-1' }),
      catalogAdd('imdb:tt0000002', { eventId: 'event-2' }),
      catalogAdd('imdb:tt0000003', { eventId: 'event-3' }),
      catalogAdd('imdb:tt0000004', {
        eventId: 'event-4',
        metadataLookup: 'skip',
      }),
      catalogAdd('unsupported:1', { eventId: 'event-5' }),
      catalogAdd('imdb:tt0112573', { eventId: 'event-6' }),
    ]);
    await writeMetadata(rootDir, {
      'imdb:tt0112573': validMetadata('imdb:tt0112573'),
      'imdb:tt0000003': {
        canonicalId: 'imdb:tt0000003',
        provider: 'manual',
        isValid: true,
        metadata: {
          mediaType: 'movie',
          genres: ['Drama'],
        },
      },
    });

    const before = await readProjectFiles(rootDir);

    const report = await planMetadataHydration({
      rootDir,
      providers: [provider],
    });

    const after = await readProjectFiles(rootDir);

    expect(report).toMatchObject({
      mode: 'plan',
      totalCatalogEvents: 6,
      uniqueCanonicalCatalogIds: 5,
      duplicateEventCount: 1,
      duplicateCatalogIds: ['imdb:tt0112573'],
      existingValidMetadataRecords: ['imdb:tt0112573'],
      missingMetadataRecords: ['imdb:tt0000002', 'unsupported:1'],
      skippedRecords: [
        {
          canonicalId: 'imdb:tt0000004',
          metadataLookup: 'skip',
        },
      ],
      invalidCacheRecords: ['imdb:tt0000003'],
      eligibleLookups: [
        {
          canonicalId: 'imdb:tt0000002',
          reason: 'missing',
          provider: 'fake',
        },
        {
          canonicalId: 'imdb:tt0000003',
          reason: 'invalid-cache',
          provider: 'fake',
        },
      ],
      ineligibleLookups: [
        {
          canonicalId: 'unsupported:1',
          reason: 'missing',
          selectionReason: 'no-supporting-provider',
        },
      ],
      filesWritten: [],
      fatalErrors: [],
    });
    expect(provider.calls.lookup).toEqual([]);
    expect(provider.calls.toMetadataRecord).toEqual([]);
    expect(after).toEqual(before);
    await expect(
      fs.access(path.join(rootDir, 'data', 'catalog.json')),
    ).rejects.toThrow();
  });

  it('uses the production provider registry by default without contacting providers', async () => {
    const rootDir = await createTempProject();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await writeEvents(rootDir, [
      catalogAdd('imdb:tt0112573'),
      catalogAdd('unsupported:1'),
    ]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataHydration({ rootDir });

    expect(report.eligibleLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'missing',
        provider: 'omdb',
      },
    ]);
    expect(report.ineligibleLookups).toEqual([
      {
        canonicalId: 'unsupported:1',
        reason: 'missing',
        selectionReason: 'no-supporting-provider',
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('allows explicit mock provider injection without network access', async () => {
    const rootDir = await createTempProject();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await writeEvents(rootDir, [
      catalogAdd('imdb:tt0112573'),
      catalogAdd('imdb:tt0000002'),
    ]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataHydration({
      rootDir,
      providers: [mockMetadataProvider],
    });

    expect(report.eligibleLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'missing',
        provider: 'mock',
      },
    ]);
    expect(report.ineligibleLookups).toEqual([
      {
        canonicalId: 'imdb:tt0000002',
        reason: 'missing',
        selectionReason: 'no-supporting-provider',
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('plans against the requested mock provider without explicit provider injection', async () => {
    const rootDir = await createTempProject();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await writeEvents(rootDir, [
      catalogAdd('imdb:tt0112573'),
      catalogAdd('imdb:tt0000002'),
    ]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataHydration({
      rootDir,
      providerId: 'mock',
    });

    expect(report.eligibleLookups).toEqual([
      {
        canonicalId: 'imdb:tt0112573',
        reason: 'missing',
        provider: 'mock',
      },
    ]);
    expect(report.ineligibleLookups).toEqual([
      {
        canonicalId: 'imdb:tt0000002',
        reason: 'missing',
        selectionReason: 'requested-provider-does-not-support-id',
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('formats the required summary fields', async () => {
    const report = {
      mode: 'plan',
      totalCatalogEvents: 2,
      uniqueCanonicalCatalogIds: 1,
      duplicateEventCount: 1,
      duplicateCatalogIds: ['imdb:tt0112573'],
      existingValidMetadataRecords: [],
      missingMetadataRecords: ['imdb:tt0112573'],
      skippedRecords: [],
      invalidCacheRecords: [],
      eligibleLookups: [
        {
          canonicalId: 'imdb:tt0112573',
          reason: 'missing',
          provider: 'mock',
        },
      ],
      ineligibleLookups: [],
      metadataCacheMissing: false,
      filesWritten: [],
      fatalErrors: [],
    };

    const formatted = formatMetadataHydrationPlanReport(report);

    expect(formatted).toContain('Metadata hydration plan');
    expect(formatted).toContain('- mode: plan');
    expect(formatted).toContain('- total catalog events: 2');
    expect(formatted).toContain('- unique canonical catalog IDs: 1');
    expect(formatted).toContain('- duplicate event count: 1');
    expect(formatted).toContain('- existing valid metadata records: 0');
    expect(formatted).toContain('- missing metadata records: 1');
    expect(formatted).toContain('- skipped records: 0');
    expect(formatted).toContain('- invalid cache records: 0');
    expect(formatted).toContain('- eligible lookup count: 1');
    expect(formatted).toContain('- ineligible lookup count: 0');
  });
});
