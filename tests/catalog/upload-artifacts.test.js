import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBundle,
  getBuildableSourceDocuments,
} from '../../scripts/lib/upload-artifacts.js';
import { validateSourceDirectory } from '../../scripts/validate-sources.js';

const tempDirs = [];

async function createTempSourceDirectory() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'film-upload-artifacts-'),
  );
  tempDirs.push(rootDir);

  const sourceDirectory = path.join(rootDir, 'sources');
  await fs.mkdir(path.join(sourceDirectory, 'generated'), {
    recursive: true,
  });
  await fs.mkdir(path.join(sourceDirectory, 'manual'), {
    recursive: true,
  });

  return sourceDirectory;
}

async function writeSourceFile(sourceDirectory, relativePath, content) {
  const filePath = path.join(sourceDirectory, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${content.trim()}\n`, 'utf8');
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true })),
  );
});

describe('upload artifacts', () => {
  it('automatically includes generated runtime sources marked for upload', async () => {
    const sourceDirectory = await createTempSourceDirectory();
    await writeSourceFile(
      sourceDirectory,
      'generated/catalog-summary.md',
      `
---
title: Catalog Summary
status: generated
last_updated: 2026-06-03
upload_to_chatgpt: true
generated_from:
  - data/catalog.json
---

# Catalog Summary

- Total enriched catalog records: 1
`,
    );
    await writeSourceFile(
      sourceDirectory,
      'manual/reference.md',
      `
---
title: Reference Only
status: current
last_updated: 2026-06-03
upload_to_chatgpt: false
---

# Reference Only

This should not be uploaded.
`,
    );

    const included = await getBuildableSourceDocuments({
      sourceDirectory,
    });
    const bundle = buildBundle(included);

    expect(included).toHaveLength(1);
    expect(included[0].title).toBe('Catalog Summary');
    expect(included[0].metadata.status).toBe('generated');
    expect(included[0].metadata.upload_to_chatgpt).toBe(true);
    expect(bundle).toContain('## Catalog Summary');
    expect(bundle).toContain('`status`: generated');
    expect(bundle).toContain('`generated_from`: data/catalog.json');
    expect(bundle).not.toContain('Reference Only');
  });

  it('validates generated runtime source frontmatter used by uploads', async () => {
    const sourceDirectory = await createTempSourceDirectory();
    await writeSourceFile(
      sourceDirectory,
      'generated/catalog-by-genre.md',
      `
---
title: Catalog By Genre
status: generated
last_updated: 2026-06-03
upload_to_chatgpt: true
generated_from:
  - data/catalog.json
---

# Catalog By Genre

## Drama

- Alpha (1999) - movie
`,
    );

    await expect(
      validateSourceDirectory({ sourceDirectory }),
    ).resolves.toEqual({
      errors: [],
      fileCount: 1,
    });
  });
});
