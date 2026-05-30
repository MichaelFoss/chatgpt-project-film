import { omdbProvider } from './omdb-provider.js';
import { notImplementedProvider } from './not-implemented-provider.js';

export const metadataProviders = [omdbProvider, notImplementedProvider];

export {
  createOmdbProvider,
  extractOmdbImdbId,
  mapOmdbResponse,
  omdbProvider,
  parseOmdbGenres,
} from './omdb-provider.js';
export { notImplementedProvider };
