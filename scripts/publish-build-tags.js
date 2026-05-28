import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getBuildTags,
  validateRepositoryRoot,
} from './lib/upload-artifacts.js';

const execFileAsync = promisify(execFile);
const expectedBranch = 'main';
const remoteName = 'origin';

async function runGit(args) {
  const { stdout } = await execFileAsync('git', args);

  return stdout.trim();
}

async function getCurrentBranch() {
  return runGit(['branch', '--show-current']);
}

async function getWorkingTreeStatus() {
  return runGit(['status', '--porcelain']);
}

async function getLocalHead() {
  return runGit(['rev-parse', 'HEAD']);
}

async function getRemoteBranchHead(branchName) {
  try {
    return await runGit(['rev-parse', `${remoteName}/${branchName}`]);
  } catch {
    return null;
  }
}

async function getRemoteBuildTags() {
  const output = await runGit([
    'ls-remote',
    '--tags',
    remoteName,
    'build-*',
  ]);

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[1])
    .filter(Boolean)
    .map((ref) => ref.replace('refs/tags/', ''))
    .filter((tag) => !tag.endsWith('^{}'))
    .sort();
}

async function main() {
  await validateRepositoryRoot({
    commandName: 'Publish build tags',
  });

  const currentBranch = await getCurrentBranch();

  if (currentBranch !== expectedBranch) {
    console.error(
      `Publish build tags aborted: expected branch \`${expectedBranch}\`, but current branch is \`${currentBranch}\`.`,
    );

    process.exit(1);
  }

  const status = await getWorkingTreeStatus();

  if (status) {
    console.error(
      'Publish build tags aborted: working tree is not clean.',
    );

    console.error('Commit or discard changes before publishing.');

    process.exit(1);
  }

  await runGit(['fetch', remoteName, '--tags']);

  const localHead = await getLocalHead();
  const remoteHead = await getRemoteBranchHead(expectedBranch);

  if (remoteHead !== localHead) {
    console.log(
      `Pushing \`${expectedBranch}\` to \`${remoteName}\` before publishing build tags.`,
    );

    await runGit(['push', remoteName, expectedBranch]);
  }

  const localBuildTags = await getBuildTags();

  if (localBuildTags.length === 0) {
    console.log('No local build tags exist. Nothing to publish.');

    return;
  }

  const remoteBuildTags = new Set(await getRemoteBuildTags());

  const unpublishedBuildTags = localBuildTags.filter((tag) => {
    return !remoteBuildTags.has(tag);
  });

  if (unpublishedBuildTags.length === 0) {
    console.log('All local build tags are already published.');

    return;
  }

  await runGit(['push', remoteName, ...unpublishedBuildTags]);

  console.log('Published build tags:');

  for (const tag of unpublishedBuildTags) {
    console.log(`- ${tag}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
