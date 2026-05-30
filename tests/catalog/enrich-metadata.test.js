import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { planMetadataEnrichment } from '../../scripts/enrich-metadata.js';
import {
  metadataProviders,
  notImplementedProvider,
} from '../../scripts/lib/metadata-providers/index.js';

const tempDirs = [];

const fakeProvider = {
  id: 'fake',

  supports(canonicalId) {
    return canonicalId.startsWith('imdb:');
  },

  async lookup() {
    throw new Error('fake provider lookup should not run in dry-run');
  },

  toMetadataRecord() {
    throw new Error('fake provider mapping should not run in dry-run');
  },
};

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
  it('plans missing metadata for lookup', async () => {
    const rootDir = await createTempProject();
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
  });

  it('skips valid metadata as already valid', async () => {
    const rootDir = await createTempProject();
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

  it('reports missing metadata without planning when no provider supports the ID', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    await writeMetadata(rootDir, {});

    const report = await planMetadataEnrichment({
      rootDir,
      providers: metadataProviders,
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
