import { omdbProvider } from './omdb-provider.js';
import { notImplementedProvider } from './not-implemented-provider.js';

export const metadataProviders = [omdbProvider, notImplementedProvider];

export {
  classifyMetadataLookupResult,
  createMetadataLookupResult,
  metadataLookupResultCategories,
  selectMetadataProvider,
} from './provider-contract.js';
export {
  createOmdbProvider,
  extractOmdbImdbId,
  mapOmdbResponse,
  omdbProvider,
  parseOmdbGenres,
} from './omdb-provider.js';
export { notImplementedProvider };
