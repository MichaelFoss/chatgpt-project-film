import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatReactionValidationReport,
  validateReactionProjection,
  validateReactionProjectionFromFiles,
} from '../../scripts/reaction-validate.js';

const execFileAsync = promisify(execFile);
const tempDirs = [];
const repositoryRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const catalog = {
  'imdb:tt001': {
    canonicalId: 'imdb:tt001',
    mediaType: 'movie',
    title: 'Alpha',
  },
  'imdb:tt002': {
    canonicalId: 'imdb:tt002',
    mediaType: 'series',
    title: 'Beta',
  },
  'imdb:tt003': {
    canonicalId: 'imdb:tt003',
    mediaType: 'movie',
    title: 'Gamma',
  },
};

function reaction(canonicalId, rating) {
  return {
    canonicalId,
    updatedAt: '2026-06-10T12:00:00.000Z',
    eventIds: [`event-${canonicalId}`],
    rating,
  };
}

async function createTempProject({
  reactions = {},
  eventStreamText = '{"malformed": true\n',
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-validation-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'title-reactions.json'),
    `${JSON.stringify(reactions, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
    eventStreamText,
    'utf8',
  );
  return rootDir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('reaction validation command', () => {
  it('reports a completely valid projection', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 1),
        'imdb:tt002': reaction('imdb:tt002', 7),
        'imdb:tt003': reaction('imdb:tt003', 10),
      },
    });

    expect(report).toEqual({
      totalRecords: 3,
      validRecords: 3,
      invalidRecords: 0,
      problems: {
        missingCatalogReferences: [],
        missingCanonicalIds: [],
        missingRatings: [],
        invalidRatings: [],
        invalidNotes: [],
        invalidReasons: [],
        duplicateReactionEntries: [],
      },
    });
    expect(formatReactionValidationReport(report)).toBe(
      [
        'Reaction validation',
        '',
        'Summary:',
        '- Total reaction records inspected: 3',
        '- Valid reaction records: 3',
        '- Invalid reaction records: 0',
        '',
        'Problems:',
        '- none',
      ].join('\n'),
    );
  });

  it('reports missing catalog references', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
        'imdb:tt999': reaction('imdb:tt999', 8),
      },
    });

    expect(report.validRecords).toBe(1);
    expect(report.invalidRecords).toBe(1);
    expect(report.problems.missingCatalogReferences).toEqual([
      { key: 'imdb:tt999', canonicalId: 'imdb:tt999' },
    ]);
  });

  it('accepts all integer ratings from 1 through 10', () => {
    const reactions = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => {
        const rating = index + 1;
        return [`entry-${rating}`, reaction('imdb:tt001', rating)];
      }),
    );

    const report = validateReactionProjection({ catalog, reactions });

    expect(report.problems.invalidRatings).toEqual([]);
  });

  it('reports invalid ratings without duplicating rating definitions', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 0),
        'imdb:tt002': reaction('imdb:tt002', 11),
        'imdb:tt003': reaction('imdb:tt003', 'liked'),
      },
    });

    expect(report.validRecords).toBe(0);
    expect(report.invalidRecords).toBe(3);
    expect(report.problems.invalidRatings).toEqual([
      { key: 'imdb:tt001', rating: 0 },
      { key: 'imdb:tt002', rating: 11 },
      { key: 'imdb:tt003', rating: 'liked' },
    ]);
  });

  it('reports invalid notes types', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        'imdb:tt001': {
          ...reaction('imdb:tt001', 8),
          notes: ['not valid'],
        },
      },
    });

    expect(report.validRecords).toBe(0);
    expect(report.invalidRecords).toBe(1);
    expect(report.problems.invalidNotes).toEqual([
      { key: 'imdb:tt001', notes: ['not valid'] },
    ]);
    expect(formatReactionValidationReport(report)).toContain(
      'Invalid notes:\n- key: imdb:tt001; notes: ["not valid"]',
    );
  });

  it('accepts casing differences in projected reasons', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        'imdb:tt001': {
          ...reaction('imdb:tt001', 8),
          reasons: ['MCU', 'mcu', 'CGI', 'Hans Zimmer'],
        },
      },
    });

    expect(report.validRecords).toBe(1);
    expect(report.invalidRecords).toBe(0);
    expect(report.problems.invalidReasons).toEqual([]);
  });

  it('reports invalid reasons values', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        'imdb:tt001': {
          ...reaction('imdb:tt001', 8),
          reasons: 'great atmosphere',
        },
        'imdb:tt002': {
          ...reaction('imdb:tt002', 8),
          reasons: ['great atmosphere', ''],
        },
        'imdb:tt003': {
          ...reaction('imdb:tt003', 8),
          reasons: ['Great Atmosphere', 'soundtrack', 'soundtrack'],
        },
      },
    });

    expect(report.validRecords).toBe(0);
    expect(report.invalidRecords).toBe(3);
    expect(report.problems.invalidReasons).toEqual([
      { key: 'imdb:tt001', reasons: 'great atmosphere' },
      { key: 'imdb:tt002', reasons: ['great atmosphere', ''] },
      {
        key: 'imdb:tt003',
        reasons: ['Great Atmosphere', 'soundtrack', 'soundtrack'],
      },
    ]);
    expect(formatReactionValidationReport(report)).toContain(
      [
        'Invalid reasons:',
        '- key: imdb:tt001; reasons: great atmosphere',
        '- key: imdb:tt002; reasons: ["great atmosphere",""]',
      ].join('\n'),
    );
  });

  it('reports missing required fields', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        'imdb:tt001': {
          canonicalId: 'imdb:tt001',
        },
        'imdb:tt002': {
          rating: 8,
        },
        'imdb:tt003': null,
      },
    });

    expect(report.totalRecords).toBe(3);
    expect(report.validRecords).toBe(0);
    expect(report.invalidRecords).toBe(3);
    expect(report.problems.missingCanonicalIds).toEqual([
      { key: 'imdb:tt002' },
      { key: 'imdb:tt003' },
    ]);
    expect(report.problems.missingRatings).toEqual([
      { key: 'imdb:tt001' },
      { key: 'imdb:tt003' },
    ]);
  });

  it('formats problems in deterministic output ordering', () => {
    const report = validateReactionProjection({
      catalog,
      reactions: {
        zeta: reaction('imdb:tt999', 0),
        alpha: {
          rating: 8,
        },
        beta: {
          canonicalId: 'imdb:tt001',
        },
        dupeB: reaction('imdb:tt002', 8),
        dupeA: reaction('imdb:tt002', 8),
      },
    });

    expect(formatReactionValidationReport(report)).toBe(
      [
        'Reaction validation',
        '',
        'Summary:',
        '- Total reaction records inspected: 5',
        '- Valid reaction records: 0',
        '- Invalid reaction records: 5',
        '',
        'Problems:',
        'Missing catalog references:',
        '- key: zeta; canonicalId: imdb:tt999',
        'Missing canonical IDs:',
        '- key: alpha',
        'Missing ratings:',
        '- key: beta',
        'Invalid ratings:',
        '- key: zeta; rating: 0',
        'Duplicate reaction entries:',
        '- canonicalId: imdb:tt002; keys: dupeA, dupeB',
      ].join('\n'),
    );
  });

  it('ignores malformed event streams during normal validation', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
      },
      eventStreamText: '{"malformed": true\n',
    });

    await expect(
      validateReactionProjectionFromFiles({ rootDir }),
    ).resolves.toMatchObject({
      totalRecords: 1,
      validRecords: 1,
      invalidRecords: 0,
    });
  });

  it('prints validation output from the thin CLI wrapper', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt001': reaction('imdb:tt001', 10),
      },
    });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(repositoryRootDir, 'scripts', 'reaction-validate.js')],
      { cwd: rootDir },
    );

    expect(stderr).toBe('');
    expect(stdout.trim()).toBe(
      [
        'Reaction validation',
        '',
        'Summary:',
        '- Total reaction records inspected: 1',
        '- Valid reaction records: 1',
        '- Invalid reaction records: 0',
        '',
        'Problems:',
        '- none',
      ].join('\n'),
    );
  });

  it('exits non-zero from the CLI wrapper when invalid records exist', async () => {
    const rootDir = await createTempProject({
      reactions: {
        'imdb:tt999': reaction('imdb:tt999', 10),
      },
    });

    await expect(
      execFileAsync(
        process.execPath,
        [
          path.join(
            repositoryRootDir,
            'scripts',
            'reaction-validate.js',
          ),
        ],
        { cwd: rootDir },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('- Invalid reaction records: 1'),
      stderr: '',
    });
  });
});
