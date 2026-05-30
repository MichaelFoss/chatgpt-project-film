import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCatalogAddCliArgs } from '../../scripts/catalog-add.js';
import { parseCatalogImportCliArgs } from '../../scripts/catalog-import.js';
import {
  formatCatalogImportReport,
  importCatalogFile,
  importCatalogItems,
} from '../../scripts/lib/catalog-importer.js';

const tempDirs = [];
const fixedNow = '2026-05-30T12:00:00.000Z';

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-import-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await writeRawEvents(rootDir, '');
  await fs.writeFile(
    path.join(rootDir, 'data', 'metadata-cache.json'),
    '{"unchanged":true}\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    '{"unchanged":true}\n',
    'utf8',
  );
  return rootDir;
}

async function writeRawEvents(rootDir, text) {
  await fs.writeFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    text,
    'utf8',
  );
}

async function writeEvents(rootDir, events) {
  const lines = events.map((event) => JSON.stringify(event)).join('\n');
  await writeRawEvents(rootDir, lines.length > 0 ? `${lines}\n` : '');
}

async function writeImportFile(rootDir, items) {
  const inputPath = path.join(rootDir, 'catalog-import.json');
  await fs.writeFile(inputPath, `${JSON.stringify(items, null, 2)}\n`);
  return inputPath;
}

