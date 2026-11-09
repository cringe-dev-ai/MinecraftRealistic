// Voxel block registry. Tile ids index into the generated 8x8 PBR atlas.

export const ATLAS_COLS = 8;

export const TILES = {
  grass_top: 0,
  grass_side: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  sandstone: 5,
  snow: 6,
  snow_side: 7,
  log_oak_side: 8,
  log_oak_top: 9,
  planks_oak: 10,
  leaves_oak: 11,
  gravel: 12,
  cobblestone: 13,
  glass: 14,
  water: 15,
  coal_ore: 16,
  iron_ore: 17,
  clay: 18,
  bedrock: 19,
  tall_grass: 20,
  flower_red: 21,
  flower_yellow: 22,
  log_birch_side: 23,
  log_birch_top: 24,
  leaves_birch: 25,
  leaves_pine: 26,
  mossy_stone: 27,
  path: 28,
  ice: 29,
  bricks: 30,
  stone_bricks: 31,
  dark_planks: 32,
  glowstone: 33,
  copper: 34,
  marble: 35,
  red_sand: 36,
  cactus_side: 37,
  cactus_top: 38,
  dead_bush: 39,
  fern: 40,
  mushroom_red: 41,
  mushroom_brown: 42,
  basalt: 43,
  terracotta: 44,
  wool: 45,
};

