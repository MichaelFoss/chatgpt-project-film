import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const generatedSourceFiles = {
  summary: 'catalog-summary.md',
  byDecade: 'catalog-by-decade.md',
  titleIndexAF: 'catalog-title-index-a-f.md',
  titleIndexGM: 'catalog-title-index-g-m.md',
  titleIndexNZ: 'catalog-title-index-n-z.md',
  genresActionAdventure: 'catalog-genres-action-adventure.md',
  genresDramaCrimeThrillerMystery:
    'catalog-genres-drama-crime-thriller-mystery.md',
  genresSciFiFantasyHorror: 'catalog-genres-sci-fi-fantasy-horror.md',
  genresComedyFamilyAnimationRomance:
    'catalog-genres-comedy-family-animation-romance.md',
  genresDocumentaryBiographyHistoryMusicSportWarWestern:
    'catalog-genres-documentary-biography-history-music-sport-war-western.md',
  genresUncategorized: 'catalog-genres-uncategorized.md',
  criticalHighlights: 'catalog-critical-highlights.md',
  coverageSummary: 'catalog-coverage-summary.md',
};

const supersededGeneratedSourceFiles = [
  'catalog-by-genre.md',
  'catalog-discovery.md',
];

const ownershipCaveat =
  'Ownership does not imply watched status, liked status, or recommendation strength.';

const titleIndexPartitions = [
  {
    filename: generatedSourceFiles.titleIndexAF,
    title: 'Generated Catalog Title Index A-F',
    heading: 'Generated Catalog Title Index A-F',
    matches: (item) =>
      firstTitleLetter(item) >= 'A' && firstTitleLetter(item) <= 'F',
  },
  {
    filename: generatedSourceFiles.titleIndexGM,
    title: 'Generated Catalog Title Index G-M',
    heading: 'Generated Catalog Title Index G-M',
    matches: (item) =>
      firstTitleLetter(item) >= 'G' && firstTitleLetter(item) <= 'M',
  },
  {
    filename: generatedSourceFiles.titleIndexNZ,
    title: 'Generated Catalog Title Index N-Z',
    heading: 'Generated Catalog Title Index N-Z',
    matches: (item) => {
      const letter = firstTitleLetter(item);

      return letter < 'A' || letter > 'M';
    },
  },
];

const genreFamilies = [
  {
    filename: generatedSourceFiles.genresActionAdventure,
    title: 'Generated Catalog Genres Action Adventure',
    heading: 'Generated Catalog Genres: Action and Adventure',
    genres: ['Action', 'Adventure'],
  },
  {
    filename: generatedSourceFiles.genresDramaCrimeThrillerMystery,
    title: 'Generated Catalog Genres Drama Crime Thriller Mystery',
    heading:
      'Generated Catalog Genres: Drama, Crime, Thriller, Mystery',
    genres: ['Drama', 'Crime', 'Thriller', 'Mystery'],
  },
  {
    filename: generatedSourceFiles.genresSciFiFantasyHorror,
    title: 'Generated Catalog Genres Sci-Fi Fantasy Horror',
    heading: 'Generated Catalog Genres: Sci-Fi, Fantasy, Horror',
    genres: ['Sci-Fi', 'Fantasy', 'Horror'],
  },
  {
    filename: generatedSourceFiles.genresComedyFamilyAnimationRomance,
    title: 'Generated Catalog Genres Comedy Family Animation Romance',
    heading:
      'Generated Catalog Genres: Comedy, Family, Animation, Romance',
    genres: ['Comedy', 'Family', 'Animation', 'Romance'],
  },
  {
    filename:
      generatedSourceFiles.genresDocumentaryBiographyHistoryMusicSportWarWestern,
    title:
      'Generated Catalog Genres Documentary Biography History Music Sport War Western',
    heading: 'Generated Catalog Genres: Documentary and Related',
    genres: [
      'Documentary',
      'Biography',
      'History',
      'Music',
      'Sport',
      'War',
      'Western',
    ],
  },
];

const knownGenreNames = new Set(
  genreFamilies.flatMap((family) => family.genres),
);

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

