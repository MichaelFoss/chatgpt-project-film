import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import matter from 'gray-matter';

const execFileAsync = promisify(execFile);

export const buildTagPrefix = 'build-';

export const projectInstructionsPath = path.resolve(
  'instructions',
  'project-instructions.md',
);
export const sourceDir = path.resolve('sources');
export const outputDir = path.resolve('dist');
export const uploadsDir = path.join(outputDir, 'uploads');
export const projectInstructionsOutputFile = path.join(
  outputDir,
  'project-instructions.md',
);
export const outputFile = path.join(
  outputDir,
  'chatgpt-upload-bundle.md',
);
export const uploadInstructionsFile = path.join(
  outputDir,
  'upload-instructions.md',
);

const requiredRootFile = 'package.json';

export async function validateRepositoryRoot({ commandName }) {
  try {
    await fs.access(path.resolve(requiredRootFile));
  } catch {
    console.error(
      `${commandName} aborted: command must be run from the repository root.`,
    );

    process.exit(1);
  }
}

export function parseBuildTag(tag) {
  const pattern = /^build-\d{4}-\d{2}-\d{2}-(\d{4})$/;
  const match = tag.match(pattern);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

export async function runGit(args) {
  const { stdout } = await execFileAsync('git', args);
  return stdout.trim();
}

export async function getBuildTags() {
  const output = await runGit(['tag', '--list', `${buildTagPrefix}*`]);

  return output
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => parseBuildTag(tag) !== null)
    .sort((a, b) => {
      const aNumber = parseBuildTag(a) ?? 0;
      const bNumber = parseBuildTag(b) ?? 0;

      return aNumber - bNumber;
    });
}

export async function getLatestBuildTag() {
  const tags = await getBuildTags();

  return tags.at(-1) ?? null;
}

function demoteAtxHeadings(content, levels = 2) {
  return content.replace(/^(#{1,6})\s+/gm, (match, hashes) => {
    const nextLevel = Math.min(hashes.length + levels, 6);
    return `${'#'.repeat(nextLevel)} `;
  });
}

function formatMetadata(data) {
  const entries = Object.entries(data);

  if (entries.length === 0) {
    return [];
  }

  return [
    '### Source Metadata',
    '',
    ...entries.map(([key, value]) => {
      if (Array.isArray(value)) {
        return `- \`${key}\`: ${value.join(', ')}`;
      }

      return `- \`${key}\`: ${String(value)}`;
    }),
    '',
  ];
}

async function getMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await getMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

export function toProjectPath(filePath) {
  return path.relative(process.cwd(), filePath);
}

export function addBuildTagToFilename(filePath, buildTag) {
  const directory = path.dirname(filePath);
  const extension = path.extname(filePath);
  const basename = path.basename(filePath, extension);
  const filename = `${basename}.${buildTag}${extension}`;

  if (directory === '.') {
    return filename;
  }

  return path.join(directory, filename);
}

export function toUploadPath(filePath, buildTag) {
  return path.join(
    'dist',
    'uploads',
    addBuildTagToFilename(path.relative(sourceDir, filePath), buildTag),
  );
}

export function formatList(items) {
  if (items.length === 0) {
    return ['- None'];
  }

  return items.map((item) => `- \`${item}\``);
}

export async function getBuildableSourceDocuments() {
  const files = await getMarkdownFiles(sourceDir);
  const buildable = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const parsed = matter(content);

    if (parsed.data.upload_to_chatgpt === true) {
      buildable.push({
        file,
        content: demoteAtxHeadings(parsed.content.trim()),
        metadata: parsed.data,
        title: parsed.data.title ?? path.basename(file),
      });
    }
  }

  return buildable.sort((a, b) => a.file.localeCompare(b.file));
}

export function buildBundle(included) {
  return [
    '# ChatGPT Upload Bundle',
    '',
    'Generated from source documents marked `upload_to_chatgpt: true`.',
    '',
    ...included.flatMap((item) => [
      `## ${item.title}`,
      '',
      `File: \`${toProjectPath(item.file)}\``,
      '',
      ...formatMetadata(item.metadata),
      item.content,
      '',
      '---',
      '',
    ]),
  ]
    .join('\n')
    .trimEnd();
}

export async function getLastChangedBuildTag(filePath, latestBuildTag) {
  const tags = await getBuildTags();

  if (tags.length === 0) {
    return null;
  }

  const projectPath = toProjectPath(filePath);

  for (const tag of tags.toReversed()) {
    if (tag === tags[0]) {
      return tag;
    }

    const tagIndex = tags.indexOf(tag);
    const previousTag = tags[tagIndex - 1];
    const changedFiles = await runGit([
      'diff',
      '--name-only',
      `${previousTag}..${tag}`,
      '--',
      projectPath,
    ]);

    if (
      changedFiles
        .split('\n')
        .map((line) => line.trim())
        .includes(projectPath)
    ) {
      return tag;
    }
  }

  return latestBuildTag;
}

export async function attachBuildTagsToItems(items, latestBuildTag) {
  const taggedItems = [];

  for (const item of items) {
    taggedItems.push({
      ...item,
      buildTag: await getLastChangedBuildTag(item.file, latestBuildTag),
    });
  }

  return taggedItems;
}

export async function copyUploadFiles({ items, getBuildTag }) {
  await fs.mkdir(uploadsDir, { recursive: true });

  for (const item of items) {
    const relativePath = path.relative(sourceDir, item.file);
    const buildTag = getBuildTag(item);

    if (!buildTag) {
      continue;
    }

    const versionedPath = addBuildTagToFilename(relativePath, buildTag);
    const destinationPath = path.join(uploadsDir, versionedPath);

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(item.file, destinationPath);
  }
}

export async function copyProjectInstructions() {
  await fs.copyFile(
    projectInstructionsPath,
    projectInstructionsOutputFile,
  );
}

export async function writeDistArtifacts({
  included,
  uploadInstructions,
  copyProjectInstructionsFile,
  cleanOutputDir,
  getBuildTag,
}) {
  const bundle = buildBundle(included);

  if (cleanOutputDir) {
    await fs.rm(outputDir, { recursive: true, force: true });
  }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.rm(uploadsDir, { recursive: true, force: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  await copyUploadFiles({ items: included, getBuildTag });

  if (copyProjectInstructionsFile) {
    await copyProjectInstructions();
  } else {
    await fs.rm(projectInstructionsOutputFile, { force: true });
  }

  await fs.writeFile(outputFile, `${bundle}\n`, 'utf8');
  await fs.writeFile(
    uploadInstructionsFile,
    `${uploadInstructions}\n`,
    'utf8',
  );
}
