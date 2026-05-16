export function average(items, key) {
  return Math.round(items.reduce((sum, item) => sum + item[key], 0) / items.length);
}

export function formatToPar(value) {
  if (value > 0) return `+${value}`;
  if (value === 0) return 'E';
  return `${value}`;
}

export function calcStatsFromHoles(holes) {
  const par4and5 = holes.filter((h) => h.par === 4 || h.par === 5);
  const fairways = par4and5.filter((h) => h.tee === 'fairway').length;
  const gir = holes.filter((h) => h.gir).length;
  const putts = holes.reduce((sum, h) => sum + h.putts, 0);
  const score = holes.reduce((sum, h) => sum + h.score, 0);
  const parTotal = holes.reduce((sum, h) => sum + h.par, 0);
  const upAndDownOps = holes.filter((h) => !h.gir);
  const upAndDownMade = upAndDownOps.filter((h) => h.upAndDown).length;
  const penalties = holes.filter((h) => h.tee === 'hazard').length;
  return {
    fairwaysPct: Math.round((fairways / Math.max(par4and5.length, 1)) * 100),
    girPct: Math.round((gir / Math.max(holes.length, 1)) * 100),
    putts,
    score,
    toPar: score - parTotal,
    upAndDownPct: Math.round((upAndDownMade / Math.max(upAndDownOps.length, 1)) * 100),
    penalties
  };
}

export function buildSavedRound(payload) {
  const stats = calcStatsFromHoles(payload.holes);

  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    player: payload.player,
    course: payload.course,
    tees: payload.tees,
    holes: payload.holes,
    ...stats
  };
}
