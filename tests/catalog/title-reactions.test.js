import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGeneratedSourceDocuments } from '../../scripts/build-generated-sources.js';
import {
  appendTitleReactionEvents,
  buildTitleReactions,
  projectTitleReactions,
  validateTitleReactionEvents,
} from '../../scripts/lib/title-reactions.js';

const tempDirs = [];

async function createTempProject() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-title-reactions-'),
  );
  tempDirs.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'events'), { recursive: true });
  return rootDir;
}

async function writeCatalog(rootDir, catalog = testCatalog()) {
  await fs.writeFile(
    path.join(rootDir, 'data', 'catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  );
}

async function writeEvents(rootDir, eventsText) {
  await fs.writeFile(
    path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
    eventsText,
    'utf8',
  );
}

function testCatalog() {
  return {
    'imdb:tt001': {
      canonicalId: 'imdb:tt001',
      mediaType: 'movie',
      title: 'Alpha',
      releaseYear: 2001,
      description: 'A plot summary that must not appear.',
      genres: ['Drama'],
    },
    'imdb:tt002': {
      canonicalId: 'imdb:tt002',
      mediaType: 'series',
      title: 'Beta',
      releaseYear: 2002,
      description: 'Another plot summary that must not appear.',
      genres: ['Comedy'],
    },
  };
}

function event(overrides = {}) {
  const value = {
    eventId: 'evt-1',
    type: 'title.reaction.updated',
    occurredAt: '2026-06-10T12:00:00.000Z',
    canonicalId: 'imdb:tt001',
    rating: 8,
    ...overrides,
  };

  for (const [field, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined) {
      delete value[field];
    }
  }

  return value;
}

function validate(events, catalog = testCatalog()) {
  return validateTitleReactionEvents(events, catalog);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
  vi.unstubAllGlobals();
});

describe('title reaction events', () => {
  it('accepts a valid minimal event with only rating', () => {
    expect(validate([event()])).toEqual([
      {
        eventId: 'evt-1',
        type: 'title.reaction.updated',
        occurredAt: '2026-06-10T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
        rating: 8,
      },
    ]);
  });

  it('accepts and trims optional notes on rating events', () => {
    expect(validate([event({ notes: ' Great visuals. ' })])).toEqual([
      {
        eventId: 'evt-1',
        type: 'title.reaction.updated',
        occurredAt: '2026-06-10T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
        rating: 8,
        notes: 'Great visuals.',
      },
    ]);
  });

  it('accepts and normalizes optional reasons on rating events', () => {
    expect(
      validate([
        event({
          reasons: [
            'Great Atmosphere',
            'soundtrack, soundtrack',
            '   ',
            'Strong Emotional Payoff',
          ],
        }),
      ]),
    ).toEqual([
      {
        eventId: 'evt-1',
        type: 'title.reaction.updated',
        occurredAt: '2026-06-10T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
        rating: 8,
        reasons: [
          'great atmosphere',
          'soundtrack',
          'strong emotional payoff',
        ],
      },
    ]);
  });

  it('lowercases a single mixed-case reason', () => {
    expect(
      validate([
        event({
          reasons: ['MCU'],
        }),
      ])[0].reasons,
    ).toEqual(['mcu']);
  });

  it('lowercases multiple mixed-case reasons', () => {
    expect(
      validate([
        event({
          reasons: ['Sci-Fi', 'Action'],
        }),
      ])[0].reasons,
    ).toEqual(['sci-fi', 'action']);
  });

  it('deduplicates reasons after lowercase normalization', () => {
    expect(
      validate([
        event({
          reasons: ['MCU', 'mcu', ' Mcu '],
        }),
      ])[0].reasons,
    ).toEqual(['mcu']);
  });

  it('preserves first-occurrence reason ordering after lowercase normalization', () => {
    expect(
      validate([
        event({
          reasons: ['Sci-Fi', 'Action', 'SCI-FI'],
        }),
      ])[0].reasons,
    ).toEqual(['sci-fi', 'action']);
  });

  it('continues to trim reasons before persistence', () => {
    expect(
      validate([
        event({
          reasons: ['  Michael Bay  ', ' fantastic '],
        }),
      ])[0].reasons,
    ).toEqual(['michael bay', 'fantastic']);
  });

  it('treats empty, whitespace-only, and null notes as absent', () => {
    expect(validate([event({ notes: '' })])).toEqual([event()]);
    expect(validate([event({ notes: '   ' })])).toEqual([event()]);
    expect(validate([event({ notes: null })])).toEqual([event()]);
  });

  it('treats empty reasons as absent', () => {
    expect(validate([event({ reasons: [] })])).toEqual([event()]);
    expect(validate([event({ reasons: [' ', ','] })])).toEqual([
      event(),
    ]);
  });

  it('accepts a valid minimal event with only watchStatus', () => {
    expect(
      validate([
        event({
          rating: undefined,
          watchStatus: 'completed',
        }),
      ]),
    ).toEqual([
      {
        eventId: 'evt-1',
        type: 'title.reaction.updated',
        occurredAt: '2026-06-10T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
        rating: undefined,
        watchStatus: 'completed',
      },
    ]);
  });

  it('rejects missing required fields', () => {
    const badEvent = event();
    delete badEvent.eventId;

    expect(() => validate([badEvent])).toThrow(
      'eventId must be a non-empty string',
    );
  });

  it('rejects unknown canonicalId values', () => {
    expect(() =>
      validate([event({ canonicalId: 'imdb:missing' })]),
    ).toThrow('canonicalId does not exist');
  });

  it('rejects duplicate eventId values', () => {
    expect(() =>
      validate([
        event({ eventId: 'evt-1' }),
        event({ eventId: 'evt-1', canonicalId: 'imdb:tt002' }),
      ]),
    ).toThrow('Duplicate eventId found: evt-1');
  });

  it('rejects invalid enum values', () => {
    expect(() => validate([event({ watchStatus: 'paused' })])).toThrow(
      'watchStatus must be one of',
    );
  });

  it('rejects invalid rating values including decimals, 0, and 11', () => {
    for (const rating of [7.5, 0, 11]) {
      expect(() => validate([event({ rating })])).toThrow(
        'rating must be an integer from 1 through 10',
      );
    }
  });

  it('rejects non-string notes values other than null', () => {
    for (const notes of [1, true, ['great']]) {
      expect(() => validate([event({ notes })])).toThrow(
        'notes must be a string',
      );
    }
  });

  it('rejects non-array and non-string reasons values', () => {
    for (const reasons of ['great', [1], [true]]) {
      expect(() => validate([event({ reasons })])).toThrow(
        'reasons must be an array of strings',
      );
    }
  });

  it('rejects events with no update fields', () => {
    const badEvent = event();
    delete badEvent.rating;

    expect(() => validate([badEvent])).toThrow(
      'must include at least one reaction update field',
    );
  });

  it('rejects unknown fields', () => {
    expect(() => validate([event({ sentiment: 'positive' })])).toThrow(
      'unknown field',
    );
  });

  it('projects merge behavior for multiple events on one title', () => {
    const projection = projectTitleReactions(
      validate([
        event({
          eventId: 'evt-1',
          rating: 7,
          reasonTags: ['space'],
          notes: 'Initial note.',
        }),
        event({
          eventId: 'evt-2',
          rating: undefined,
          watchStatus: 'completed',
          reasonTags: ['rewatchable'],
          notes: 'Updated note.',
        }),
      ]),
    );

    expect(projection['imdb:tt001']).toEqual({
      canonicalId: 'imdb:tt001',
      updatedAt: '2026-06-10T12:00:00.000Z',
      eventIds: ['evt-1', 'evt-2'],
      rating: 7,
      watchStatus: 'completed',
      reasonTags: ['rewatchable'],
      notes: 'Updated note.',
    });
  });

  it('uses replace semantics for notes when a newer rating omits notes', () => {
    const projection = projectTitleReactions(
      validate([
        event({
          eventId: 'evt-1',
          rating: 9,
          notes: 'Great visuals.',
        }),
        event({
          eventId: 'evt-2',
          rating: 7,
        }),
      ]),
    );

    expect(projection['imdb:tt001']).toEqual({
      canonicalId: 'imdb:tt001',
      updatedAt: '2026-06-10T12:00:00.000Z',
      eventIds: ['evt-1', 'evt-2'],
      rating: 7,
    });
  });

  it('uses replace semantics for reasons when a newer rating omits reasons', () => {
    const projection = projectTitleReactions(
      validate([
        event({
          eventId: 'evt-1',
          rating: 9,
          reasons: ['great atmosphere', 'soundtrack'],
        }),
        event({
          eventId: 'evt-2',
          rating: 7,
        }),
      ]),
    );

    expect(projection['imdb:tt001']).toEqual({
      canonicalId: 'imdb:tt001',
      updatedAt: '2026-06-10T12:00:00.000Z',
      eventIds: ['evt-1', 'evt-2'],
      rating: 7,
    });
  });

  it('replaces projected reasons when a newer rating supplies reasons', () => {
    const projection = projectTitleReactions(
      validate([
        event({
          eventId: 'evt-1',
          rating: 9,
          reasons: ['great atmosphere', 'soundtrack'],
        }),
        event({
          eventId: 'evt-2',
          rating: 7,
          reasons: ['Strong Emotional Payoff'],
        }),
      ]),
    );

    expect(projection['imdb:tt001']).toEqual({
      canonicalId: 'imdb:tt001',
      updatedAt: '2026-06-10T12:00:00.000Z',
      eventIds: ['evt-1', 'evt-2'],
      rating: 7,
      reasons: ['strong emotional payoff'],
    });
  });

  it('projects lowercased reasons from validated events', () => {
    const projection = projectTitleReactions(
      validate([
        event({
          eventId: 'evt-1',
          rating: 9,
          reasons: ['MCU', 'mcu', ' Mcu '],
        }),
      ]),
    );

    expect(projection['imdb:tt001'].reasons).toEqual(['mcu']);
  });

  it('writes deterministic projection output sorted by canonicalId', async () => {
    const rootDir = await createTempProject();
    await writeCatalog(rootDir);
    await writeEvents(
      rootDir,
      `${JSON.stringify(event({ eventId: 'evt-b', canonicalId: 'imdb:tt002' }))}\n${JSON.stringify(
        event({ eventId: 'evt-a', canonicalId: 'imdb:tt001' }),
      )}\n`,
    );

    await buildTitleReactions({ rootDir });
    const first = await fs.readFile(
      path.join(rootDir, 'data', 'title-reactions.json'),
      'utf8',
    );
    await buildTitleReactions({ rootDir });
    const second = await fs.readFile(
      path.join(rootDir, 'data', 'title-reactions.json'),
      'utf8',
    );

    expect(first).toBe(second);
    expect(Object.keys(JSON.parse(first))).toEqual([
      'imdb:tt001',
      'imdb:tt002',
    ]);
  });

  it('builds empty event streams into an empty projection', async () => {
    const rootDir = await createTempProject();
    await writeCatalog(rootDir);
    await writeEvents(rootDir, '');

    const report = await buildTitleReactions({ rootDir });
    const projection = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'data', 'title-reactions.json'),
        'utf8',
      ),
    );

    expect(report).toMatchObject({
      eventsRead: 0,
      reactionRecordsWritten: 0,
    });
    expect(projection).toEqual({});
  });

  it('appends title reaction events without replacing existing events', async () => {
    const rootDir = await createTempProject();
    await writeCatalog(rootDir);
    await writeEvents(
      rootDir,
      `${JSON.stringify(event({ eventId: 'evt-existing' }))}\n`,
    );
    const eventsPath = path.join(
      rootDir,
      'events',
      'title-reactions.events.ndjson',
    );

    const report = await appendTitleReactionEvents({
      eventsPath,
      catalog: testCatalog(),
      events: [
        event({
          eventId: 'evt-new',
          canonicalId: 'imdb:tt002',
          rating: 9,
        }),
      ],
    });
    const eventText = await fs.readFile(eventsPath, 'utf8');

    expect(report).toMatchObject({
      eventsAppended: 1,
      outputPathWritten: eventsPath,
    });
    expect(eventText.trim().split('\n')).toHaveLength(2);
    expect(eventText).toContain('evt-existing');
    expect(eventText).toContain('evt-new');
  });

  it('rejects duplicate appended event IDs before writing', async () => {
    const rootDir = await createTempProject();
    await writeCatalog(rootDir);
    await writeEvents(
      rootDir,
      `${JSON.stringify(event({ eventId: 'evt-existing' }))}\n`,
    );
    const eventsPath = path.join(
      rootDir,
      'events',
      'title-reactions.events.ndjson',
    );
    const before = await fs.readFile(eventsPath, 'utf8');

    await expect(
      appendTitleReactionEvents({
        eventsPath,
        catalog: testCatalog(),
        events: [
          event({
            eventId: 'evt-existing',
            canonicalId: 'imdb:tt002',
          }),
        ],
      }),
    ).rejects.toThrow('Duplicate eventId found: evt-existing');
    await expect(fs.readFile(eventsPath, 'utf8')).resolves.toBe(before);
  });

  it('does not make provider, Plex, or network calls during reaction builds', async () => {
    const rootDir = await createTempProject();
    const fetchImpl = vi.fn(async () => {
      throw new Error('Network access is not allowed.');
    });
    vi.stubGlobal('fetch', fetchImpl);
    await writeCatalog(rootDir);
    await writeEvents(rootDir, `${JSON.stringify(event())}\n`);

    await buildTitleReactions({ rootDir });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('title reaction generated source', () => {
  it('generates Markdown frontmatter for title reactions', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-10',
      catalog: testCatalog(),
      titleReactions: {},
    });
    const parsed = matter(docs['title-reactions-summary.md']);

    expect(parsed.data).toMatchObject({
      title: 'Generated Title Reactions Summary',
      status: 'generated',
      upload_to_chatgpt: true,
      generated_from: [
        'data/title-reactions.json',
        'data/catalog.json',
      ],
    });
    expect(parsed.data.last_updated.toISOString().slice(0, 10)).toBe(
      '2026-06-10',
    );
  });

  it('joins generated Markdown titles from data/catalog.json', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-10',
      catalog: testCatalog(),
      titleReactions: {
        'imdb:tt001': {
          canonicalId: 'imdb:tt001',
          updatedAt: '2026-06-10T12:00:00.000Z',
          eventIds: ['evt-1'],
          rating: 9,
          watchStatus: 'completed',
        },
      },
    });

    expect(docs['title-reactions-summary.md']).toContain(
      'Alpha (2001) - movie',
    );
  });

  it('includes reaction reasons in generated Markdown when present', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-10',
      catalog: testCatalog(),
      titleReactions: {
        'imdb:tt001': {
          canonicalId: 'imdb:tt001',
          updatedAt: '2026-06-10T12:00:00.000Z',
          eventIds: ['evt-1'],
          rating: 9,
          reasons: ['great atmosphere', 'soundtrack'],
        },
      },
    });

    expect(docs['title-reactions-summary.md']).toContain(
      'reasons great atmosphere, soundtrack',
    );
  });

  it('does not include plot summaries in generated Markdown', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-10',
      catalog: testCatalog(),
      titleReactions: {
        'imdb:tt001': {
          canonicalId: 'imdb:tt001',
          updatedAt: '2026-06-10T12:00:00.000Z',
          eventIds: ['evt-1'],
          rating: 9,
        },
      },
    });

    expect(docs['title-reactions-summary.md']).not.toContain(
      'plot summary',
    );
  });

  it('states when no title reactions are currently recorded', () => {
    const docs = buildGeneratedSourceDocuments({
      lastUpdated: '2026-06-10',
      catalog: testCatalog(),
      titleReactions: {},
    });

    expect(docs['title-reactions-summary.md']).toContain(
      'No title reactions are currently recorded.',
    );
  });
});
