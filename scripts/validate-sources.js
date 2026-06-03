import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';

export const sourceDir = path.resolve('sources');

const requiredFields = [
  'title',
  'status',
  'last_updated',
  'upload_to_chatgpt',
];

const allowedStatuses = new Set([
  'current',
  'living',
  'historical',
  'superseded',
  'draft',
  'generated',
]);

export async function getMarkdownFiles(dir) {
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

export function validateFile(filePath, content) {
  const parsed = matter(content);
  const errors = [];

  for (const field of requiredFields) {
    if (!(field in parsed.data)) {
      errors.push(`Missing frontmatter field: ${field}`);
    }
  }

  if (
    typeof parsed.data.status === 'string' &&
    !allowedStatuses.has(parsed.data.status)
  ) {
    errors.push(`Invalid status: ${parsed.data.status}`);
  }

  if (
    'upload_to_chatgpt' in parsed.data &&
    typeof parsed.data.upload_to_chatgpt !== 'boolean'
  ) {
    errors.push('upload_to_chatgpt must be boolean');
  }

  if (
    typeof parsed.data.last_updated === 'string' &&
    !/^\\d{4}-\\d{2}-\\d{2}$/.test(parsed.data.last_updated)
  ) {
    errors.push('last_updated must use YYYY-MM-DD');
  }

  return errors.map((error) => `${filePath}: ${error}`);
}

export async function validateSourceDirectory({
  sourceDirectory = sourceDir,
} = {}) {
  const files = await getMarkdownFiles(sourceDirectory);
  const allErrors = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    allErrors.push(...validateFile(file, content));
  }

  return { errors: allErrors, fileCount: files.length };
}

async function main() {
  const { errors, fileCount } = await validateSourceDirectory();

  if (errors.length > 0) {
    console.error(errors.join('\\n'));
    process.exit(1);
  }

  console.log(`Validated ${fileCount} source document(s).`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
