import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTitleUnignoredEvent,
  formatReactionUnignoreSummary,
  parseReactionUnignoreCliArgs,
  unignoreReactions,
} from '../../scripts/reaction-unignore.js';
import { validateTitleReactionEvents } from '../../scripts/lib/title-reactions.js';
import {
  readReactionState,
  selectEligibleReactionTitles,
} from '../../scripts/react.js';

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

function ignoredEvent(canonicalId, overrides = {}) {
  return {
    eventId: `evt-ignore-${canonicalId}`,
    type: 'title.ignored',
    occurredAt: '2026-06-10T12:00:00.000Z',
    canonicalId,
    ...overrides,
  };
}

function ignoredTitle(canonicalId, overrides = {}) {
  return {
    canonicalId,
    ignoredAt: '2026-06-10T12:00:00.000Z',
    eventId: `evt-ignore-${canonicalId}`,
    ...overrides,
  };
}

async function createTempProject({
  reactions = {},
  ignored = {
    'imdb:tt001': ignoredTitle('imdb:tt001'),
    'imdb:tt002': ignoredTitle('imdb:tt002'),
  },
  events = [ignoredEvent('imdb:tt001'), ignoredEvent('imdb:tt002')],
} = {}) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-reaction-unignore-'),
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
    path.join(rootDir, 'data', 'title-ignored.json'),
    `${JSON.stringify(ignored, null, 2)}\n`,
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

async function readIgnoredProjection(rootDir) {
  return JSON.parse(
    await fs.readFile(
      path.join(rootDir, 'data', 'title-ignored.json'),
      'utf8',
    ),
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('reaction unignore command', () => {
  it('parses one canonical ID', () => {
    expect(parseReactionUnignoreCliArgs(['imdb:tt001'])).toEqual({
      canonicalIds: ['imdb:tt001'],
    });
  });

  it('parses multiple canonical IDs', () => {
    expect(
      parseReactionUnignoreCliArgs(['imdb:tt001', 'imdb:tt002']),
    ).toEqual({
      canonicalIds: ['imdb:tt001', 'imdb:tt002'],
    });
  });

  it('creates valid unignore events', () => {
    const event = createTitleUnignoredEvent(catalog['imdb:tt001'], {
      eventId: 'evt-unignore',
      occurredAt: '2026-06-11T12:00:00.000Z',
    });

    expect(validateTitleReactionEvents([event], catalog)).toEqual([
      {
        eventId: 'evt-unignore',
        type: 'title.unignored',
        occurredAt: '2026-06-11T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
      },
    ]);
  });

  it('unignores a single title and rebuilds the ignored projection', async () => {
    const rootDir = await createTempProject();
    const output = [];
    const report = await unignoreReactions({
      rootDir,
      args: ['imdb:tt001'],
      eventFactory: (item) =>
        createTitleUnignoredEvent(item, {
          eventId: 'evt-unignore-1',
          occurredAt: '2026-06-11T12:00:00.000Z',
        }),
      writeOutput: (message) => output.push(message),
    });
    const events = await readEvents(rootDir);
    const ignoredProjection = await readIgnoredProjection(rootDir);
    const reactions = await readReactionState({ rootDir });
    const eligibleTitles = selectEligibleReactionTitles(
      catalog,
      reactions,
      new Set(Object.keys(ignoredProjection)),
    );

    expect(report.eventsWritten).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      'title.ignored',
      'title.ignored',
      'title.unignored',
    ]);
    expect(events[2]).toMatchObject({
      eventId: 'evt-unignore-1',
      canonicalId: 'imdb:tt001',
    });
    expect(ignoredProjection).toEqual({
      'imdb:tt002': ignoredTitle('imdb:tt002'),
    });
    expect(eligibleTitles.map((item) => item.canonicalId)).toContain(
      'imdb:tt001',
    );
    expect(output.join('\n')).toBe(
      ['Wrote 1 title unignore event(s).', '- Alpha (imdb:tt001)'].join(
        '\n',
      ),
    );
  });

  it('unignores multiple titles in one command', async () => {
    const rootDir = await createTempProject();
    let nextId = 1;
    const report = await unignoreReactions({
      rootDir,
      args: ['imdb:tt001', 'imdb:tt002'],
      eventFactory: (item) =>
        createTitleUnignoredEvent(item, {
          eventId: `evt-unignore-${nextId++}`,
          occurredAt: '2026-06-11T12:00:00.000Z',
        }),
      writeOutput: () => {},
    });
    const events = await readEvents(rootDir);
    const ignoredProjection = await readIgnoredProjection(rootDir);

    expect(report.eventsWritten).toBe(2);
    expect(events.slice(-2)).toEqual([
      {
        eventId: 'evt-unignore-1',
        type: 'title.unignored',
        occurredAt: '2026-06-11T12:00:00.000Z',
        canonicalId: 'imdb:tt001',
      },
      {
        eventId: 'evt-unignore-2',
        type: 'title.unignored',
        occurredAt: '2026-06-11T12:00:00.000Z',
        canonicalId: 'imdb:tt002',
      },
    ]);
    expect(ignoredProjection).toEqual({});
  });

  it('rejects unknown canonical IDs before writing events', async () => {
    const rootDir = await createTempProject();
    const before = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );

    await expect(
      unignoreReactions({
        rootDir,
        args: ['imdb:tt001', 'imdb:missing'],
        eventFactory: (item) =>
          createTitleUnignoredEvent(item, {
            eventId: `evt-unignore-${item.canonicalId}`,
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

  it('treats already-unignored titles as no-op without writing events', async () => {
    const rootDir = await createTempProject();
    await unignoreReactions({
      rootDir,
      args: ['imdb:tt001'],
      eventFactory: (item) =>
        createTitleUnignoredEvent(item, {
          eventId: 'evt-unignore-1',
        }),
      writeOutput: () => {},
    });
    const before = await fs.readFile(
      path.join(rootDir, 'events', 'title-reactions.events.ndjson'),
      'utf8',
    );
    const output = [];
    const report = await unignoreReactions({
      rootDir,
      args: ['imdb:tt001'],
      eventFactory: (item) =>
        createTitleUnignoredEvent(item, {
          eventId: 'evt-unignore-2',
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
        'Wrote 0 title unignore event(s).',
        'Already unignored:',
        '- Alpha (imdb:tt001) is not currently ignored.',
      ].join('\n'),
    );
  });

  it('formats command output for mixed changed and already-unignored titles', () => {
    expect(
      formatReactionUnignoreSummary({
        eventsWritten: 1,
        events: [
          {
            title: 'Alpha',
            canonicalId: 'imdb:tt001',
          },
        ],
        alreadyUnignored: [catalog['imdb:tt003']],
      }),
    ).toBe(
      [
        'Wrote 1 title unignore event(s).',
        '- Alpha (imdb:tt001)',
        'Already unignored:',
        '- Gamma (imdb:tt003) is not currently ignored.',
      ].join('\n'),
    );
  });

  it('prints concise output from the executable command', async () => {
    const rootDir = await createTempProject();
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        path.join(repositoryRootDir, 'scripts', 'reaction-unignore.js'),
        'imdb:tt001',
      ],
      { cwd: rootDir },
    );

    expect(stdout.trim()).toBe(
      ['Wrote 1 title unignore event(s).', '- Alpha (imdb:tt001)'].join(
        '\n',
      ),
    );
  });
});
