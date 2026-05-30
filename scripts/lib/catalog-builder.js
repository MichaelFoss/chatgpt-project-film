import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { readEvents, replayCatalogAdds } from './catalog-events.js';
import {
  generateCatalog,
  loadMetadataCache,
} from './catalog-metadata.js';
import { createBaseReport } from './catalog-report.js';
import { writeGeneratedJsonFile } from './json-file.js';

export async function buildCatalog({
  rootDir = process.cwd(),
  eventsPath = path.join(rootDir, 'events', 'media.ndjson'),
  metadataCachePath = path.join(rootDir, 'data', 'metadata-cache.json'),
  outputPath = path.join(rootDir, 'data', 'catalog.json'),
} = {}) {
  const report = createBaseReport(outputPath);

  try {
    const events = await readEvents(eventsPath);
    report.eventsRead = events.length;

    const replay = replayCatalogAdds(events);
    report.uniqueCatalogAdds = replay.catalogIds.length;
    report.duplicateCatalogAddsSkipped =
      replay.duplicateCatalogAdds.length;
    report.duplicateCatalogAdds = replay.duplicateCatalogAdds;

    const { cache, missingFile } =
      await loadMetadataCache(metadataCachePath);
    report.metadataCacheMissing = missingFile;

    const { catalog, missingMetadata, invalidMetadata } =
      generateCatalog(replay.catalogIds, cache);

    report.missingMetadata = missingMetadata;
    report.invalidMetadata = invalidMetadata;
    report.catalogRecordsWritten = Object.keys(catalog).length;

    await writeGeneratedJsonFile(outputPath, catalog);
    report.outputPathWritten = outputPath;

    return report;
  } catch (error) {
    report.fatalErrors.push(error.message);

    if (error instanceof CatalogBuildError) {
      error.report = report;
      throw error;
    }

    throw new CatalogBuildError(error.message, report);
  }
}
