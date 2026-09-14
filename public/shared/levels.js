// Shared by the renderer and server: visible cover, collision, and supplies
// always come from the same arena definition. Dimensions are in metres.
const bounds = { minX: -7.4, maxX: 7.4, minZ: -7.4, maxZ: 6.4 };
const solid = (kind, x, z, w, h, d) => ({ kind, x, y: h / 2, z, w, h, d });
const stations = () => [-1, 1].map(s => solid('table', s * 1.65, 2.15, 1.9, 1, .85));
const supplies = () => [-1, 1].flatMap(s => [
  { kind: 'pistol', p: [s * 1.2, 1.13, 2.17] },
  { kind: 'bottle', p: [s * 1.85, 1.2, 2.1] },
  { kind: 'mug', p: [s * 2.3, 1.15, 2.1] }
]);
const extra = (kind, x, y, z) => ({ kind, p: [x, y, z] });
export const LEVELS = [
  {
    id: 'apartment', name: 'The Apartment', setting: 'INDOOR', subtitle: 'Close quarters / kitchen cover',
    sky: 0xeaece3, floor: 0xe7e9df, accent: 0x8d9a7f,
    solids: [solid('island', -4.7, -1.8, 2.4, 1.16, 1.1), solid('sofa', 4.8, .4, 1.35, .92, 3.1), ...stations(),
      solid('pillar', -2.9, -4.1, .65, 3.6, .65), solid('pillar', 2.9, -4.1, .65, 3.6, .65)],
    extras: [extra('pan', -4.6, 1.3, -1.8), extra('bottle', -5.2, 1.35, -1.8), extra('vase', 4.65, 1.1, .5)]
  },
  {
    id: 'rooftop', name: 'Skyline Roof', setting: 'OUTDOOR', subtitle: 'Open sky / ventilation cover',
    sky: 0xb9d2df, floor: 0xbcc7c6, accent: 0xe5b65e,
    solids: [...stations(), solid('vent', -3.8, -.6, 2.4, 1.35, 1.5), solid('vent', 3.9, -3.7, 2, 1.35, 1.5),
      solid('planter', 4.7, 1.1, 1.2, .9, 2.5), solid('tank', -4.8, -4.7, 1.5, 2.6, 1.5)],
    extras: [extra('pan', -3.9, 1.48, -.6), extra('bottle', 3.9, 1.5, -3.7), extra('vase', 4.7, 1.08, 1.1)]
  },
  {
    id: 'diner', name: 'Last Stop Diner', setting: 'INDOOR', subtitle: 'Booths / a long service counter',
    sky: 0xe8dace, floor: 0xe9e3d7, accent: 0x648d91,
    solids: [...stations(), solid('counter', -4.7, -1.9, 1.3, 1.18, 5),
      solid('booth', 4.8, -4.4, 2.5, 1.22, 1.5), solid('booth', 4.8, -.8, 2.5, 1.22, 1.5),
      solid('counter', .2, -5.1, 2.2, 1.05, 1)],
    extras: [extra('pan', -4.7, 1.32, -1.1), extra('mug', -4.7, 1.34, -3.1), extra('bottle', .2, 1.22, -5.1)]
  },
  {
    id: 'garden', name: 'Glasshouse Garden', setting: 'OUTDOOR', subtitle: 'Fountain / planted flanking routes',
    sky: 0xcddccc, floor: 0xd5cdb7, accent: 0x7b9970,
    solids: [...stations(), solid('fountain', 0, -2.7, 2.4, .88, 2.4),
      solid('planter', -4.5, -1.2, 1.4, 1.05, 3), solid('planter', 4.5, -3.8, 2.4, 1.05, 1.3),
      solid('bench', 4.9, .5, 2.4, .82, .8)],
    extras: [extra('vase', -4.5, 1.23, -1.2), extra('bottle', 4.9, 1, .5), extra('pan', 4.5, 1.19, -3.8)]
  },
  {
    id: 'warehouse', name: 'Freight Terminal', setting: 'INDOOR', subtitle: 'Crate stacks / crossing lanes',
    sky: 0xc6cbd0, floor: 0xaeb8ba, accent: 0xd8ad61,
    solids: [...stations(), solid('crate', -3.5, -1.8, 1.8, 1.45, 1.8), solid('crate', 2.3, -3.3, 2, 2.3, 1.7),
      solid('crate', -4.6, -5, 1.6, 2.4, 1.4), solid('crate', 4.8, .1, 1.6, .95, 1.6)],
    extras: [extra('pan', -3.5, 1.59, -1.8), extra('bottle', 4.8, 1.12, .1), extra('mug', -3.9, 1.6, -1.8)]
  },
  {
    id: 'street', name: 'After Hours', setting: 'OUTDOOR', subtitle: 'Parked cars / street barricades',
    sky: 0x9ba9bf, floor: 0x727e8a, accent: 0xdfb774,
    solids: [...stations(), solid('car', -4.1, -2.8, 1.9, 1.3, 3.8), solid('car', 4.3, -.3, 1.9, 1.3, 3.8),
      solid('barrier', .4, -4.6, 2.3, .95, .65), solid('planter', -5.1, 1.5, 1.4, .9, 1.1)],
    extras: [extra('bottle', -4.1, 1.49, -2.8), extra('pan', .4, 1.09, -4.6), extra('vase', -5.1, 1.1, 1.5)]
  }
].map(level => ({ ...level, bounds, playerSpawns: [[-1.2, 0, 3.8], [1.2, 0, 3.8]],
  spawns: [[-6.5, 0, -6.4], [0, 0, -6.6], [6.5, 0, -6.4], [-6.6, 0, 0], [6.6, 0, -2.8]],
  items: [...supplies(), ...level.extras] }));

export function levelForWave(wave = 1) { return LEVELS[(Math.max(1, Math.floor(wave)) - 1) % LEVELS.length]; }
