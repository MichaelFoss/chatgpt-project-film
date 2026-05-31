import fs from 'node:fs/promises';
import path from 'node:path';
import { CatalogBuildError } from './catalog-build-error.js';
import { isNonEmptyString } from './catalog-utils.js';

const filterFlags = new Map([
  ['--id', 'id'],
  ['--title', 'title'],
  ['--type', 'mediaType'],
  ['--media-type', 'mediaType'],
  ['--genre', 'genre'],
  ['--person', 'person'],
  ['--director', 'director'],
  ['--writer', 'writer'],
  ['--actor', 'actor'],
]);

const listUsage =
  'Usage: yarn catalog:list [--id <pattern>] [--title <pattern>] [--type <movie|series>] [--genre <pattern>] [--person <pattern>] [--director <pattern>] [--writer <pattern>] [--actor <pattern>] [--json]';
const showUsage = 'Usage: yarn catalog:show <canonicalId> [--json]';
const searchUsage =
  'Usage: yarn catalog:search [title] [--id <pattern>] [--title <pattern>] [--type <movie|series>] [--genre <pattern>] [--person <pattern>] [--director <pattern>] [--writer <pattern>] [--actor <pattern>] [--json]';

function createEmptyFilters() {
  return {
    id: [],
    title: [],
    mediaType: [],
    genre: [],
    person: [],
    director: [],
    writer: [],
    actor: [],
  };
}

function normalizeNeedle(value) {
  return value.trim().toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function wildcardMatches(value, pattern) {
  if (!isNonEmptyString(value) || !isNonEmptyString(pattern)) {
    return false;
  }

  const normalizedPattern = normalizeNeedle(pattern);
  const normalizedValue = value.toLowerCase();

  if (!normalizedPattern.includes('*')) {
    return normalizedValue.includes(normalizedPattern);
  }

  const expression = normalizedPattern
    .split('*')
    .map(escapeRegExp)
    .join('.*');

  return new RegExp(`^${expression}$`).test(normalizedValue);
}

function anyPatternMatches(values, patterns) {
  return patterns.some((pattern) =>
    values.some((value) => wildcardMatches(value, pattern)),
  );
}

function peopleValues(item, role) {
  const values = item.people?.[role];
  return Array.isArray(values) ? values : [];
}

function valuesForFilter(item, filterName) {
  if (filterName === 'id') {
    return [item.canonicalId];
  }

  if (filterName === 'title') {
    return [item.title];
  }

  if (filterName === 'mediaType') {
    return [item.mediaType];
  }

  if (filterName === 'genre') {
    return Array.isArray(item.genres) ? item.genres : [];
  }

  if (filterName === 'director') {
    return peopleValues(item, 'directors');
  }

  if (filterName === 'writer') {
    return peopleValues(item, 'writers');
  }

  if (filterName === 'actor') {
    return peopleValues(item, 'actors');
  }

  if (filterName === 'person') {
    return [
      ...peopleValues(item, 'directors'),
      ...peopleValues(item, 'writers'),
      ...peopleValues(item, 'actors'),
    ];
  }

  return [];
}

function compareCatalogItems(left, right) {
  return (
    left.title.localeCompare(right.title) ||
    left.canonicalId.localeCompare(right.canonicalId)
  );
}

function filterCatalogItems(items, filters) {
  return items
    .filter((item) =>
      Object.entries(filters).every(([filterName, patterns]) => {
        if (patterns.length === 0) {
          return true;
        }

        return anyPatternMatches(
          valuesForFilter(item, filterName),
          patterns,
        );
      }),
    )
    .sort(compareCatalogItems);
}

function parseFlagArgument(arg) {
  const equalsIndex = arg.indexOf('=');

  if (equalsIndex === -1) {
    return {
      flag: arg,
      value: null,
      hasInlineValue: false,
    };
  }

  return {
    flag: arg.slice(0, equalsIndex),
    value: arg.slice(equalsIndex + 1),
    hasInlineValue: true,
  };
}

function parseFilterArgs(
  args,
  usage,
  { allowTitlePosition = false } = {},
) {
  const filters = createEmptyFilters();
  const positional = [];
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const {
        flag,
        value: inlineValue,
        hasInlineValue,
      } = parseFlagArgument(arg);
      const filterName = filterFlags.get(flag);

      if (!filterName) {
        throw new CatalogBuildError(`${usage} Unknown flag: ${flag}`);
      }

      const value = hasInlineValue ? inlineValue : args[index + 1];

      if (!value || value.startsWith('--')) {
        throw new CatalogBuildError(usage);
      }

      filters[filterName].push(value);

      if (!hasInlineValue) {
        index += 1;
      }

      continue;
    }

    positional.push(arg);
  }

  if (allowTitlePosition && positional.length > 0) {
    filters.title.push(positional.join(' '));
  } else if (positional.length > 0) {
    throw new CatalogBuildError(usage);
  }

  return { filters, json };
}

