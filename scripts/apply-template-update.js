import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const templateRemoteName = 'template';
const templateRemoteUrl =
  'git@github.com:MichaelFoss/template-chatgpt-project.git';
const ledgerPath = 'template-updates.md';

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
}

function runGitOrExit(args, failureMessage) {
  const result = runGit(args);

  if (result.status !== 0) {
    console.error(failureMessage);

    if (result.stderr) {
      console.error(result.stderr);
    }

    process.exit(result.status);
  }

  return result.stdout;
}

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function ensureCleanWorkingTree() {
  const status = runGitOrExit(
    ['status', '--porcelain'],
    'Could not inspect Git working tree.',
  );

  if (status) {
    console.error(
      'Template update aborted: working tree is not clean.',
    );
    console.error(
      'Commit or discard local changes before applying an update.',
    );
    process.exit(1);
  }
}

function ensureTemplateRemote() {
  const existingUrl = runGit(['remote', 'get-url', templateRemoteName]);

  if (existingUrl.status === 0) {
    if (existingUrl.stdout !== templateRemoteUrl) {
      console.error(
        `Template update aborted: remote \`${templateRemoteName}\` points to:`,
      );
      console.error(existingUrl.stdout);
      console.error('Expected:');
      console.error(templateRemoteUrl);
      console.error(
        `Update the remote with: git remote set-url ${templateRemoteName} ${templateRemoteUrl}`,
      );
      process.exit(1);
    }

    return;
  }

  console.log(
    `Adding \`${templateRemoteName}\` remote: ${templateRemoteUrl}`,
  );
  runGitOrExit(
    ['remote', 'add', templateRemoteName, templateRemoteUrl],
    `Could not add \`${templateRemoteName}\` remote.`,
  );
}

function ensureLedgerExists() {
  if (existsSync(ledgerPath)) {
    return;
  }

  writeFileSync(
    ledgerPath,
    [
      '# Template Updates',
      '',
      'Applied template updates are recorded here.',
      '',
      '| Date | Template Commit | Description |',
      '| ---- | --------------- | ----------- |',
      '',
    ].join('\n'),
  );
}

function appendLedgerRow({ shortSha, description }) {
  ensureLedgerExists();

  const existing = readFileSync(ledgerPath, 'utf8');
  const suffix = existing.endsWith('\n') ? '' : '\n';
  const row = buildLedgerRow({ shortSha, description });

  writeFileSync(ledgerPath, `${existing}${suffix}${row}\n`);
}

function buildLedgerRow({ shortSha, description }) {
  const escapedDescription = description.replaceAll('|', '\\|');

  return `| ${getTodayLocalDate()} | ${shortSha} | ${escapedDescription} |`;
}

function printConflictInstructions({ shortSha, description }) {
  console.error('');
  console.error(
    'Cherry-pick stopped because Git reported a conflict or failure.',
  );
  console.error('Git has been left in its normal cherry-pick state.');
  console.error('');
  console.error('Next steps:');
  console.error('1. Inspect conflicts with: git status');
  console.error('2. Fix the conflicted files.');
  console.error('3. Continue with: git cherry-pick --continue');
  console.error(
    '4. Manually add the ledger row to template-updates.md.',
  );
  console.error(`   ${buildLedgerRow({ shortSha, description })}`);
  console.error(
    '5. Amend the cherry-picked commit with: git add template-updates.md && git commit --amend --no-edit',
  );
  console.error('6. Or cancel with: git cherry-pick --abort');
}

function main() {
  const [, , templateRef, ...descriptionParts] = process.argv;

  if (!templateRef) {
    console.error(
      'Usage: yarn apply-template-update <template-ref> [description]',
    );
    process.exit(1);
  }

  ensureCleanWorkingTree();
  ensureTemplateRemote();

  console.log(`Fetching \`${templateRemoteName}\` remote.`);
  runGitOrExit(
    ['fetch', templateRemoteName],
    `Could not fetch \`${templateRemoteName}\` remote.`,
  );

  const fullSha = runGitOrExit(
    ['rev-parse', `${templateRef}^{commit}`],
    `Could not resolve template ref: ${templateRef}`,
  );
  const shortSha = runGitOrExit(
    ['rev-parse', '--short', fullSha],
    `Could not shorten template ref: ${templateRef}`,
  );
  const commitSubject = runGitOrExit(
    ['show', '-s', '--format=%s', fullSha],
    `Could not read commit subject for: ${templateRef}`,
  );
  const description =
    descriptionParts.join(' ').trim() || commitSubject;

  console.log(
    `Cherry-picking template update ${shortSha}: ${commitSubject}`,
  );
  const cherryPick = runGit(['cherry-pick', fullSha], {
    stdio: 'inherit',
  });

  if (cherryPick.status !== 0) {
    printConflictInstructions({ shortSha, description });
    process.exit(cherryPick.status);
  }

  appendLedgerRow({ shortSha, description });
  runGitOrExit(['add', ledgerPath], `Could not stage ${ledgerPath}.`);
  runGitOrExit(
    ['commit', '--amend', '--no-edit'],
    'Could not amend cherry-picked commit with template update ledger.',
  );

  console.log('');
  console.log(`Applied template update ${shortSha}.`);
  console.log(`Recorded it in ${ledgerPath}.`);
  console.log('Next steps:');
  console.log('- Review the resulting commit.');
  console.log('- Run the relevant project checks.');
  console.log('- Push when ready.');
}

main();
