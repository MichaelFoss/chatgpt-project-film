import { CatalogBuildError } from './catalog-build-error.js';

export const reactionRatings = {
  loved: 10,
  liked: 8,
  mixed: 5,
  disliked: 3,
  hated: 1,
};

export function ratingForReaction(reaction) {
  const rating = reactionRatings[reaction];

  if (!rating) {
    throw new CatalogBuildError(`Unsupported reaction: ${reaction}`);
  }

  return rating;
}

export function isSupportedReactionBand(band) {
  return Object.hasOwn(reactionRatings, band);
}

export function ratingMatchesReactionBand(rating, band) {
  return (
    Number.isInteger(rating) &&
    isSupportedReactionBand(band) &&
    reactionRatings[band] === rating
  );
}
