import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRepoEnv } from '../../scripts/lib/local-env.js';

const tempDirs = [];
const originalOmdbApiKey = process.env.OMDB_API_KEY;

async function createTempProject(envText) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'film-env-'));
  tempDirs.push(rootDir);
  await fs.writeFile(path.join(rootDir, '.env'), envText, 'utf8');
  return rootDir;
}

afterEach(async () => {
  if (originalOmdbApiKey === undefined) {
    delete process.env.OMDB_API_KEY;
  } else {
    process.env.OMDB_API_KEY = originalOmdbApiKey;
  }

  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('loadRepoEnv', () => {
  it('loads OMDB_API_KEY from the repo root .env file', async () => {
    delete process.env.OMDB_API_KEY;
    const rootDir = await createTempProject('OMDB_API_KEY=from-env\n');

    loadRepoEnv({ rootDir });

    expect(process.env.OMDB_API_KEY).toBe('from-env');
  });

  it('keeps a shell-provided OMDB_API_KEY ahead of .env', async () => {
    process.env.OMDB_API_KEY = 'from-shell';
    const rootDir = await createTempProject('OMDB_API_KEY=from-env\n');

    loadRepoEnv({ rootDir });

    expect(process.env.OMDB_API_KEY).toBe('from-shell');
  });
});
