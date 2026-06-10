import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  buildTagPrefix,
  formatList,
  getBuildableSourceDocuments,
  getBuildTags,
  getLatestBuildTag,
  outputFile,
  parseBuildTag,
  copyProjectInstructions,
  projectInstructionsOutputFile,
  projectInstructionsPath,
  toProjectPath,
  toUploadPath,
  uploadInstructionsFile,
  uploadsDir,
  validateRepositoryRoot,
  writeDistArtifacts,
} from './lib/upload-artifacts.js';

const execFileAsync = promisify(execFile);

function getTodayTagDate() {
  return new Date().toISOString().slice(0, 10);
}

async function runGit(args) {
  const { stdout } = await execFileAsync('git', args);
  return stdout.trim();
}

async function getCurrentCommit() {
  return runGit(['rev-parse', 'HEAD']);
}

async function getWorkingTreeStatus() {
  return runGit(['status', '--porcelain']);
}

async function getTagsPointingAtHead() {
  const output = await runGit(['tag', '--points-at', 'HEAD']);

  return output
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function getNextBuildTag() {
  const tags = await getBuildTags();
  const highestBuildNumber = tags.reduce((highest, tag) => {
    return Math.max(highest, parseBuildTag(tag) ?? 0);
  }, 0);

  return `${buildTagPrefix}${getTodayTagDate()}-${String(
    highestBuildNumber + 1,
  ).padStart(4, '0')}`;
}

async function getChangedFilesSinceBuildTag(latestBuildTag) {
  if (!latestBuildTag) {
    const output = await runGit([
      'ls-files',
      '--',
      'sources',
      'instructions',
    ]);

    return output
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean)
      .sort();
  }

  const output = await runGit([
    'diff',
    '--name-only',
    `${latestBuildTag}..HEAD`,
    '--',
    'sources',
    'instructions',
  ]);

  return output
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean)
    .sort();
}

export function buildUploadInstructions({
  buildTag,
  changedBuildableItems,
  projectInstructionsChanged,
  isFirstBuild,
}) {
  const changedUploadPaths = changedBuildableItems.map((item) =>
    toUploadPath(item.file, buildTag),
  );

  return [
    '# Upload Instructions',
    '',
    `Generated build tag: \`${buildTag}\``,
    '',
    isFirstBuild
      ? 'This is the first build (yay! 🎉). Upload the full generated upload set.'
      : 'This build includes only files that changed since the previous build tag.',
    '',
    '## Required Human Action',
    '',
    changedBuildableItems.length > 0
      ? 'Upload these changed source files to the ChatGPT Project:'
      : 'No changed source files need to be uploaded.',
    '',
    ...formatList(changedUploadPaths),
    '',
    '## Project Instructions Update',
    '',
    projectInstructionsChanged
      ? 'Required:'
      : 'No ChatGPT Project Instructions update is required.',
    '',
    projectInstructionsChanged
      ? '- `dist/project-instructions.md`'
      : '- None',
    '',
    '## Upload Directory',
    '',
    'Changed source files were copied to:',
    '',
    '```text',
    'dist/uploads/',
    '```',
    '',
    '## Notes',
    '',
    '- Upload only the files listed above unless intentionally doing a full refresh.',
    '- If instructions changed, paste `dist/project-instructions.md` into the ChatGPT Project Instructions field.',
    '- For a major source refresh, start a new ChatGPT conversation.',
    '- For minor source refreshes, tell ChatGPT to use the current uploaded files as authoritative.',
    "- Consider publishing build tags by running 'yarn publish-build-tags'.",
  ]
    .join('\n')
    .trimEnd();
}

async function createBuildTag(tag) {
  await execFileAsync('git', ['tag', tag, 'HEAD']);
}

async function main() {
  await validateRepositoryRoot({ commandName: 'Build' });

  const currentCommit = await getCurrentCommit();
  const status = await getWorkingTreeStatus();

  if (status) {
    console.error('Build aborted: working tree is not clean.');
    console.error('Commit or discard changes before building.');
    process.exit(1);
  }

  const tagsAtHead = await getTagsPointingAtHead();
  const existingBuildTagAtHead = tagsAtHead.find(
    (tag) => parseBuildTag(tag) !== null,
  );

  if (existingBuildTagAtHead) {
    await copyProjectInstructions();
    console.log(`HEAD is already built: ${existingBuildTagAtHead}`);
    console.log(`Wrote ${projectInstructionsOutputFile}`);
    console.log('No new build tag or upload checklist is required.');
    return;
  }

  const latestBuildTag = await getLatestBuildTag();
  const isFirstBuild = latestBuildTag === null;
  const changedFiles =
    await getChangedFilesSinceBuildTag(latestBuildTag);
  const included = await getBuildableSourceDocuments();
  const changedBuildableItems = isFirstBuild
    ? included
    : included.filter((item) => {
        return changedFiles.includes(toProjectPath(item.file));
      });
  const projectInstructionsChanged = changedFiles.includes(
    toProjectPath(projectInstructionsPath),
  );
  const hasUploadImpact =
    changedBuildableItems.length > 0 || projectInstructionsChanged;

  if (!hasUploadImpact) {
    await copyProjectInstructions();
    console.log('No ChatGPT Project upload changes detected.');

    if (latestBuildTag) {
      console.log(`Latest build tag remains ${latestBuildTag}.`);
    } else {
      console.log(
        'No prior build tag exists, but no buildable files were found.',
      );
    }

    console.log(`Wrote ${projectInstructionsOutputFile}`);
    console.log('Nothing to upload.');
    return;
  }

  const buildTag = await getNextBuildTag();
  const uploadInstructions = buildUploadInstructions({
    buildTag,
    changedBuildableItems,
    projectInstructionsChanged,
    isFirstBuild,
  });

  await writeDistArtifacts({
    included: changedBuildableItems,
    uploadInstructions,
    cleanOutputDir: false,
    getBuildTag: () => buildTag,
  });

  await createBuildTag(buildTag);

  console.log(`Created build tag ${buildTag} at ${currentCommit}`);
  console.log(`Wrote ${outputFile}`);
  console.log(`Wrote ${uploadInstructionsFile}`);
  console.log(`Copied changed upload files to ${uploadsDir}`);
  console.log(
    `Changed source file(s): ${changedBuildableItems.length}`,
  );

  console.log('');
  console.log(
    '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
  );
  console.log('!! UPLOAD REQUIRED');
  console.log(
    '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
  );
  console.log('');

  if (changedBuildableItems.length > 0) {
    console.log('Upload these files to the ChatGPT Project:');

    for (const item of changedBuildableItems) {
      console.log(`- ${toUploadPath(item.file, buildTag)}`);
    }
  } else {
    console.log('No changed source files need to be uploaded.');
  }

  if (projectInstructionsChanged) {
    console.log('');
    console.log('UPDATE PROJECT INSTRUCTIONS FROM:');
    console.log(
      `- ${path.relative(process.cwd(), projectInstructionsOutputFile)}`,
    );
  }

  console.log('');
  console.log('Open the generated checklist:');
  console.log(
    `- ${path.relative(process.cwd(), uploadInstructionsFile)}`,
  );

  console.log('');
  console.log(
    "Consider publishing build tags by running 'yarn publish-build-tags'",
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
