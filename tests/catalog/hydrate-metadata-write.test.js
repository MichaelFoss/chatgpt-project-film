import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  executeMetadataHydrationWrite,
  formatMetadataHydrationPlanReport,
  parseMetadataHydrationCli,
} from '../../scripts/hydrate-metadata.js';
import {
  createOmdbProvider,
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

async function readMetadata(rootDir) {
  return JSON.parse(
    await fs.readFile(
      path.join(rootDir, 'data', 'metadata-cache.json'),
      'utf8',
    ),
  );
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

function createTrackingMockProvider(fixtures, options = {}) {
  const fixtureEntries = Array.isArray(fixtures)
    ? fixtures.map((canonicalId) => [
        canonicalId,
        foundFixture(canonicalId),
      ])
    : Object.entries(fixtures);
  const provider = createMockMetadataProvider({
    fixtures: new Map(fixtureEntries),
    ...options,
  });
  const calls = [];
  const lookupOptions = [];

  return {
    id: provider.id,
    calls,
    lookupOptions,
    supports: provider.supports,
    async lookup(options) {
      calls.push(options.canonicalId);
      lookupOptions.push(options);
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
  it('does not make OMDb available in default write mode', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd('imdb:tt0000002')]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      limit: 1,
    });

    expect(report.provider).toBe('mock');
    expect(report.eligibleLookups).toEqual([]);
    expect(report.ineligibleLookups).toEqual([
      {
        canonicalId: 'imdb:tt0000002',
        reason: 'missing',
        selectionReason: 'no-supporting-provider',
      },
    ]);
    expect(report.requestsAttempted).toBe(0);
    expect(report.metadataRecordsWritten).toEqual([]);
  });

  it('rejects providers that are not configured in write mode', async () => {
    await expect(
      executeMetadataHydrationWrite({
        providerId: 'missing-provider',
      }),
    ).rejects.toThrow(
      'Metadata hydration provider is not configured: missing-provider.',
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

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = await readMetadata(rootDir);

    expect(provider.calls).toEqual([
      'mock:missing',
      'mock:invalid-cache',
    ]);
    expect(report.requestsAttempted).toBe(2);
    expect(report.metadataRecordWriteCandidates).toEqual([
      'mock:missing',
      'mock:invalid-cache',
    ]);
    expect(report.metadataRecordsWritten).toEqual([
      'mock:missing',
      'mock:invalid-cache',
    ]);
    expect(report.filesWritten).toEqual([
      path.join(rootDir, 'data', 'metadata-cache.json'),
    ]);
    expect(report.remainingEligibleRecords).toBe(0);
    expect(report.unresolvedLookupRecords).toEqual([]);
    expect(cache['mock:valid']).toEqual(validMetadata('mock:valid'));
    expect(cache['mock:missing']).toEqual({
      canonicalId: 'mock:missing',
      provider: 'mock',
      isValid: true,
      lastUpdatedAt: '2026-05-30T12:00:00.000Z',
      provenance: {
        source: 'provider-lookup',
        provider: 'mock',
        lookupKey: 'mock:missing',
      },
      metadata: {
        mediaType: 'movie',
        title: 'Mock title for mock:missing',
        genres: ['Fixture'],
      },
    });
    expect(cache['mock:invalid-cache']).toEqual({
      canonicalId: 'mock:invalid-cache',
      provider: 'mock',
      isValid: true,
      lastUpdatedAt: '2026-05-30T12:00:00.000Z',
      provenance: {
        source: 'provider-lookup',
        provider: 'mock',
        lookupKey: 'mock:invalid-cache',
      },
      metadata: {
        mediaType: 'movie',
        title: 'Mock title for mock:invalid-cache',
        genres: ['Fixture'],
      },
    });
    expect(cache).not.toHaveProperty('mock:skip');
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

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 2,
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = await readMetadata(rootDir);

    expect(provider.calls).toEqual(['mock:one', 'mock:two']);
    expect(report.requestsAttempted).toBe(2);
    expect(report.metadataRecordWriteCandidates).toEqual([
      'mock:one',
      'mock:two',
    ]);
    expect(report.metadataRecordsWritten).toEqual([
      'mock:one',
      'mock:two',
    ]);
    expect(report.filesWritten).toEqual([
      path.join(rootDir, 'data', 'metadata-cache.json'),
    ]);
    expect(report.remainingEligibleRecords).toBe(1);
    expect(report.unresolvedLookupRecords).toEqual([]);
    expect(Object.keys(cache)).toEqual(['mock:one', 'mock:two']);
  });

  it('reports capped remaining records separately from attempted unresolved records', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider({
      'mock:not-found': {
        status: metadataLookupResultCategories.notFound,
        error: {
          source: 'provider',
          message: 'not found',
        },
      },
      'mock:written': foundFixture('mock:written'),
      'mock:capped': foundFixture('mock:capped'),
    });
    await writeEvents(rootDir, [
      catalogAdd('mock:not-found'),
      catalogAdd('mock:written'),
      catalogAdd('mock:capped'),
    ]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 2,
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = await readMetadata(rootDir);
    const formatted = formatMetadataHydrationPlanReport(report);

    expect(provider.calls).toEqual(['mock:not-found', 'mock:written']);
    expect(report.requestsAttempted).toBe(2);
    expect(report.remainingEligibleRecords).toBe(1);
    expect(report.unresolvedLookupRecords).toEqual([
      {
        canonicalId: 'mock:not-found',
        provider: 'mock',
        status: metadataLookupResultCategories.notFound,
      },
    ]);
    expect(report.metadataRecordsWritten).toEqual(['mock:written']);
    expect(Object.keys(cache)).toEqual(['mock:written']);
    expect(formatted).toContain('- remaining eligible records: 1');
    expect(formatted).toContain('- unresolved lookup records: 1');
    expect(formatted).toContain('mock:not-found (mock, not-found)');
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
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });

    expect(provider.calls).toHaveLength(25);
    expect(report.effectiveLimit).toBe(25);
    expect(report.metadataRecordWriteCandidates).toEqual(
      canonicalIds.slice(0, 25),
    );
    expect(report.metadataRecordsWritten).toEqual(
      canonicalIds.slice(0, 25),
    );
    expect(report.filesWritten).toEqual([
      path.join(rootDir, 'data', 'metadata-cache.json'),
    ]);
    expect(report.remainingEligibleRecords).toBe(5);
    expect(report.unresolvedLookupRecords).toEqual([]);

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

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 10,
      targetCanonicalId: 'mock:two',
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = await readMetadata(rootDir);

    expect(provider.calls).toEqual(['mock:two']);
    expect(report.metadataRecordWriteCandidates).toEqual(['mock:two']);
    expect(report.metadataRecordsWritten).toEqual(['mock:two']);
    expect(report.filesWritten).toEqual([
      path.join(rootDir, 'data', 'metadata-cache.json'),
    ]);
    expect(report.remainingEligibleRecords).toBe(2);
    expect(report.unresolvedLookupRecords).toEqual([]);
    expect(Object.keys(cache)).toEqual(['mock:two']);
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
    expect(report.remainingEligibleRecords).toBe(0);
    expect(report.unresolvedLookupRecords).toEqual([]);
    expect(after).toEqual(before);
  });

  it('parses shared request-control options for write mode', () => {
    expect(
      parseMetadataHydrationCli([
        'node',
        'scripts/hydrate-metadata.js',
        'write',
        '--provider',
        'mock',
        '--limit',
        '5',
        '--delay-ms',
        '10',
        '--timeout-ms=25',
        '--retry-limit',
        '2',
      ]),
    ).toMatchObject({
      command: 'write',
      providerId: 'mock',
      limit: 5,
      delayMs: 10,
      timeoutMs: 25,
      retryLimit: 2,
    });
  });

  it('applies configured delay behavior between provider requests', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider([
      'mock:one',
      'mock:two',
    ]);
    await writeEvents(rootDir, [
      catalogAdd('mock:one'),
      catalogAdd('mock:two'),
    ]);
    await writeMetadata(rootDir, {});

    const startedAt = Date.now();
    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 2,
      delayMs: 20,
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const elapsedMs = Date.now() - startedAt;

    expect(provider.calls).toEqual(['mock:one', 'mock:two']);
    expect(report.requestsAttempted).toBe(2);
    expect(elapsedMs).toBeGreaterThanOrEqual(15);
  });

  it('applies provider timeout behavior using mock artificial delay', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider(['mock:slow'], {
      delayMs: 25,
    });
    await writeEvents(rootDir, [catalogAdd('mock:slow')]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      timeoutMs: 1,
    });
    const cache = await readMetadata(rootDir);

    expect(provider.calls).toEqual(['mock:slow']);
    expect(provider.lookupOptions).toEqual([
      {
        canonicalId: 'mock:slow',
        timeoutMs: 1,
      },
    ]);
    expect(report.requestsAttempted).toBe(1);
    expect(report.unresolvedLookupRecords).toEqual([
      {
        canonicalId: 'mock:slow',
        provider: 'mock',
        status: metadataLookupResultCategories.timedOut,
      },
    ]);
    expect(cache).toEqual({});
  });

  it('enforces retry cap behavior using mock retryable failure', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider({
      'mock:retryable-failure': {
        status: metadataLookupResultCategories.retryableFailure,
        error: {
          source: 'transport',
          message: 'retry later',
          statusCode: 503,
        },
      },
    });
    await writeEvents(rootDir, [catalogAdd('mock:retryable-failure')]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 5,
      retryLimit: 2,
    });

    expect(provider.calls).toEqual([
      'mock:retryable-failure',
      'mock:retryable-failure',
      'mock:retryable-failure',
    ]);
    expect(report.requestsAttempted).toBe(3);
    expect(report.lookupResults).toEqual([
      {
        canonicalId: 'mock:retryable-failure',
        provider: 'mock',
        status: metadataLookupResultCategories.retryableFailure,
      },
      {
        canonicalId: 'mock:retryable-failure',
        provider: 'mock',
        status: metadataLookupResultCategories.retryableFailure,
      },
      {
        canonicalId: 'mock:retryable-failure',
        provider: 'mock',
        status: metadataLookupResultCategories.retryableFailure,
      },
    ]);
    expect(report.unresolvedLookupRecords).toEqual([
      {
        canonicalId: 'mock:retryable-failure',
        provider: 'mock',
        status: metadataLookupResultCategories.retryableFailure,
      },
    ]);
  });

  it('counts retry attempts against the same per-run request cap', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider({
      'mock:retryable-failure': {
        status: metadataLookupResultCategories.retryableFailure,
        error: {
          source: 'transport',
          message: 'retry later',
          statusCode: 503,
        },
      },
    });
    await writeEvents(rootDir, [catalogAdd('mock:retryable-failure')]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 2,
      retryLimit: 5,
    });

    expect(provider.calls).toEqual([
      'mock:retryable-failure',
      'mock:retryable-failure',
    ]);
    expect(report.requestsAttempted).toBe(2);
    expect(report.lookupResults).toHaveLength(2);
    expect(report.remainingEligibleRecords).toBe(0);
    expect(report.unresolvedLookupRecords).toEqual([
      {
        canonicalId: 'mock:retryable-failure',
        provider: 'mock',
        status: metadataLookupResultCategories.retryableFailure,
      },
    ]);
  });

  it('stops the run on rate-limit results without treating later titles as failures', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider({
      'mock:rate-limited': {
        status: metadataLookupResultCategories.rateLimited,
        error: {
          source: 'transport',
          message: 'rate limited',
          statusCode: 429,
          retryAfterSeconds: 60,
        },
      },
      'mock:later': foundFixture('mock:later'),
    });
    await writeEvents(rootDir, [
      catalogAdd('mock:rate-limited'),
      catalogAdd('mock:later'),
    ]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
      limit: 10,
    });
    const cache = await readMetadata(rootDir);

    expect(provider.calls).toEqual(['mock:rate-limited']);
    expect(report.requestsAttempted).toBe(1);
    expect(report.remainingEligibleRecords).toBe(1);
    expect(report.unresolvedLookupRecords).toEqual([
      {
        canonicalId: 'mock:rate-limited',
        provider: 'mock',
        status: metadataLookupResultCategories.rateLimited,
      },
    ]);
    expect(cache).toEqual({});
  });

  it('preserves existing valid metadata when a retryable failure fixture exists', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider({
      'mock:retryable-failure': {
        status: metadataLookupResultCategories.retryableFailure,
        error: {
          source: 'transport',
          message: 'retry later',
          statusCode: 503,
        },
      },
    });
    const existing = validMetadata('mock:retryable-failure');
    await writeEvents(rootDir, [catalogAdd('mock:retryable-failure')]);
    await writeMetadata(rootDir, {
      'mock:retryable-failure': existing,
    });
    const before = await readProjectFiles(rootDir);

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
    });
    const after = await readProjectFiles(rootDir);

    expect(provider.calls).toEqual([]);
    expect(report.existingValidMetadataRecords).toEqual([
      'mock:retryable-failure',
    ]);
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(after).toEqual(before);
  });

  it('preserves existing valid metadata when a rate-limit fixture exists', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider({
      'mock:rate-limited': {
        status: metadataLookupResultCategories.rateLimited,
        error: {
          source: 'transport',
          message: 'rate limited',
          statusCode: 429,
          retryAfterSeconds: 60,
        },
      },
    });
    const existing = validMetadata('mock:rate-limited');
    await writeEvents(rootDir, [catalogAdd('mock:rate-limited')]);
    await writeMetadata(rootDir, {
      'mock:rate-limited': existing,
    });
    const before = await readProjectFiles(rootDir);

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
    });
    const after = await readProjectFiles(rootDir);

    expect(provider.calls).toEqual([]);
    expect(report.existingValidMetadataRecords).toEqual([
      'mock:rate-limited',
    ]);
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(after).toEqual(before);
  });

  it('reports not-found results without creating cache placeholders', async () => {
    const rootDir = await createTempProject();
    const provider = createTrackingMockProvider({
      'mock:not-found': {
        status: metadataLookupResultCategories.notFound,
        error: {
          source: 'provider',
          message: 'not found',
        },
      },
    });
    await writeEvents(rootDir, [catalogAdd('mock:not-found')]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'mock',
    });
    const cache = await readMetadata(rootDir);

    expect(provider.calls).toEqual(['mock:not-found']);
    expect(report.lookupResults).toEqual([
      {
        canonicalId: 'mock:not-found',
        provider: 'mock',
        status: metadataLookupResultCategories.notFound,
      },
    ]);
    expect(report.metadataRecordWriteCandidates).toEqual([]);
    expect(report.metadataRecordsWritten).toEqual([]);
    expect(report.filesWritten).toEqual([]);
    expect(report.remainingEligibleRecords).toBe(0);
    expect(report.unresolvedLookupRecords).toEqual([
      {
        canonicalId: 'mock:not-found',
        provider: 'mock',
        status: metadataLookupResultCategories.notFound,
      },
    ]);
    expect(cache).toEqual({});
  });

  it('writes validated OMDb metadata only when OMDb is explicitly selected', async () => {
    const rootDir = await createTempProject();
    const fetchCalls = [];
    const provider = createOmdbProvider({
      apiKeyProvider: () => 'test-key',
      fetchImpl: async (url) => {
        fetchCalls.push(url);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              Title: 'Braveheart',
              Genre: 'Biography, Drama, War',
              Type: 'movie',
              Plot: 'Scottish warrior William Wallace leads.',
              imdbID: 'tt0112573',
              Response: 'True',
            };
          },
        };
      },
    });
    await writeEvents(rootDir, [catalogAdd('imdb:tt0112573')]);
    await writeMetadata(rootDir, {});

    const report = await executeMetadataHydrationWrite({
      rootDir,
      providers: [provider],
      providerId: 'omdb',
      limit: 1,
      now: () => new Date('2026-05-30T12:00:00.000Z'),
    });
    const cache = await readMetadata(rootDir);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].protocol).toBe('https:');
    expect(fetchCalls[0].hostname).toBe('www.omdbapi.com');
    expect(fetchCalls[0].searchParams.get('i')).toBe('tt0112573');
    expect(fetchCalls[0].searchParams.has('apikey')).toBe(true);
    expect(report.requestsAttempted).toBe(1);
    expect(report.metadataRecordsWritten).toEqual(['imdb:tt0112573']);
    expect(cache['imdb:tt0112573']).toMatchObject({
      canonicalId: 'imdb:tt0112573',
      provider: 'omdb',
      isValid: true,
      provenance: {
        source: 'provider-lookup',
        provider: 'omdb',
        lookupKey: 'tt0112573',
      },
      metadata: {
        mediaType: 'movie',
        title: 'Braveheart',
        genres: ['Biography', 'Drama', 'War'],
        omdb: {
          imdbID: 'tt0112573',
          Response: 'True',
        },
      },
    });
  });

  it('formats reviewable write-mode summary counts', () => {
    const report = {
      mode: 'write',
      provider: 'mock',
      requestedLimit: 10,
      effectiveLimit: 10,
      targetedCanonicalId: null,
      dryRun: false,
      totalCatalogEvents: 7,
      uniqueCanonicalCatalogIds: 7,
      duplicateEventCount: 0,
      duplicateCatalogIds: [],
      existingValidMetadataRecords: [],
      missingMetadataRecords: [
        'mock:found',
        'mock:not-found',
        'mock:invalid',
        'mock:retryable',
        'mock:permanent',
        'mock:timeout',
        'mock:rate-limited',
      ],
      skippedRecords: [
        {
          canonicalId: 'mock:skip',
          metadataLookup: 'skip',
        },
      ],
      invalidCacheRecords: [],
      eligibleLookups: [],
      ineligibleLookups: [],
      metadataCacheMissing: false,
      requestsAttempted: 7,
      lookupResults: [
        {
          canonicalId: 'mock:found',
          provider: 'mock',
          status: metadataLookupResultCategories.found,
        },
        {
          canonicalId: 'mock:not-found',
          provider: 'mock',
          status: metadataLookupResultCategories.notFound,
        },
        {
          canonicalId: 'mock:invalid',
          provider: 'mock',
          status: metadataLookupResultCategories.invalidResponse,
        },
        {
          canonicalId: 'mock:retryable',
          provider: 'mock',
          status: metadataLookupResultCategories.retryableFailure,
        },
        {
          canonicalId: 'mock:permanent',
          provider: 'mock',
          status: metadataLookupResultCategories.permanentFailure,
        },
        {
          canonicalId: 'mock:timeout',
          provider: 'mock',
          status: metadataLookupResultCategories.timedOut,
        },
        {
          canonicalId: 'mock:rate-limited',
          provider: 'mock',
          status: metadataLookupResultCategories.rateLimited,
        },
      ],
      metadataRecordWriteCandidates: ['mock:found'],
      metadataRecordsWritten: ['mock:found'],
      remainingEligibleRecords: 3,
      unresolvedLookupRecords: [],
      filesWritten: ['data/metadata-cache.json'],
      fatalErrors: [],
    };

    const formatted = formatMetadataHydrationPlanReport(report);

    expect(formatted).toContain('- provider: mock');
    expect(formatted).toContain('- requested limit: 10');
    expect(formatted).toContain('- effective limit: 10');
    expect(formatted).toContain('- requests attempted: 7');
    expect(formatted).toContain('- successful writes: 1');
    expect(formatted).toContain('- not-found count: 1');
    expect(formatted).toContain('- invalid response count: 1');
    expect(formatted).toContain('- retryable failure count: 1');
    expect(formatted).toContain('- permanent failure count: 1');
    expect(formatted).toContain('- timeout count: 1');
    expect(formatted).toContain('- rate-limit count: 1');
    expect(formatted).toContain('- skipped count: 1');
    expect(formatted).toContain('- remaining eligible records: 3');
    expect(formatted).toContain('- cache records written: 1');
    expect(formatted).toContain('- another run safe: no');
  });
});
