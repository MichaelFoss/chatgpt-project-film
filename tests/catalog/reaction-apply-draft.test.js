import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyReactionDraft,
  createReactionDraftEvents,
  parseReactionApplyDraftCliArgs,
  reactionApplyDraftUsage,
  validateReactionDraft,
} from '../../scripts/reaction-apply-draft.js';

const tempDirs = [];

async function createTempProject({ catalog = testCatalog() } = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-apply-draft-'),
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
    '{}\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'data', 'title-ignored.json'),
    '{}\n',
    'utf8',
  );
  await fs.writeFile(eventsPath(rootDir), '', 'utf8');
  return rootDir;
}

function testCatalog() {
  return {
    'imdb:tt001': {
      canonicalId: 'imdb:tt001',
      mediaType: 'movie',
      title: 'Alpha',
      releaseYear: 2001,
      genres: ['Action'],
    },
    'imdb:tt002': {
      canonicalId: 'imdb:tt002',
      mediaType: 'movie',
      title: 'Beta',
      releaseYear: 2002,
      genres: ['Drama'],
    },
  };
}

function draft(overrides = {}) {
  return {
    generatedAt: '2026-06-18T12:00:00.000Z',
    titleCount: 2,
    reactions: [
      {
        titleId: 'imdb:tt001',
        rating: 9,
        reasons: ['sci-fi', 'action'],
      },
    ],
    ...overrides,
  };
}

function eventsPath(rootDir) {
  return path.join(rootDir, 'events', 'title-reactions.events.ndjson');
}

function reactionsPath(rootDir) {
  return path.join(rootDir, 'data', 'title-reactions.json');
}

async function writeDraft(rootDir, value, filename = 'draft.json') {
  const draftPath = path.join(rootDir, filename);
  await fs.writeFile(
    draftPath,
    typeof value === 'string' ? value : `${JSON.stringify(value)}\n`,
    'utf8',
  );
  return draftPath;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
  vi.restoreAllMocks();
});