export function parseCatalogListCliArgs(args) {
  return parseFilterArgs(args, listUsage);
}

export function parseCatalogSearchCliArgs(args) {
  return parseFilterArgs(args, searchUsage, {
    allowTitlePosition: true,
  });
}

export function parseCatalogShowCliArgs(args) {
  const positional = [];
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new CatalogBuildError(`${showUsage} Unknown flag: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length !== 1) {
    throw new CatalogBuildError(showUsage);
  }

  return { canonicalId: positional[0], json };
}

export async function readCatalog({
  rootDir = process.cwd(),
  catalogPath = path.join(rootDir, 'data', 'catalog.json'),
} = {}) {
  let text;

  try {
    text = await fs.readFile(catalogPath, 'utf8');
  } catch (error) {
    throw new CatalogBuildError(
      `Unable to read catalog at ${catalogPath}: ${error.message}`,
    );
  }

  try {
    const catalog = JSON.parse(text);

    if (
      !catalog ||
      typeof catalog !== 'object' ||
      Array.isArray(catalog)
    ) {
      throw new Error('catalog must be a JSON object');
    }

    return catalog;
  } catch (error) {
    throw new CatalogBuildError(
      `Invalid catalog JSON at ${catalogPath}: ${error.message}`,
    );
  }
}

export async function listCatalog({
  rootDir,
  catalogPath,
  filters = createEmptyFilters(),
} = {}) {
  const catalog = await readCatalog({ rootDir, catalogPath });
  return filterCatalogItems(Object.values(catalog), filters);
}

export async function searchCatalog(options = {}) {
  return listCatalog(options);
}

export async function showCatalogItem({
  rootDir,
  catalogPath,
  canonicalId,
} = {}) {
  if (!isNonEmptyString(canonicalId)) {
    throw new CatalogBuildError(showUsage);
  }

  const catalog = await readCatalog({ rootDir, catalogPath });
  return catalog[canonicalId] ?? null;
}

export function formatCatalogItems(items) {
  if (items.length === 0) {
    return 'No catalog items found.';
  }

  return items
    .map((item) =>
      [item.canonicalId, item.mediaType, item.title].join(' | '),
    )
    .join('\n');
}

export function formatCatalogItem(item) {
  if (!item) {
    return 'Catalog item not found.';
  }

  const lines = [
    `${item.title} (${item.mediaType})`,
    `- canonicalId: ${item.canonicalId}`,
  ];

  if (Array.isArray(item.genres) && item.genres.length > 0) {
    lines.push(`- genres: ${item.genres.join(', ')}`);
  }

  if (isNonEmptyString(item.description)) {
    lines.push(`- description: ${item.description}`);
  }

  for (const [label, values] of [
    ['directors', item.people?.directors],
    ['writers', item.people?.writers],
    ['actors', item.people?.actors],
  ]) {
    if (Array.isArray(values) && values.length > 0) {
      lines.push(`- ${label}: ${values.join(', ')}`);
    }
  }

  return lines.join('\n');
}