// kind: solid | plant | water | air
// render: opaque | cutout | glass | water | plant
// tint: grass | leaves | pine | none
const defs = [
  { id: 0, key: 'air', name: 'Air', kind: 'air', render: 'none' },
  { id: 1, key: 'grass', name: 'Grass Block', kind: 'solid', render: 'opaque', hardness: 0.6, tiles: { top: TILES.grass_top, side: TILES.grass_side, bottom: TILES.dirt }, tint: 'grass', color: [0.42, 0.55, 0.3] },
  { id: 2, key: 'dirt', name: 'Dirt', kind: 'solid', render: 'opaque', hardness: 0.5, tiles: { all: TILES.dirt }, color: [0.42, 0.31, 0.22] },
  { id: 3, key: 'stone', name: 'Stone', kind: 'solid', render: 'opaque', hardness: 1.7, tiles: { all: TILES.stone }, color: [0.45, 0.45, 0.44] },
  { id: 4, key: 'cobblestone', name: 'Cobblestone', kind: 'solid', render: 'opaque', hardness: 1.6, tiles: { all: TILES.cobblestone }, color: [0.42, 0.42, 0.41] },
  { id: 5, key: 'sand', name: 'Sand', kind: 'solid', render: 'opaque', hardness: 0.5, tiles: { all: TILES.sand }, color: [0.76, 0.68, 0.48] },
  { id: 6, key: 'sandstone', name: 'Sandstone', kind: 'solid', render: 'opaque', hardness: 1.2, tiles: { top: TILES.sandstone, side: TILES.sandstone, bottom: TILES.sandstone }, color: [0.72, 0.63, 0.44] },
  { id: 7, key: 'gravel', name: 'Gravel', kind: 'solid', render: 'opaque', hardness: 0.7, tiles: { all: TILES.gravel }, color: [0.47, 0.45, 0.42] },
  { id: 8, key: 'clay', name: 'Clay', kind: 'solid', render: 'opaque', hardness: 0.7, tiles: { all: TILES.clay }, color: [0.55, 0.56, 0.58] },
  { id: 9, key: 'snow_grass', name: 'Snowy Turf', kind: 'solid', render: 'opaque', hardness: 0.6, tiles: { top: TILES.snow, side: TILES.snow_side, bottom: TILES.dirt }, color: [0.83, 0.86, 0.87] },
  { id: 10, key: 'snow', name: 'Snow Block', kind: 'solid', render: 'opaque', hardness: 0.5, tiles: { all: TILES.snow }, color: [0.88, 0.91, 0.92] },
  { id: 11, key: 'log_oak', name: 'Oak Log', kind: 'solid', render: 'opaque', hardness: 1.3, tiles: { top: TILES.log_oak_top, side: TILES.log_oak_side, bottom: TILES.log_oak_top }, color: [0.38, 0.29, 0.18] },
  { id: 12, key: 'planks_oak', name: 'Oak Planks', kind: 'solid', render: 'opaque', hardness: 1.1, tiles: { all: TILES.planks_oak }, color: [0.55, 0.4, 0.24] },
  { id: 13, key: 'leaves_oak', name: 'Oak Leaves', kind: 'solid', render: 'cutout', hardness: 0.35, tiles: { all: TILES.leaves_oak }, tint: 'leaves', color: [0.24, 0.42, 0.16] },
  { id: 14, key: 'log_birch', name: 'Birch Log', kind: 'solid', render: 'opaque', hardness: 1.2, tiles: { top: TILES.log_birch_top, side: TILES.log_birch_side, bottom: TILES.log_birch_top }, color: [0.72, 0.7, 0.62] },
  { id: 15, key: 'leaves_birch', name: 'Birch Leaves', kind: 'solid', render: 'cutout', hardness: 0.35, tiles: { all: TILES.leaves_birch }, tint: 'leaves', color: [0.42, 0.56, 0.24] },
  { id: 16, key: 'leaves_pine', name: 'Pine Needles', kind: 'solid', render: 'cutout', hardness: 0.35, tiles: { all: TILES.leaves_pine }, tint: 'pine', color: [0.16, 0.3, 0.16] },
  { id: 17, key: 'glass', name: 'Glass', kind: 'solid', render: 'glass', hardness: 0.4, tiles: { all: TILES.glass }, color: [0.72, 0.82, 0.84] },
  { id: 18, key: 'water', name: 'Water', kind: 'water', render: 'water', hardness: -1, tiles: { all: TILES.water }, color: [0.18, 0.42, 0.47] },
  { id: 19, key: 'coal_ore', name: 'Coal Ore', kind: 'solid', render: 'opaque', hardness: 2.1, tiles: { all: TILES.coal_ore }, color: [0.3, 0.3, 0.3] },
  { id: 20, key: 'iron_ore', name: 'Iron Ore', kind: 'solid', render: 'opaque', hardness: 2.4, tiles: { all: TILES.iron_ore }, color: [0.55, 0.48, 0.4] },
  { id: 21, key: 'bedrock', name: 'Bedrock', kind: 'solid', render: 'opaque', hardness: -1, tiles: { all: TILES.bedrock }, color: [0.18, 0.18, 0.19] },
  { id: 22, key: 'tall_grass', name: 'Meadow Grass', kind: 'plant', render: 'plant', hardness: 0.06, tiles: { all: TILES.tall_grass }, tint: 'grass', color: [0.35, 0.5, 0.22] },
  { id: 23, key: 'flower_red', name: 'Poppy', kind: 'plant', render: 'plant', hardness: 0.06, tiles: { all: TILES.flower_red }, color: [0.62, 0.2, 0.16] },
  { id: 24, key: 'flower_yellow', name: 'Buttercup', kind: 'plant', render: 'plant', hardness: 0.06, tiles: { all: TILES.flower_yellow }, color: [0.79, 0.65, 0.18] },
  { id: 25, key: 'fern', name: 'Fern', kind: 'plant', render: 'plant', hardness: 0.06, tiles: { all: TILES.fern }, tint: 'leaves', color: [0.3, 0.46, 0.2] },
  { id: 26, key: 'mossy_stone', name: 'Mossy Stone', kind: 'solid', render: 'opaque', hardness: 1.7, tiles: { top: TILES.mossy_stone, side: TILES.mossy_stone, bottom: TILES.stone }, color: [0.38, 0.44, 0.33] },
  { id: 27, key: 'path', name: 'Dirt Path', kind: 'solid', render: 'opaque', hardness: 0.5, tiles: { top: TILES.path, side: TILES.dirt, bottom: TILES.dirt }, color: [0.5, 0.41, 0.28] },
  { id: 28, key: 'ice', name: 'Ice', kind: 'solid', render: 'glass', hardness: 0.5, tiles: { all: TILES.ice }, color: [0.6, 0.76, 0.82] },
  { id: 29, key: 'bricks', name: 'Bricks', kind: 'solid', render: 'opaque', hardness: 1.7, tiles: { all: TILES.bricks }, color: [0.55, 0.28, 0.2] },
  { id: 30, key: 'stone_bricks', name: 'Stone Bricks', kind: 'solid', render: 'opaque', hardness: 1.7, tiles: { all: TILES.stone_bricks }, color: [0.43, 0.43, 0.42] },
  { id: 31, key: 'dark_planks', name: 'Dark Planks', kind: 'solid', render: 'opaque', hardness: 1.2, tiles: { all: TILES.dark_planks }, color: [0.3, 0.24, 0.18] },
  { id: 32, key: 'glowstone', name: 'Glowstone', kind: 'solid', render: 'opaque', hardness: 0.5, emissive: 1.0, tiles: { all: TILES.glowstone }, color: [0.85, 0.68, 0.3] },
  { id: 33, key: 'copper', name: 'Copper Block', kind: 'solid', render: 'opaque', hardness: 1.8, tiles: { all: TILES.copper }, color: [0.6, 0.42, 0.3] },
  { id: 34, key: 'marble', name: 'Marble', kind: 'solid', render: 'opaque', hardness: 1.5, tiles: { all: TILES.marble }, color: [0.8, 0.79, 0.74] },
  { id: 35, key: 'red_sand', name: 'Red Sand', kind: 'solid', render: 'opaque', hardness: 0.5, tiles: { all: TILES.red_sand }, color: [0.68, 0.42, 0.25] },
  { id: 36, key: 'cactus', name: 'Cactus', kind: 'solid', render: 'cutout', hardness: 0.5, tiles: { top: TILES.cactus_top, side: TILES.cactus_side, bottom: TILES.cactus_top }, color: [0.33, 0.47, 0.24] },
  { id: 37, key: 'dead_bush', name: 'Dead Bush', kind: 'plant', render: 'plant', hardness: 0.05, tiles: { all: TILES.dead_bush }, color: [0.55, 0.43, 0.25] },
  { id: 38, key: 'mushroom_red', name: 'Red Mushroom', kind: 'plant', render: 'plant', hardness: 0.05, tiles: { all: TILES.mushroom_red }, color: [0.65, 0.2, 0.16] },
  { id: 39, key: 'mushroom_brown', name: 'Brown Mushroom', kind: 'plant', render: 'plant', hardness: 0.05, tiles: { all: TILES.mushroom_brown }, color: [0.58, 0.5, 0.4] },
  { id: 40, key: 'basalt', name: 'Basalt', kind: 'solid', render: 'opaque', hardness: 1.9, tiles: { all: TILES.basalt }, color: [0.28, 0.29, 0.31] },
  { id: 41, key: 'terracotta', name: 'Terracotta', kind: 'solid', render: 'opaque', hardness: 1.4, tiles: { all: TILES.terracotta }, color: [0.6, 0.38, 0.28] },
  { id: 42, key: 'wool', name: 'Wool', kind: 'solid', render: 'opaque', hardness: 0.4, tiles: { all: TILES.wool }, color: [0.87, 0.87, 0.83] },
];

