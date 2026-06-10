import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTitleReactions } from './lib/title-reactions.js';

export { buildTitleReactions } from './lib/title-reactions.js';

async function main() {
  const report = await buildTitleReactions();

  console.log(`Read ${report.eventsRead} title reaction event(s).`);
  console.log(
    `Wrote ${report.reactionRecordsWritten} title reaction record(s) to ${path.relative(
      process.cwd(),
      report.outputPathWritten,
    )}.`,
  );
}

const currentFilePath = fileURLToPath(import.meta.url);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === currentFilePath
) {
  await main();
}
