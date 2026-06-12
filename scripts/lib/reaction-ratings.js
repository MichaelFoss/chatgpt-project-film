import { CatalogBuildError } from './catalog-build-error.js';

export const ratingScale = [
  { key: '0', rating: 10, label: 'Exceptional', band: 'exceptional' },
  { key: '9', rating: 9, label: 'Loved', band: 'loved' },
  { key: '8', rating: 8, label: '', band: 'loved' },
  { key: '7', rating: 7, label: 'Liked', band: 'liked' },
  { key: '6', rating: 6, label: '', band: 'liked' },
  { key: '5', rating: 5, label: 'Mixed', band: 'mixed' },
  { key: '4', rating: 4, label: '', band: 'disliked' },
  { key: '3', rating: 3, label: 'Disliked', band: 'disliked' },
  { key: '2', rating: 2, label: '', band: 'hated' },
  { key: '1', rating: 1, label: 'Hated', band: 'hated' },
];

export const validReactionRatings = ratingScale
  .map((item) => item.rating)
  .sort((left, right) => left - right);

export const reactionRatingBands = ratingScale.reduce((bands, item) => {
  bands[item.band] = bands[item.band] ?? [];
  bands[item.band].push(item.rating);
  return bands;
}, {});

export function ratingForReaction(reaction) {
  const rating =
    typeof reaction === 'string' && /^[1-9]\d*$/.test(reaction)
      ? Number(reaction)
      : reaction;

  if (!isValidReactionRating(rating)) {
    throw new CatalogBuildError(`Unsupported reaction: ${reaction}`);
  }

  return rating;
}

export function isValidReactionRating(rating) {
  return validReactionRatings.includes(rating);
}

export function isSupportedReactionBand(band) {
  return Object.hasOwn(reactionRatingBands, band);
}

export function ratingMatchesReactionBand(rating, band) {
  return (
    isValidReactionRating(rating) &&
    isSupportedReactionBand(band) &&
    reactionRatingBands[band].includes(rating)
  );
}