export const BLOCKS = [];
export const BLOCK_IDS = {};

for (const d of defs) {
  const tiles = d.tiles || {};
  const b = {
    ...d,
    solid: d.kind === 'solid',
    opaque: d.render === 'opaque' || d.render === 'cutout',
    liquid: d.kind === 'water',
    plant: d.kind === 'plant',
    tiles: {
      top: tiles.top ?? tiles.all ?? 0,
      bottom: tiles.bottom ?? tiles.all ?? 0,
      side: tiles.side ?? tiles.all ?? 0,
    },
    color: d.color || [0.5, 0.5, 0.5],
  };
  BLOCKS[b.id] = b;
  BLOCK_IDS[b.key] = b.id;
}

export const AIR = 0;
export const WATER = BLOCK_IDS.water;
export const GRASS = BLOCK_IDS.grass;
export const DIRT = BLOCK_IDS.dirt;
export const STONE = BLOCK_IDS.stone;
export const SAND = BLOCK_IDS.sand;
export const SNOW = BLOCK_IDS.snow;
export const SNOW_GRASS = BLOCK_IDS.snow_grass;
export const SANDSTONE = BLOCK_IDS.sandstone;
export const GRAVEL = BLOCK_IDS.gravel;
export const CLAY = BLOCK_IDS.clay;
export const BEDROCK = BLOCK_IDS.bedrock;
export const LEAVES_OAK = BLOCK_IDS.leaves_oak;
export const LEAVES_BIRCH = BLOCK_IDS.leaves_birch;
export const LEAVES_PINE = BLOCK_IDS.leaves_pine;
export const LOG_OAK = BLOCK_IDS.log_oak;
export const LOG_BIRCH = BLOCK_IDS.log_birch;
export const TALL_GRASS = BLOCK_IDS.tall_grass;
export const CACTUS = BLOCK_IDS.cactus;
export const GLOWSTONE = BLOCK_IDS.glowstone;

export function getBlockDef(id) {
  return BLOCKS[id] || BLOCKS[0];
}

export function isSolid(id) {
  return id !== 0 && BLOCKS[id] && BLOCKS[id].solid;
}

export function isOpaque(id) {
  return id !== 0 && BLOCKS[id] && BLOCKS[id].opaque;
}

export function isPlant(id) {
  return id !== 0 && BLOCKS[id] && BLOCKS[id].plant;
}

export function isLiquid(id) {
  return id !== 0 && BLOCKS[id] && BLOCKS[id].liquid;
}

export const HOTBAR_DEFAULT = [
  BLOCK_IDS.grass,
  BLOCK_IDS.stone,
  BLOCK_IDS.planks_oak,
  BLOCK_IDS.log_oak,
  BLOCK_IDS.glass,
  BLOCK_IDS.glowstone,
  BLOCK_IDS.sand,
  BLOCK_IDS.bricks,
  BLOCK_IDS.leaves_oak,
];

export const INVENTORY_BLOCKS = defs
  .filter((d) => d.id !== 0 && d.id !== 18 && d.id !== 21)
  .map((d) => d.id);