async function readEvents(rootDir) {
  const text = await fs.readFile(
    path.join(rootDir, 'events', 'catalog.events.ndjson'),
    'utf8',
  );

  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readDataFiles(rootDir) {
  return {
    metadataCache: await fs.readFile(
      path.join(rootDir, 'data', 'metadata-cache.json'),
      'utf8',
    ),
    catalog: await fs.readFile(
      path.join(rootDir, 'data', 'catalog.json'),
      'utf8',
    ),
  };
}

function catalogAdd(overrides = {}) {
  return {
    eventType: 'catalog.add',
    occurredAt: '2026-05-29T00:00:00.000Z',
    source: 'manual',
    canonicalId: 'imdb:tt0112573',
    metadataLookup: 'auto',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('catalog import', () => {
  it('catalog:import --plan writes nothing', async () => {
    const rootDir = await createTempProject();
    const inputPath = await writeImportFile(rootDir, [
      { canonicalId: 'imdb:tt0133093', source: 'manual' },
    ]);
    const before = await fs.readFile(
      path.join(rootDir, 'events', 'catalog.events.ndjson'),
      'utf8',
    );

    const report = await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'plan',
      now: fixedNow,
    });

    const after = await fs.readFile(
      path.join(rootDir, 'events', 'catalog.events.ndjson'),
      'utf8',
    );
    expect(after).toBe(before);
    expect(report.eventsPlanned).toBe(1);
    expect(report.eventsAppended).toBe(0);
    expect(report.outputPathWritten).toBeNull();
  });

  it('catalog:import --write appends valid new events', async () => {
    const rootDir = await createTempProject();
    const inputPath = await writeImportFile(rootDir, [
      { canonicalId: 'imdb:tt0133093', source: 'manual' },
      {
        canonicalId: 'imdb:tt0111161',
        source: 'manual',
        occurredAt: '2026-05-30',
      },
    ]);

    const report = await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'write',
      now: fixedNow,
    });

    expect(report.eventsPlanned).toBe(2);
    expect(report.eventsAppended).toBe(2);
    expect(report.outputPathWritten).toBe(
      path.join(rootDir, 'events', 'catalog.events.ndjson'),
    );
    expect(await readEvents(rootDir)).toEqual([
      {
        eventType: 'catalog.add',
        occurredAt: fixedNow,
        source: 'manual',
        canonicalId: 'imdb:tt0133093',
        metadataLookup: 'auto',
      },
      {
        eventType: 'catalog.add',
        occurredAt: '2026-05-30',
        source: 'manual',
        canonicalId: 'imdb:tt0111161',
        metadataLookup: 'auto',
      },
    ]);
  });

  it('existing catalog IDs are skipped', async () => {
    const rootDir = await createTempProject();
    await writeEvents(rootDir, [catalogAdd()]);
    const inputPath = await writeImportFile(rootDir, [
      { canonicalId: 'imdb:tt0112573', source: 'manual' },
      { canonicalId: 'imdb:tt0133093', source: 'manual' },
    ]);

    const report = await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'write',
      now: fixedNow,
    });

    expect(report.alreadyExistingCatalogItemsSkipped).toBe(1);
    expect(report.alreadyExistingCatalogItems).toEqual([
      { index: 1, canonicalId: 'imdb:tt0112573' },
    ]);
    expect(report.eventsAppended).toBe(1);
    expect(
      (await readEvents(rootDir)).map((event) => event.canonicalId),
    ).toEqual(['imdb:tt0112573', 'imdb:tt0133093']);
  });

  it('duplicate IDs within the import file are skipped', async () => {
    const rootDir = await createTempProject();
    const inputPath = await writeImportFile(rootDir, [
      { canonicalId: 'imdb:tt0133093', source: 'manual' },
      { canonicalId: 'imdb:tt0133093', source: 'manual' },
    ]);

    const report = await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'write',
      now: fixedNow,
    });

    expect(report.duplicateInputItemsSkipped).toBe(1);
    expect(report.duplicateInputItems).toEqual([
      { index: 2, canonicalId: 'imdb:tt0133093' },
    ]);
    expect(report.eventsAppended).toBe(1);
    expect(await readEvents(rootDir)).toHaveLength(1);
  });

  it('invalid rows are reported and not appended', async () => {
    const rootDir = await createTempProject();
    const inputPath = await writeImportFile(rootDir, [
      { canonicalId: '', source: 'manual' },
      { canonicalId: 'imdb:tt0133093', source: 'netflix' },
      {
        canonicalId: 'imdb:tt0111161',
        source: 'manual',
        title: 'The Shawshank Redemption',
      },
      { canonicalId: 'imdb:tt0068646', source: 'manual' },
    ]);

    const report = await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'write',
      now: fixedNow,
    });

    expect(report.invalidInputItems).toBe(3);
    expect(report.invalidItems).toEqual([
      { index: 1, reason: 'canonicalId must be a non-empty string.' },
      { index: 2, reason: 'source must be "manual" or "plex".' },
      { index: 3, reason: 'unsupported field: title' },
    ]);
    expect(report.eventsAppended).toBe(1);
    expect(
      (await readEvents(rootDir)).map((event) => event.canonicalId),
    ).toEqual(['imdb:tt0068646']);
  });

  it('metadataLookup skip is preserved', async () => {
    const rootDir = await createTempProject();
    const inputPath = await writeImportFile(rootDir, [
      {
        canonicalId: 'manual:festival-short-2024',
        source: 'manual',
        metadataLookup: 'skip',
      },
    ]);

    await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'write',
      now: fixedNow,
    });

    expect(await readEvents(rootDir)).toEqual([
      {
        eventType: 'catalog.add',
        occurredAt: fixedNow,
        source: 'manual',
        canonicalId: 'manual:festival-short-2024',
        metadataLookup: 'skip',
      },
    ]);
  });

  it('catalog:add --write appends one event through the same core path', async () => {
    const rootDir = await createTempProject();
    const { item, mode } = parseCatalogAddCliArgs([
      'imdb:tt0133093',
      '--source',
      'manual',
      '--write',
    ]);

    const report = await importCatalogItems({
      rootDir,
      items: [item],
      mode,
      now: fixedNow,
    });

    expect(report.eventsAppended).toBe(1);
    expect(await readEvents(rootDir)).toEqual([
      {
        eventType: 'catalog.add',
        occurredAt: fixedNow,
        source: 'manual',
        canonicalId: 'imdb:tt0133093',
        metadataLookup: 'auto',
      },
    ]);
  });

  it('missing --plan/--write is fatal', () => {
    expect(() =>
      parseCatalogImportCliArgs(['catalog-import.json']),
    ).toThrow(
      'Catalog import requires exactly one of --plan or --write.',
    );
    expect(() =>
      parseCatalogAddCliArgs(['imdb:tt0133093', '--source', 'manual']),
    ).toThrow(
      'Catalog import requires exactly one of --plan or --write.',
    );
    expect(() =>
      parseCatalogImportCliArgs([
        'catalog-import.json',
        '--plan',
        '--write',
      ]),
    ).toThrow(
      'Catalog import requires exactly one of --plan or --write.',
    );
    expect(() =>
      parseCatalogImportCliArgs([
        'catalog-import.json',
        '--plan',
        '--x',
      ]),
    ).toThrow('Unknown flag: --x');
    expect(() =>
      parseCatalogAddCliArgs(['imdb:tt0133093', '--source', '--plan']),
    ).toThrow('Usage: yarn catalog:add');
  });

  it('does not touch metadata cache or generated catalog files', async () => {
    const rootDir = await createTempProject();
    const before = await readDataFiles(rootDir);
    const inputPath = await writeImportFile(rootDir, [
      { canonicalId: 'imdb:tt0133093', source: 'manual' },
    ]);

    await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'write',
      now: fixedNow,
    });

    expect(await readDataFiles(rootDir)).toEqual(before);
  });

  it('formats stable report counts and IDs', async () => {
    const rootDir = await createTempProject();
    const inputPath = await writeImportFile(rootDir, [
      { canonicalId: 'imdb:tt0133093', source: 'manual' },
    ]);

    const report = await importCatalogFile({
      rootDir,
      inputPath,
      mode: 'plan',
      now: fixedNow,
    });

    expect(formatCatalogImportReport(report)).toContain(
      [
        'Catalog import report',
        '- input items read: 1',
        '- valid input items: 1',
        '- invalid input items: 0',
        '- duplicate input items skipped: 0',
        '- already-existing catalog items skipped: 0',
        '- events planned: 1',
        '- events appended: 0',
        '  - imdb:tt0133093',
        '- fatal errors: 0',
        '- output path written: none',
      ].join('\n'),
    );
  });
});
