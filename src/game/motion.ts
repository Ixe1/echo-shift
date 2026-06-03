export const oscillatingOffsetAt = (distance: number, period: number, phase = 0, tick: number): number => {
  const travel = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const cycle = Number.isFinite(period) ? Math.max(1, period) : 1;
  const progress = ((1 - Math.cos(((tick / cycle) * Math.PI * 2) + phase)) / 2);
  return progress * travel;
};
