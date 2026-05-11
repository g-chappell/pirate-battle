export const DEFAULT_ELO = 1000;
export const DEFAULT_K_FACTOR = 32;

export interface EloUpdate {
  newWinnerRating: number;
  newLoserRating: number;
  delta: number;
}

export function applyElo(
  winnerRating: number,
  loserRating: number,
  k: number = DEFAULT_K_FACTOR,
): EloUpdate {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const delta = Math.round(k * (1 - expectedWinner));
  return {
    newWinnerRating: winnerRating + delta,
    newLoserRating: loserRating - delta,
    delta,
  };
}
