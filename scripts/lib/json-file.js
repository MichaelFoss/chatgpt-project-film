import fs from 'node:fs/promises';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';

export async function writeGeneratedJsonFile(outputPath, value) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  const json = await format(JSON.stringify(value), {
    ...prettierConfig,
    parser: 'json',
  });
  await fs.writeFile(outputPath, json, 'utf8');
}