function frontmatter({ title, lastUpdated, uploadToChatGPT = true }) {
  return [
    '---',
    `title: ${title}`,
    'status: generated',
    `last_updated: ${lastUpdated}`,
    `upload_to_chatgpt: ${uploadToChatGPT ? 'true' : 'false'}`,
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

function imdbId(item) {
  const canonicalId = String(item.canonicalId ?? '');

  if (canonicalId.startsWith('imdb:')) {
    return canonicalId.slice('imdb:'.length);
  }

  return null;
}

function primaryGenres(item) {
  return Array.isArray(item.genres) && item.genres.length > 0
    ? [...item.genres].sort((a, b) => a.localeCompare(b))
    : [];
}

function firstTitleLetter(item) {
  const first = String(item.title ?? '')
    .trim()
    .charAt(0)
    .toUpperCase();

  return /^[A-Z]$/.test(first) ? first : '#';
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

function renderOwnershipCaveat() {
  return ['## Ownership Caveat', '', ownershipCaveat, ''];
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
    ownershipCaveat,
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

function buildTitleIndex({ items, partition, lastUpdated }) {
  const partitionItems = items
    .filter(partition.matches)
    .sort(compareItems);

  return [
    frontmatter({ title: partition.title, lastUpdated }),
    `# ${partition.heading}`,
    '',
    ...renderOwnershipCaveat(),
    '## Titles',
    '',
    ...renderTitleIndexRows(partitionItems),
    '',
  ].join('\n');
}

function renderTitleIndexRows(items) {
  if (items.length === 0) {
    return ['- None'];
  }

  return items.map((item) => {
    const year = Number.isInteger(item.releaseYear)
      ? String(item.releaseYear)
      : 'unknown year';
    const mediaType = item.mediaType ?? 'unknown media type';
    const genres = primaryGenres(item);
    const genreText =
      genres.length > 0 ? genres.join(', ') : 'Uncategorized';
    const id = imdbId(item);
    const idText = id ? `IMDb: ${id}` : 'IMDb: unavailable';

    return `- ${item.title} (${year}) - ${mediaType} - ${genreText} - ${idText}`;
  });
}

function buildGenreFamily({ items, family, lastUpdated }) {
  const grouped = groupItemsByGenres(items, family.genres);

  return [
    frontmatter({ title: family.title, lastUpdated }),
    `# ${family.heading}`,
    '',
    ...renderOwnershipCaveat(),
    ...renderGenreGroups(grouped, family.genres),
  ].join('\n');
}

function buildUncategorizedGenres(items, lastUpdated) {
  const unmatchedGenres = [
    ...new Set(
      items.flatMap((item) => {
        const genres = primaryGenres(item);

        if (genres.length === 0) {
          return [];
        }

        return genres.filter((genre) => !knownGenreNames.has(genre));
      }),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const grouped = groupItemsByGenres(items, [
    'Uncategorized',
    ...unmatchedGenres,
  ]);

  return [
    frontmatter({
      title: 'Generated Catalog Genres Uncategorized',
      lastUpdated,
    }),
    '# Generated Catalog Genres: Uncategorized',
    '',
    ...renderOwnershipCaveat(),
    ...renderGenreGroups(grouped, [
      'Uncategorized',
      ...unmatchedGenres,
    ]),
  ].join('\n');
}

function groupItemsByGenres(items, genres) {
  const grouped = new Map(genres.map((genre) => [genre, []]));

  for (const item of items) {
    const itemGenres = primaryGenres(item);
    const normalizedGenres =
      itemGenres.length > 0 ? itemGenres : ['Uncategorized'];

    for (const genre of genres) {
      if (normalizedGenres.includes(genre)) {
        grouped.get(genre).push(item);
      }
    }
  }

  return grouped;
}

function renderGenreGroups(grouped, genres) {
  return genres.flatMap((genre) => [
    `## ${genre}`,
    '',
    ...renderItemList(grouped.get(genre).sort(compareItems)),
    '',
  ]);
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
    'Grouped by normalized `releaseYear` from the catalog projection.',
    '',
    ownershipCaveat,
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

function buildCriticalHighlights(items, lastUpdated) {
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
      title: 'Generated Catalog Critical Highlights',
      lastUpdated,
    }),
    '# Generated Catalog Critical Highlights',
    '',
    'These are factual browsing views based on public metadata. They are not personalized recommendations. Ownership does not imply watched status, liked status, preference, or recommendation strength.',
    '',
    '## Strongest IMDb Ratings',
    '',
    ...renderRatedList(imdbHigh, (value) => `${value.toFixed(1)}/10`),
    '',
    '## Strongest Rotten Tomatoes Critics Scores',
    '',
    ...renderRatedList(rtHigh, (value) => `${Math.round(value)}%`),
    '',
    '## Strongest Metacritic Scores',
    '',
    ...renderRatedList(
      metacriticHigh,
      (value) => `${Math.round(value)}/100`,
    ),
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

function buildCoverageSummary(items, lastUpdated) {
  const counts = {
    title: items.filter((item) => item.title).length,
    releaseYear: items.filter((item) =>
      Number.isInteger(item.releaseYear),
    ).length,
    mediaType: items.filter((item) => item.mediaType).length,
    genres: items.filter((item) => primaryGenres(item).length > 0)
      .length,
    description: items.filter((item) => item.description).length,
    posterUrl: items.filter((item) => item.posterUrl).length,
    people: items.filter((item) => item.people).length,
    imdbId: items.filter((item) => imdbId(item)).length,
    imdbRating: items.filter((item) => item.ratings?.imdb).length,
    rottenTomatoesCritics: items.filter(
      (item) => item.ratings?.rottenTomatoes?.critics,
    ).length,
    rottenTomatoesAudience: items.filter(
      (item) => item.ratings?.rottenTomatoes?.audience,
    ).length,
    metacritic: items.filter((item) => item.ratings?.metacritic).length,
  };
  const totalRatingFields = items.reduce(
    (sum, item) => sum + ratingCoverageCount(item),
    0,
  );
  const fullPublicRatingCoverage = items.filter(
    (item) => ratingCoverageCount(item) >= 3,
  ).length;

  return [
    frontmatter({
      title: 'Generated Catalog Coverage Summary',
      lastUpdated,
      uploadToChatGPT: false,
    }),
    '# Generated Catalog Coverage Summary',
    '',
    'Audit artifact for generated catalog source quality. This document is not runtime retrieval context.',
    '',
    '## Metadata Coverage',
    '',
    `- Total enriched catalog records: ${items.length}`,
    `- Records with title: ${counts.title}`,
    `- Records with release year: ${counts.releaseYear}`,
    `- Records with media type: ${counts.mediaType}`,
    `- Records with one or more genres: ${counts.genres}`,
    `- Records with description: ${counts.description}`,
    `- Records with poster URL: ${counts.posterUrl}`,
    `- Records with people metadata: ${counts.people}`,
    '',
    '## Rating Coverage',
    '',
    `- Records with at least one public rating field: ${items.filter(hasRatingCoverage).length}`,
    `- Records with IMDb rating: ${counts.imdbRating}`,
    `- Records with Rotten Tomatoes critics rating: ${counts.rottenTomatoesCritics}`,
    `- Records with Rotten Tomatoes audience rating: ${counts.rottenTomatoesAudience}`,
    `- Records with Metacritic rating: ${counts.metacritic}`,
    `- Records with IMDb, Rotten Tomatoes critics, and Metacritic ratings: ${fullPublicRatingCoverage}`,
    `- Total populated public rating fields: ${totalRatingFields}`,
    '',
    '## Provider Population Statistics',
    '',
    `- Records with IMDb ID from canonical identifier: ${counts.imdbId}`,
    `- Records with provider-enriched descriptions: ${counts.description}`,
    `- Records with provider-enriched posters: ${counts.posterUrl}`,
    `- Records with provider-enriched people metadata: ${counts.people}`,
    '',
    '## Catalog Completeness Metrics',
    '',
    `- Records missing release year: ${items.length - counts.releaseYear}`,
    `- Records missing genres: ${items.length - counts.genres}`,
    `- Records missing descriptions: ${items.length - counts.description}`,
    `- Records missing any public rating field: ${items.length - items.filter(hasRatingCoverage).length}`,
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
  const documents = {
    [generatedSourceFiles.summary]: buildSummary(items, lastUpdated),
    [generatedSourceFiles.byDecade]: buildByDecade(items, lastUpdated),
    [generatedSourceFiles.criticalHighlights]: buildCriticalHighlights(
      items,
      lastUpdated,
    ),
    [generatedSourceFiles.coverageSummary]: buildCoverageSummary(
      items,
      lastUpdated,
    ),
  };

  for (const partition of titleIndexPartitions) {
    documents[partition.filename] = buildTitleIndex({
      items,
      lastUpdated,
      partition,
    });
  }

  for (const family of genreFamilies) {
    documents[family.filename] = buildGenreFamily({
      items,
      lastUpdated,
      family,
    });
  }

  documents[generatedSourceFiles.genresUncategorized] =
    buildUncategorizedGenres(items, lastUpdated);

  return documents;
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

  await fs.mkdir(outputDir, { recursive: true });
  const prettierConfig =
    (await resolveConfig(path.join(outputDir, 'catalog-summary.md'))) ??
    {};

  for (const filename of supersededGeneratedSourceFiles) {
    await fs.rm(path.join(outputDir, filename), { force: true });
  }

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
