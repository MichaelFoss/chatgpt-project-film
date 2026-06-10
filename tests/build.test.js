import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

const repositoryRoot = process.cwd();
const buildModuleUrl = pathToFileURL(
  path.join(repositoryRoot, 'scripts', 'build.js'),
).href;
const uploadArtifactsModuleUrl = pathToFileURL(
  path.join(repositoryRoot, 'scripts', 'lib', 'upload-artifacts.js'),
).href;

let testRoot;

async function loadBuildModules() {
  vi.resetModules();

  const [buildModule, uploadArtifactsModule] = await Promise.all([
    import(buildModuleUrl),
    import(uploadArtifactsModuleUrl),
  ]);

  return {
    ...buildModule,
    ...uploadArtifactsModule,
  };
}

beforeEach(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'build-test-'));
  await fs.mkdir(path.join(testRoot, 'instructions'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(testRoot, 'instructions', 'project-instructions.md'),
    '# Project Instructions\n',
    'utf8',
  );
  process.chdir(testRoot);
});

afterEach(async () => {
  process.chdir(repositoryRoot);
  await fs.rm(testRoot, { recursive: true, force: true });
});

describe('build artifacts', () => {
  test('writeDistArtifacts always generates project instructions artifact', async () => {
    const {
      projectInstructionsOutputFile,
      projectInstructionsPath,
      writeDistArtifacts,
    } = await loadBuildModules();

    await writeDistArtifacts({
      included: [],
      uploadInstructions: '# Upload Instructions',
      cleanOutputDir: true,
      getBuildTag: () => null,
    });

    const source = await readText(projectInstructionsPath);
    const generated = await readText(projectInstructionsOutputFile);

    expect(generated).toBe(source);
  });

  test('writeDistArtifacts regenerates project instructions when unchanged', async () => {
    const {
      projectInstructionsOutputFile,
      projectInstructionsPath,
      writeDistArtifacts,
    } = await loadBuildModules();

    await fs.rm(projectInstructionsOutputFile, { force: true });

    await writeDistArtifacts({
      included: [],
      uploadInstructions: '# Upload Instructions',
      cleanOutputDir: false,
      getBuildTag: () => null,
    });

    const source = await readText(projectInstructionsPath);
    const generated = await readText(projectInstructionsOutputFile);

    expect(generated).toBe(source);
  });

  test('upload instructions report changed project instructions as required', async () => {
    const { buildUploadInstructions } = await loadBuildModules();
    const uploadInstructions = buildUploadInstructions({
      buildTag: 'build-2026-06-10-0001',
      changedBuildableItems: [],
      projectInstructionsChanged: true,
      isFirstBuild: false,
    });

    expect(uploadInstructions).toMatch(
      /## Project Instructions Update\n\nRequired:\n\n- `dist\/project-instructions\.md`/,
    );
  });

  test('upload instructions report unchanged project instructions with no required update', async () => {
    const { buildUploadInstructions } = await loadBuildModules();
    const uploadInstructions = buildUploadInstructions({
      buildTag: 'build-2026-06-10-0001',
      changedBuildableItems: [],
      projectInstructionsChanged: false,
      isFirstBuild: false,
    });

    expect(uploadInstructions).toMatch(
      /## Project Instructions Update\n\nNo ChatGPT Project Instructions update is required\.\n\n- None/,
    );
  });

  test('bootstrap first-build artifact exists even when no instructions update is required', async () => {
    const {
      buildUploadInstructions,
      outputDir,
      projectInstructionsOutputFile,
      projectInstructionsPath,
      writeDistArtifacts,
    } = await loadBuildModules();

    await fs.rm(outputDir, { recursive: true, force: true });

    await writeDistArtifacts({
      included: [],
      uploadInstructions: buildUploadInstructions({
        buildTag: 'build-2026-06-10-0001',
        changedBuildableItems: [],
        projectInstructionsChanged: false,
        isFirstBuild: true,
      }),
      cleanOutputDir: false,
      getBuildTag: () => null,
    });

    const source = await readText(projectInstructionsPath);
    const generated = await readText(projectInstructionsOutputFile);

    expect(generated).toBe(source);
  });
});
