import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTitleReactionResetEvent,
  formatReactionResetSummary,
  parseReactionResetCliArgs,
  resetReactions,
} from '../../scripts/reaction-reset.js';

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
    releaseYear: 2001,
  },
  'imdb:tt002': {
    canonicalId: 'imdb:tt002',
    mediaType: 'series',
    title: 'Beta',
    releaseYear: 2002,
  },
  'imdb:tt003': {
    canonicalId: 'imdb:tt003',
    mediaType: 'movie',
    title: 'Gamma',
    releaseYear: 2003,
  },
};

function updateEvent(canonicalId, overrides = {}) {
  return {
    eventId: `evt-update-${canonicalId}`,
    type: 'title.reaction.updated',
    occurredAt: '2026-06-10T12:00:00.000Z',
    canonicalId,
    rating: 8,
    ...overrides,
  };
}

function reaction(canonicalId, overrides = {}) {
  return {
    canonicalId,
    updatedAt: '2026-06-10T12:00:00.000Z',
    eventIds: [`evt-update-${canonicalId}`],
    rating: 8,
    ...overrides,
  };
}

async function createTempProject({
  reactions = {
    'imdb:tt001': reaction('imdb:tt001'),
    'imdb:tt002': reaction('imdb:tt002'),
  },
  events = [updateEvent('imdb:tt001'), updateEvent('imdb:tt002')],
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-reset-'),
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
    events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    'utf8',
  );
  return rootDir;
}

async function readEvents(rootDir) {
  const text = await fs.readFile(
    path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
    'utf8',
  );

  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readProjection(rootDir) {
  return JSON.parse(
    await fs.readFile(
      path.join(rootDir, 'data', 'title-reactions.json'),
      'utf8',
    ),
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('reaction reset command', () => {
  it('parses one or more canonical IDs', () => {
    expect(parseReactionResetCliArgs(['imdb:tt001'])).toEqual({
      canonicalIds: ['imdb:tt001'],
    });
    expect(
      parseReactionResetCliArgs(['imdb:tt001', 'imdb:tt002']),
    ).toEqual({
      canonicalIds: ['imdb:tt001', 'imdb:tt002'],
    });
  });

  it('creates valid reset events', () => {
    expect(
      createTitleReactionResetEvent(catalog['imdb:tt001'], {
        eventId: 'evt-reset',
        occurredAt: '2026-06-11T12:00:00.000Z',
      }),
    ).toEqual({
      eventId: 'evt-reset',
      type: 'title.reaction.reset',
      occurredAt: '2026-06-11T12:00:00.000Z',
      canonicalId: 'imdb:tt001',
    });
  });

  it('resets a single reacted title and rebuilds the projection', async () => {
    const rootDir = await createTempProject();
    const output = [];
    const report = await resetReactions({
      rootDir,
      args: ['imdb:tt001'],
      eventFactory: (item) =>
        createTitleReactionResetEvent(item, {
          eventId: 'evt-reset-1',
          occurredAt: '2026-06-11T12:00:00.000Z',
        }),
      writeOutput: (message) => output.push(message),
    });
    const events = await readEvents(rootDir);
    const projection = await readProjection(rootDir);

    expect(report.eventsWritten).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      'title.reaction.updated',
      'title.reaction.updated',
      'title.reaction.reset',
    ]);
    expect(events[2]).toMatchObject({
      eventId: 'evt-reset-1',
      canonicalId: 'imdb:tt001',
    });
    expect(projection).toEqual({
      'imdb:tt002': reaction('imdb:tt002'),
    });
    expect(output.join('\n')).toBe(
      [
        'Wrote 1 title reaction reset event(s).',
        '- Alpha (imdb:tt001)',
      ].join('\n'),
    );
  });

  it('resets multiple reacted titles in one command', async () => {
    const rootDir = await createTempProject();
    let nextId = 1;
    const report = await resetReactions({
      rootDir,
      args: ['imdb:tt001', 'imdb:tt002'],
      eventFactory: (item) =>
        createTitleReactionResetEvent(item, {
          eventId: `evt-reset-${nextId++}`,
          occurredAt: '2026-06-11T12:00:00.000Z',
        }),
      writeOutput: () => {},
    });
    const events = await readEvents(rootDir);
    const projection = await readProjection(rootDir);

    expect(report.eventsWritten).toBe(2);
    expect(events.slice(-2)).toEqual([
      {
        eventId: 'evt-reset-1',
        type: 'title.reaction.reset',
        occurredAt: '2026-06-11T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
      },
      {
        eventId: 'evt-reset-2',
        type: 'title.reaction.reset',
        occurredAt: '2026-06-11T12:00:00.000Z',
        canonicalId: 'imdb:tt002',
      },
    ]);
    expect(projection).toEqual({});
  });

  it('rejects unknown canonical IDs before writing events', async () => {
    const rootDir = await createTempProject();
    const before = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );

    await expect(
      resetReactions({
        rootDir,
        args: ['imdb:tt001', 'imdb:missing'],
        eventFactory: (item) =>
          createTitleReactionResetEvent(item, {
            eventId: `evt-reset-${item.canonicalId}`,
          }),
        writeOutput: () => {},
      }),
    ).rejects.toThrow(
      'No catalog title found for canonical ID: imdb:missing',
    );
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe(before);
  });

  it('treats repeated reset commands as no-op after current state is reset', async () => {
    const rootDir = await createTempProject();
    await resetReactions({
      rootDir,
      args: ['imdb:tt001'],
      eventFactory: (item) =>
        createTitleReactionResetEvent(item, {
          eventId: 'evt-reset-1',
        }),
      writeOutput: () => {},
    });
    const before = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    const output = [];
    const report = await resetReactions({
      rootDir,
      args: ['imdb:tt001'],
      eventFactory: (item) =>
        createTitleReactionResetEvent(item, {
          eventId: 'evt-reset-2',
        }),
      writeOutput: (message) => output.push(message),
    });

    expect(report.eventsWritten).toBe(0);
    await expect(
      fs.readFile(
        path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
        'utf8',
      ),
    ).resolves.toBe(before);
    expect(output.join('\n')).toBe(
      [
        'Wrote 0 title reaction reset event(s).',
        'Already eligible-unreacted:',
        '- Alpha (imdb:tt001)',
      ].join('\n'),
    );
  });

  it('formats command output for mixed changed and already-unreacted titles', () => {
    expect(
      formatReactionResetSummary({
        eventsWritten: 1,
        events: [
          {
            title: 'Alpha',
            canonicalId: 'imdb:tt001',
          },
        ],
        alreadyUnreacted: [catalog['imdb:tt003']],
      }),
    ).toBe(
      [
        'Wrote 1 title reaction reset event(s).',
        '- Alpha (imdb:tt001)',
        'Already eligible-unreacted:',
        '- Gamma (imdb:tt003)',
      ].join('\n'),
    );
  });

  it('prints concise output from the executable command', async () => {
    const rootDir = await createTempProject();
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        path.join(repositoryRootDir, 'scripts', 'reaction-reset.js'),
        'imdb:tt001',
      ],
      { cwd: rootDir },
    );

    expect(stdout.trim()).toBe(
      [
        'Wrote 1 title reaction reset event(s).',
        '- Alpha (imdb:tt001)',
      ].join('\n'),
    );
  });
});