describe('reaction draft import', () => {
  it('parses exactly one draft file argument', () => {
    expect(parseReactionApplyDraftCliArgs(['draft.json'])).toEqual({
      draftPath: 'draft.json',
    });
    expect(() => parseReactionApplyDraftCliArgs([])).toThrow(
      reactionApplyDraftUsage,
    );
    expect(() =>
      parseReactionApplyDraftCliArgs(['draft.json', 'extra.json']),
    ).toThrow(reactionApplyDraftUsage);
  });

  it('imports a valid draft through events and rebuilds projections', async () => {
    const rootDir = await createTempProject();
    const draftPath = await writeDraft(rootDir, {
      ...draft(),
      reactions: [
        {
          titleId: 'tt001',
          rating: 9,
          notes: ' Test notes. ',
          reasons: ['sci-fi', 'action'],
        },
        { titleId: 'imdb:tt002', rating: 7, reasons: [] },
      ],
    });
    const output = [];

    const report = await applyReactionDraft({
      rootDir,
      draftPath,
      eventIdFactory: vi
        .fn()
        .mockReturnValueOnce('event-1')
        .mockReturnValueOnce('event-2'),
      occurredAt: '2026-06-19T12:00:00.000Z',
      writeOutput: (message) => output.push(message),
    });

    expect(report.eventsWritten).toBe(2);
    expect(output).toEqual([
      [
        'Imported 2 reaction draft entries.',
        'Wrote 2 title reaction event(s).',
        `Rebuilt ${path.relative(process.cwd(), reactionsPath(rootDir))}.`,
        '',
        'Files changed:',
        '- events/title-reactions.events.ndjson',
        '- data/title-reactions.json',
        '',
        'Next:',
        'git diff events/title-reactions.events.ndjson data/title-reactions.json',
        'git add events/title-reactions.events.ndjson data/title-reactions.json',
        'git commit -m "Add movie reactions"',
      ].join('\n'),
    ]);
    const eventText = await fs.readFile(eventsPath(rootDir), 'utf8');
    expect(eventText.trim().split('\n').map(JSON.parse)).toEqual([
      {
        eventId: 'event-1',
        type: 'title.reaction.updated',
        occurredAt: '2026-06-19T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
        rating: 9,
        notes: 'Test notes.',
        reasons: ['sci-fi', 'action'],
      },
      {
        eventId: 'event-2',
        type: 'title.reaction.updated',
        occurredAt: '2026-06-19T12:00:00.000Z',
        canonicalId: 'imdb:tt002',
        rating: 7,
      },
    ]);
    await expect(
      readJson(reactionsPath(rootDir)),
    ).resolves.toMatchObject({
      'imdb:tt001': {
        rating: 9,
        notes: 'Test notes.',
        reasons: ['sci-fi', 'action'],
      },
      'imdb:tt002': { rating: 7 },
    });
  });

  it('omits empty and whitespace-only draft notes from events', () => {
    const validatedReactions = validateReactionDraft({
      draft: draft({
        reactions: [
          { titleId: 'tt001', rating: 8, notes: '', reasons: [] },
          {
            titleId: 'tt002',
            rating: 7,
            notes: '   ',
            reasons: [],
          },
        ],
      }),
      catalog: testCatalog(),
    });

    expect(
      createReactionDraftEvents({
        validatedReactions,
        eventIdFactory: vi
          .fn()
          .mockReturnValueOnce('event-1')
          .mockReturnValueOnce('event-2'),
        occurredAt: '2026-06-19T12:00:00.000Z',
      }).map((event) => event.notes),
    ).toEqual([undefined, undefined]);
  });

  it('rejects invalid JSON before writing anything', async () => {
    const rootDir = await createTempProject();
    const draftPath = await writeDraft(rootDir, '{"reactions": [');

    await expect(
      applyReactionDraft({ rootDir, draftPath, writeOutput: () => {} }),
    ).rejects.toThrow('Invalid reaction draft JSON');
    await expect(
      fs.readFile(eventsPath(rootDir), 'utf8'),
    ).resolves.toBe('');
    await expect(readJson(reactionsPath(rootDir))).resolves.toEqual({});
  });

  it('rejects invalid draft shape', () => {
    expect(() =>
      validateReactionDraft({ draft: [], catalog: testCatalog() }),
    ).toThrow('Reaction draft must be a JSON object.');
    expect(() =>
      validateReactionDraft({
        draft: { generatedAt: 'now', titleCount: 1, reactions: {} },
        catalog: testCatalog(),
      }),
    ).toThrow('Reaction draft reactions must be an array.');
  });

  it('rejects unknown title IDs', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [{ titleId: 'tt999', rating: 8, reasons: [] }],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow('titleId does not exist in data/catalog.json: tt999');
  });

  it('rejects duplicate title IDs after canonical normalization', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [
            { titleId: 'tt001', rating: 8, reasons: [] },
            { titleId: 'imdb:tt001', rating: 9, reasons: [] },
          ],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow('Duplicate titleId found in reaction draft: imdb:tt001');
  });

  it('rejects missing title IDs', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [{ rating: 8, reasons: [] }],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow('reaction 1 titleId is required.');
  });

  it('rejects missing ratings and keeps reasons-only entries invalid', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [{ titleId: 'tt001', reasons: ['slow'] }],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow('reaction 1 rating is required.');
  });

  it('rejects ratings outside range', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [{ titleId: 'tt001', rating: 11, reasons: [] }],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow(
      'reaction 1 rating must be an integer from 1 through 10.',
    );
  });

  it('rejects non-integer ratings', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [{ titleId: 'tt001', rating: 7.5, reasons: [] }],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow(
      'reaction 1 rating must be an integer from 1 through 10.',
    );
  });

  it('rejects invalid reasons', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [
            { titleId: 'tt001', rating: 8, reasons: ['Sci-Fi'] },
          ],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow(
      'reaction 1 reasons must be a normalized array of non-empty lowercase strings without duplicates.',
    );
  });

  it('rejects invalid notes values', () => {
    expect(() =>
      validateReactionDraft({
        draft: draft({
          reactions: [
            { titleId: 'tt001', rating: 8, notes: ['not valid'] },
          ],
        }),
        catalog: testCatalog(),
      }),
    ).toThrow('reaction 1 notes must be a string.');
  });

  it('is all-or-nothing when any draft entry fails validation', async () => {
    const rootDir = await createTempProject();
    const draftPath = await writeDraft(rootDir, {
      ...draft(),
      reactions: [
        { titleId: 'tt001', rating: 8, reasons: [] },
        { titleId: 'tt999', rating: 9, reasons: [] },
      ],
    });
    const appendEvents = vi.fn();
    const rebuildProjections = vi.fn();

    await expect(
      applyReactionDraft({
        rootDir,
        draftPath,
        appendEvents,
        rebuildProjections,
        writeOutput: () => {},
      }),
    ).rejects.toThrow('titleId does not exist');
    expect(appendEvents).not.toHaveBeenCalled();
    expect(rebuildProjections).not.toHaveBeenCalled();
    await expect(
      fs.readFile(eventsPath(rootDir), 'utf8'),
    ).resolves.toBe('');
    await expect(readJson(reactionsPath(rootDir))).resolves.toEqual({});
  });

  it('is all-or-nothing when any draft note fails validation', async () => {
    const rootDir = await createTempProject();
    const draftPath = await writeDraft(rootDir, {
      ...draft(),
      reactions: [
        { titleId: 'tt001', rating: 8, notes: 'valid' },
        { titleId: 'tt002', rating: 9, notes: 123 },
      ],
    });
    const appendEvents = vi.fn();
    const rebuildProjections = vi.fn();

    await expect(
      applyReactionDraft({
        rootDir,
        draftPath,
        appendEvents,
        rebuildProjections,
        writeOutput: () => {},
      }),
    ).rejects.toThrow('reaction 2 notes must be a string.');
    expect(appendEvents).not.toHaveBeenCalled();
    expect(rebuildProjections).not.toHaveBeenCalled();
    await expect(
      fs.readFile(eventsPath(rootDir), 'utf8'),
    ).resolves.toBe('');
    await expect(readJson(reactionsPath(rootDir))).resolves.toEqual({});
  });

  it('invokes projection rebuild after a successful import', async () => {
    const rootDir = await createTempProject();
    const draftPath = await writeDraft(rootDir, draft());
    const appendEvents = vi.fn().mockResolvedValue({
      eventsAppended: 1,
      outputPathWritten: eventsPath(rootDir),
    });
    const rebuildProjections = vi.fn().mockResolvedValue({
      outputPathWritten: reactionsPath(rootDir),
    });

    await applyReactionDraft({
      rootDir,
      draftPath,
      appendEvents,
      rebuildProjections,
      eventIdFactory: () => 'event-1',
      occurredAt: '2026-06-19T12:00:00.000Z',
      writeOutput: () => {},
    });

    expect(appendEvents).toHaveBeenCalledOnce();
    expect(rebuildProjections).toHaveBeenCalledWith({ rootDir });
  });
});
