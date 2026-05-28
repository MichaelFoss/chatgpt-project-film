import {
  attachBuildTagsToItems,
  formatList,
  getBuildableSourceDocuments,
  getLatestBuildTag,
  outputDir,
  outputFile,
  projectInstructionsOutputFile,
  toUploadPath,
  uploadInstructionsFile,
  uploadsDir,
  validateRepositoryRoot,
  writeDistArtifacts,
} from './lib/upload-artifacts.js';

function buildUploadInstructions(included, latestBuildTag) {
  const uploadPaths = included
    .filter((item) => item.buildTag ?? latestBuildTag)
    .map((item) =>
      toUploadPath(item.file, item.buildTag ?? latestBuildTag),
    );

  return [
    '# Upload Instructions',
    '',
    'Regenerated without creating a new build tag.',
    latestBuildTag
      ? `Latest build tag: \`${latestBuildTag}\``
      : 'No build tags exist yet.',
    '',
    '## Required Human Action',
    '',
    'This command recreates ignored `dist/` artifacts from the current',
    'repository state. It does not determine whether ChatGPT needs a new',
    'upload checkpoint.',
    '',
    'For a full refresh, upload these files to the ChatGPT Project:',
    '',
    ...formatList(uploadPaths),
    '',
    '## Project Instructions Update',
    '',
    'If needed, update the ChatGPT Project Instructions from:',
    '',
    '- `dist/project-instructions.md`',
    '',
    '## Upload Directory',
    '',
    'Source files were copied to:',
    '',
    '```text',
    'dist/uploads/',
    '```',
    '',
    '## Notes',
    '',
    '- This script inspects existing `build-*` Git tags but does not create new ones.',
    '- Use `yarn build` for normal upload checkpoint creation.',
    '- Use this command only to restore missing generated artifacts.',
  ]
    .join('\n')
    .trimEnd();
}

async function main() {
  await validateRepositoryRoot({ commandName: 'Restore build' });

  const latestBuildTag = await getLatestBuildTag();

  if (latestBuildTag === null) {
    console.error(
      'Restore build aborted: no `build-*` Git tags exist yet. Run `yarn build` first.',
    );

    process.exit(1);
  }

  const included = await attachBuildTagsToItems(
    await getBuildableSourceDocuments(),
    latestBuildTag,
  );
  const uploadInstructions = buildUploadInstructions(
    included,
    latestBuildTag,
  );

  await writeDistArtifacts({
    included,
    uploadInstructions,
    copyProjectInstructionsFile: true,
    cleanOutputDir: true,
    getBuildTag: (item) => item.buildTag ?? latestBuildTag,
  });

  console.log(`Regenerated ${outputDir}`);
  console.log(`Wrote ${outputFile}`);
  console.log(`Wrote ${uploadInstructionsFile}`);
  console.log(`Wrote ${projectInstructionsOutputFile}`);
  console.log(
    `Copied ${included.length} upload file(s) to ${uploadsDir}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
