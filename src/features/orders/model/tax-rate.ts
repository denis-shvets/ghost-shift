// Tax rates are stored in basis points: 2500 = 25 %, 2550 = 25.5 %.
const BASIS_POINTS_PER_PERCENT = 100;

export function formatTaxRate(basisPoints: number) {
  return `${basisPoints / BASIS_POINTS_PER_PERCENT}%`;
}
