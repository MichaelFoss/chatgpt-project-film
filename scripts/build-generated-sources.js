import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const generatedSourceFiles = {
  summary: 'catalog-summary.md',
  byGenre: 'catalog-by-genre.md',
  byDecade: 'catalog-by-decade.md',
  discovery: 'catalog-discovery.md',
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function asCatalogItems(catalog) {
  if (
    !catalog ||
    typeof catalog !== 'object' ||
    Array.isArray(catalog)
  ) {
    return [];
  }

  return Object.values(catalog)
    .filter((item) => {
      return item && typeof item === 'object' && !Array.isArray(item);
    })
    .sort(compareItems);
}

function compareItems(a, b) {
  return (
    String(a.title ?? '').localeCompare(String(b.title ?? '')) ||
    String(a.mediaType ?? '').localeCompare(
      String(b.mediaType ?? ''),
    ) ||
    String(a.canonicalId ?? '').localeCompare(
      String(b.canonicalId ?? ''),
    )
  );
}

function countBy(items, getKeys) {
  const counts = new Map();

  for (const item of items) {
    for (const key of getKeys(item)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((a, b) => {
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });
}

function frontmatter({ title, lastUpdated }) {
  return [
    '---',
    `title: ${title}`,
    'status: generated',
    `last_updated: ${lastUpdated}`,
    'upload_to_chatgpt: true',
    'generated_from:',
    '  - data/catalog.json',
    '---',
    '',
  ].join('\n');
}

function formatItem(item) {
  const year = Number.isInteger(item.releaseYear)
    ? ` (${item.releaseYear})`
    : '';
  const mediaType = item.mediaType ? ` - ${item.mediaType}` : '';

  return `${item.title}${year}${mediaType}`;
}

function decadeLabel(item) {
  if (!Number.isInteger(item.releaseYear)) {
    return 'Unknown or undated';
  }

  return `${Math.floor(item.releaseYear / 10) * 10}s`;
}

function ratingValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  if (value.endsWith('%')) {
    return Number.parseFloat(value);
  }

  return Number.parseFloat(value);
}

function hasRatingCoverage(item) {
  return Boolean(
    item.ratings?.imdb ||
    item.ratings?.rottenTomatoes?.critics ||
    item.ratings?.rottenTomatoes?.audience ||
    item.ratings?.metacritic,
  );
}

function ratingCoverageCount(item) {
  return [
    item.ratings?.imdb,
    item.ratings?.rottenTomatoes?.critics,
    item.ratings?.rottenTomatoes?.audience,
    item.ratings?.metacritic,
  ].filter(Boolean).length;
}

function renderCountList(entries, emptyText = '- None') {
  if (entries.length === 0) {
    return [emptyText];
  }

  return entries.map(([label, count]) => `- ${label}: ${count}`);
}

function renderItemList(items) {
  if (items.length === 0) {
    return ['- None'];
  }

  return items.map((item) => `- ${formatItem(item)}`);
}

function buildSummary(items, lastUpdated) {
  const mediaTypeCounts = countBy(items, (item) =>
    item.mediaType ? [item.mediaType] : ['unknown'],
  );
  const genreCounts = countBy(items, (item) =>
    Array.isArray(item.genres) && item.genres.length > 0
      ? item.genres
      : ['Uncategorized'],
  ).slice(0, 20);
  const decadeCounts = countBy(items, (item) => [decadeLabel(item)]);
  const ratingCoverage = items.filter(hasRatingCoverage).length;

  return [
    frontmatter({ title: 'Generated Catalog Summary', lastUpdated }),
    '# Generated Catalog Summary',
    '',
    '## Scope Caveat',
    '',
    'Ownership or access in this catalog does not imply watched status, completion, preference, or liking.',
    '',
    '## Catalog Size',
    '',
    `- Total enriched catalog records: ${items.length}`,
    '',
    '## Media Type Counts',
    '',
    ...renderCountList(mediaTypeCounts),
    '',
    '## Top Genres',
    '',
    ...renderCountList(genreCounts),
    '',
    '## Rating Coverage',
    '',
    `- Records with at least one public rating field: ${ratingCoverage}`,
    `- Records without public rating fields: ${items.length - ratingCoverage}`,
    '',
    '## Decade Coverage',
    '',
    ...renderCountList(decadeCounts),
    '',
  ].join('\n');
}

function buildByGenre(items, lastUpdated) {
  const grouped = new Map();

  for (const item of items) {
    const genres =
      Array.isArray(item.genres) && item.genres.length > 0
        ? [...item.genres].sort((a, b) => a.localeCompare(b))
        : ['Uncategorized'];

    for (const genre of genres) {
      if (!grouped.has(genre)) {
        grouped.set(genre, []);
      }

      grouped.get(genre).push(item);
    }
  }

  const genreNames = [...grouped.keys()].sort((a, b) =>
    a.localeCompare(b),
  );

  return [
    frontmatter({ title: 'Generated Catalog by Genre', lastUpdated }),
    '# Generated Catalog by Genre',
    '',
    'Grouped by provider-normalized genre. Ownership or access does not imply watched status or liking.',
    '',
    ...genreNames.flatMap((genre) => [
      `## ${genre}`,
      '',
      ...renderItemList(grouped.get(genre).sort(compareItems)),
      '',
    ]),
  ].join('\n');
}

function buildByDecade(items, lastUpdated) {
  const grouped = new Map();

  for (const item of items) {
    const label = decadeLabel(item);

    if (!grouped.has(label)) {
      grouped.set(label, []);
    }

    grouped.get(label).push(item);
  }

  const labels = [...grouped.keys()].sort((a, b) => {
    if (a === 'Unknown or undated') {
      return 1;
    }

    if (b === 'Unknown or undated') {
      return -1;
    }

    return Number.parseInt(a, 10) - Number.parseInt(b, 10);
  });

  return [
    frontmatter({ title: 'Generated Catalog by Decade', lastUpdated }),
    '# Generated Catalog by Decade',
    '',
    'Grouped by normalized `releaseYear` from the catalog projection. Ownership or access does not imply watched status or liking.',
    '',
    ...labels.flatMap((label) => [
      `## ${label}`,
      '',
      ...renderItemList(grouped.get(label).sort(compareItems)),
      '',
    ]),
  ].join('\n');
}

function topByRating(items, getRating, minimum, limit) {
  return items
    .map((item) => ({ item, rating: ratingValue(getRating(item)) }))
    .filter(
      ({ rating }) => Number.isFinite(rating) && rating >= minimum,
    )
    .sort((a, b) => b.rating - a.rating || compareItems(a.item, b.item))
    .slice(0, limit);
}

function buildDiscovery(items, lastUpdated) {
  const imdbHigh = topByRating(
    items,
    (item) => item.ratings?.imdb,
    8,
    25,
  );
  const rtHigh = topByRating(
    items,
    (item) => item.ratings?.rottenTomatoes?.critics,
    85,
    25,
  );
  const metacriticHigh = topByRating(
    items,
    (item) => item.ratings?.metacritic,
    80,
    25,
  );
  const strongCoverage = items
    .filter((item) => ratingCoverageCount(item) >= 3)
    .sort(compareItems)
    .slice(0, 30);
  const genreClusters = countBy(items, (item) => item.genres ?? [])
    .filter(([, count]) => count >= 10)
    .slice(0, 15);
  const decadeClusters = countBy(items, (item) => [decadeLabel(item)])
    .filter(
      ([label, count]) => label !== 'Unknown or undated' && count >= 10,
    )
    .slice(0, 15);

  return [
    frontmatter({
      title: 'Generated Catalog Discovery Views',
      lastUpdated,
    }),
    '# Generated Catalog Discovery Views',
    '',
    'These are factual catalog discovery views based on public metadata. They are not personalized recommendations and do not imply watched status or liking.',
    '',
    '## High IMDb Ratings',
    '',
    ...renderRatedList(imdbHigh, (value) => `${value.toFixed(1)}/10`),
    '',
    '## High Rotten Tomatoes Critics Scores',
    '',
    ...renderRatedList(rtHigh, (value) => `${Math.round(value)}%`),
    '',
    '## High Metacritic Scores',
    '',
    ...renderRatedList(
      metacriticHigh,
      (value) => `${Math.round(value)}/100`,
    ),
    '',
    '## Strong Critical Metadata Coverage',
    '',
    ...renderItemList(strongCoverage),
    '',
    '## Genre Clusters',
    '',
    ...renderCountList(genreClusters),
    '',
    '## Notable Decade Clusters',
    '',
    ...renderCountList(decadeClusters),
    '',
  ].join('\n');
}

function renderRatedList(entries, formatRating) {
  if (entries.length === 0) {
    return ['- None'];
  }

  return entries.map(({ item, rating }) => {
    return `- ${formatItem(item)} - ${formatRating(rating)}`;
  });
}

export function buildGeneratedSourceDocuments({
  catalog,
  lastUpdated = todayIsoDate(),
} = {}) {
  const items = asCatalogItems(catalog);

  return {
    [generatedSourceFiles.summary]: buildSummary(items, lastUpdated),
    [generatedSourceFiles.byGenre]: buildByGenre(items, lastUpdated),
    [generatedSourceFiles.byDecade]: buildByDecade(items, lastUpdated),
    [generatedSourceFiles.discovery]: buildDiscovery(
      items,
      lastUpdated,
    ),
  };
}

export async function buildGeneratedSources({
  rootDir = process.cwd(),
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
  outputDir = path.join(rootDir, 'sources', 'generated'),
  lastUpdated = todayIsoDate(),
} = {}) {
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  const documents = buildGeneratedSourceDocuments({
    catalog,
    lastUpdated,
  });
  const prettierConfig = (await resolveConfig(rootDir)) ?? {};

  await fs.mkdir(outputDir, { recursive: true });

  for (const [filename, content] of Object.entries(documents)) {
    const outputPath = path.join(outputDir, filename);
    const formatted = await format(content, {
      ...prettierConfig,
      parser: 'markdown',
    });
    await fs.writeFile(outputPath, formatted, 'utf8');
  }

  return Object.keys(documents).map((filename) =>
    path.join(outputDir, filename),
  );
}

async function main() {
  const files = await buildGeneratedSources();

  for (const file of files) {
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  }
}

const currentFilePath = fileURLToPath(import.meta.url);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === currentFilePath
) {
  await main();
}
