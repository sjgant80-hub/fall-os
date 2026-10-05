// zone-ledger-map.mjs — the canonical, UI-free ledger ordering of fall-os's zones and skins.
//
// The ledger stores a zone by its INDEX in this array and a skin by its index in SKIN_ORDER, so this file is the ONE
// place that fixes "which 6-byte target means which zone." game.mjs builds its rich ZONES (names, blurbs, kernels) in
// this same order and derives indices from here; persist-ledger's reducer, the tests and the measure all import this,
// so there is no second copy to drift. Keep this array's order identical to game.mjs's ZONES.

export const ZONE_LEDGER = Object.freeze([
  { id: 'hatch', cap: 'identity', lvl: 0 },
  { id: 'memory', cap: 'memory', lvl: 1 },
  { id: 'recall', cap: 'recall', lvl: 1 },
  { id: 'forge', cap: 'build', lvl: 2 },
  { id: 'foundry', cap: 'tool', lvl: 2 },
  { id: 'skin', cap: 'skin', lvl: 3 },
  { id: 'dynamo', cap: 'cheap', lvl: 4 },
  { id: 'mint', cap: 'mint', lvl: 5 },
  { id: 'dreaming', cap: 'reflect', lvl: 6 },
  { id: 'treasury', cap: 'spend', lvl: 7 },
  { id: 'mesh', cap: 'mesh', lvl: 8 },
]);

export const SKIN_ORDER = Object.freeze(['aurora', 'ember', 'forest', 'slate', 'gold']);

export function zoneIndexById(id) { return ZONE_LEDGER.findIndex((z) => z.id === id); }
export function skinIndex(name) { const i = SKIN_ORDER.indexOf(name); return i < 0 ? 0 : i; }

export default { ZONE_LEDGER, SKIN_ORDER, zoneIndexById, skinIndex };
