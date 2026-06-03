import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executeMetadataHydrationWrite } from '../../scripts/hydrate-metadata.js';
import {
  createMockMetadataProvider,
  metadataLookupResultCategories,
} from '../../scripts/lib/metadata-providers/index.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-hydration-write-'),
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

function invalidMetadata(canonicalId) {
  return {
    canonicalId,
    provider: 'manual',
    isValid: true,
    lastUpdatedAt: '2026-05-29T00:00:00.000Z',
    metadata: {
      mediaType: 'movie',
      genres: ['Drama'],
    },
  };
}

function foundFixture(canonicalId) {
  return {
    status: metadataLookupResultCategories.found,
    metadata: {
      mediaType: 'movie',
      title: `Mock title for ${canonicalId}`,
      genres: ['Fixture'],
    },
  };
}

function createTrackingMockProvider(fixtures) {
  const provider = createMockMetadataProvider({
    fixtures: new Map(
      fixtures.map((canonicalId) => [
        canonicalId,
        foundFixture(canonicalId),
      ]),
    ),
  });
  const calls = [];

  return {
    id: provider.id,
    calls,
    supports: provider.supports,
    async lookup(options) {
      calls.push(options.canonicalId);
      return provider.lookup(options);
    },
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('executeMetadataHydrationWrite', () => {
  it('rejects non-mock providers in write mode', async () => {
    await expect(
      executeMetadataHydrationWrite({
        providerId: 'omdb',
      }),
    ).rejects.toThrow(
      'Metadata hydration write mode currently supports only "--provider mock".',
    );
  });

  it('requests only missing eligible records with the mock provider', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider([
      'mock:missing',
      'mock:invalid-cache',
    ]);
    await writeEvents(rootDir, [
      catalogAdd('mock:valid'),
      catalogAdd('mock:missing'),
      catalogAdd('mock:invalid-cache'),
      catalogAdd('mock:skip', { metadataLookup: 'skip' }),
      catalogAdd('unsupported:1'),
    ]);
    await writeMetadata(rootDir, {
      'mock:valid': validMetadata('mock:valid'),
      'mock:invalid-cache': invalidMetadata('mock:invalid-cache'),
    });
    const before = await readProjectFiles(rootDir);

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
    });
    const after = await readProjectFiles(rootDir);

    expect(provider.calls).toEqual(['mock:missing']);
    expect(report.requestsAttempted).toBe(1);
    expect(report.metadataRecordWriteCandidates).toEqual([
      'mock:missing',
    ]);
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(report.remainingEligibleRecords).toBe(1);
    expect(after).toEqual(before);
  });

  it('enforces the request cap', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider([
      'mock:one',
      'mock:two',
      'mock:three',
    ]);
    await writeEvents(rootDir, [
      catalogAdd('mock:one'),
      catalogAdd('mock:two'),
      catalogAdd('mock:three'),
    ]);
    await writeMetadata(rootDir, {});
    const before = await readProjectFiles(rootDir);

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 2,
    });
    const after = await readProjectFiles(rootDir);

    expect(provider.calls).toEqual(['mock:one', 'mock:two']);
    expect(report.requestsAttempted).toBe(2);
    expect(report.metadataRecordWriteCandidates).toEqual([
      'mock:one',
      'mock:two',
    ]);
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(report.remainingEligibleRecords).toBe(3);
    expect(after).toEqual(before);
  });

  it('applies the default cap and rejects limits above the hard maximum', async () => {
    const rootDir = await createTempProject();
    const canonicalIds = Array.from(
      { length: 30 },
      (_, index) => `mock:${String(index + 1).padStart(2, '0')}`,
    );
    const provider = createTrackingMockProvider(canonicalIds);
    await writeEvents(
      rootDir,
      canonicalIds.map((canonicalId) => catalogAdd(canonicalId)),
    );
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
    });

    expect(provider.calls).toHaveLength(25);
    expect(report.effectiveLimit).toBe(25);
    expect(report.metadataRecordWriteCandidates).toEqual(
      canonicalIds.slice(0, 25),
    );
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(report.remainingEligibleRecords).toBe(30);

    await expect(
      executeMetadataHydrationWrite({
        rootDir,
        providers: [provider],
        providerId: 'mock',
        limit: 101,
      }),
    ).rejects.toThrow(
      'Metadata hydration write limit must be 100 or less.',
    );
  });

  it('hydrates only the requested canonical ID when --id is used', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider([
      'mock:one',
      'mock:two',
      'mock:three',
    ]);
    await writeEvents(rootDir, [
      catalogAdd('mock:one'),
      catalogAdd('mock:two'),
      catalogAdd('mock:three'),
    ]);
    await writeMetadata(rootDir, {});
    const before = await readProjectFiles(rootDir);

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 10,
      targetCanonicalId: 'mock:two',
    });
    const after = await readProjectFiles(rootDir);

    expect(provider.calls).toEqual(['mock:two']);
    expect(report.metadataRecordWriteCandidates).toEqual(['mock:two']);
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(report.remainingEligibleRecords).toBe(3);
    expect(after).toEqual(before);
  });

  it('writes nothing during dry-run', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider(['mock:one']);
    await writeEvents(rootDir, [catalogAdd('mock:one')]);
    await writeMetadata(rootDir, {});
    const before = await readProjectFiles(rootDir);

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      dryRun: true,
    });
    const after = await readProjectFiles(rootDir);

    expect(provider.calls).toEqual(['mock:one']);
    expect(report.mode).toBe('dry-run');
    expect(report.requestsAttempted).toBe(1);
    expect(report.metadataRecordWriteCandidates).toEqual(['mock:one']);
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(report.remainingEligibleRecords).toBe(1);
    expect(after).toEqual(before);
  });
});
