import path from 'node:path';
import dotenv from 'dotenv';

export function loadRepoEnv({ rootDir = process.cwd() } = {}) {
  return dotenv.config({
    path: path.join(rootDir, '.env'),
    override: false,
  });
}
