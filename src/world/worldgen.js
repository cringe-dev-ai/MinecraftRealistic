import { Perlin, hash2, hash3, smoothstep, clamp, mix } from './noise.js';
import {
  AIR, WATER, GRASS, DIRT, STONE, SAND, SANDSTONE, SNOW, SNOW_GRASS, GRAVEL, CLAY,
  BEDROCK, LEAVES_OAK, LEAVES_BIRCH, LEAVES_PINE, LOG_OAK, LOG_BIRCH, TALL_GRASS,
  BLOCK_IDS,
} from './blocks.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;
export const SEA_LEVEL = 30;

// Biome ids
export const BIOME = {
  ocean: 0,
  beach: 1,
  meadow: 2,
  forest: 3,
  birch: 4,
  desert: 5,
  taiga: 6,
  snow: 7,
  alpine: 8,
  swamp: 9,
};

export const BIOME_META = {
  [BIOME.ocean]: { name: 'Open Water', tint: [0.8, 0.95, 0.8] },
  [BIOME.beach]: { name: 'Shoreline', tint: [1.0, 0.98, 0.82] },
  [BIOME.meadow]: { name: 'Meadow', tint: [1.02, 1.06, 0.85] },
  [BIOME.forest]: { name: 'Deep Forest', tint: [0.82, 0.97, 0.72] },
  [BIOME.birch]: { name: 'Birch Grove', tint: [1.03, 1.08, 0.82] },
  [BIOME.desert]: { name: 'Dunes', tint: [1.1, 1.0, 0.7] },
  [BIOME.taiga]: { name: 'Taiga', tint: [0.76, 0.92, 0.76] },
  [BIOME.snow]: { name: 'Snowfield', tint: [0.9, 1.0, 0.98] },
  [BIOME.alpine]: { name: 'Alpine Ridge', tint: [0.84, 0.93, 0.86] },
  [BIOME.swamp]: { name: 'Marshland', tint: [0.74, 0.94, 0.72] },
};

const COAL = BLOCK_IDS.coal_ore;
const IRON = BLOCK_IDS.iron_ore;
const ICE = BLOCK_IDS.ice;
const CACTUS = BLOCK_IDS.cactus;
const MOSSY = BLOCK_IDS.mossy_stone;
const PINE = LEAVES_PINE;
const FERN = BLOCK_IDS.fern;
const FLOWER_RED = BLOCK_IDS.flower_red;
const FLOWER_YELLOW = BLOCK_IDS.flower_yellow;
const DEAD_BUSH = BLOCK_IDS.dead_bush;
const MUSHROOM_RED = BLOCK_IDS.mushroom_red;

function idx(x, y, z) {
  return (y << 8) | (z << 4) | x;
}

export class WorldGenerator {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.perlin = new Perlin(this.seed);
    this.tex = new Perlin((this.seed ^ 0x9e3779b9) >>> 0);
    this.moist = new Perlin((this.seed ^ 0x85ebca6b) >>> 0);
    this.misc = new Perlin((this.seed ^ 0xc2b2ae35) >>> 0);
    this.cache = new Map();
    this.spawn = null;
  }

  rawHeight(x, z) {
    const p = this.perlin;
    const continental = p.fbm2(x * 0.0018, z * 0.0018, 4, 2.03, 0.52);
    const hills = p.fbm2(x * 0.017 + 31, z * 0.017 - 17, 4, 2.1, 0.48);
    const ridge = p.ridged2(x * 0.0042 + 7.3, z * 0.0042 - 3.1, 4);
    const detail = p.noise2(x * 0.085, z * 0.085);
    const mountainMask = smoothstep(0.02, 0.55, continental + ridge * 0.28 - 0.05);
    let h = SEA_LEVEL + 2 + continental * 17 + hills * 4.5 + detail * 1.1;
    h += mountainMask * Math.pow(ridge, 1.55) * 32;

    // River valleys, gently incised into lowlands.
    const riverNoise = Math.abs(p.fbm2(x * 0.0013 + 120.5, z * 0.0013 - 50.5, 3, 2.0, 0.55));
    const riverMask = smoothstep(0.065, 0.008, riverNoise) * smoothstep(SEA_LEVEL - 3, SEA_LEVEL + 14, h);
    h -= riverMask * 8;

    // Flatten beaches and the immediate shoreline a touch.
    const shoreBand = smoothstep(SEA_LEVEL + 5, SEA_LEVEL - 2, h);
    h = mix(h, SEA_LEVEL + 1.0, shoreBand * 0.22);
    return h;
  }

  column(x, z) {
    const key = `${x},${z}`;
    let c = this.cache.get(key);
    if (c) return c;
    const raw = this.rawHeight(x, z);
    const h = clamp(Math.round(raw), 2, WORLD_HEIGHT - 12);

    const temp = this.tex.fbm2(x * 0.0011 + 500, z * 0.0011 - 90, 3, 2.0, 0.55)
      - Math.max(0, h - SEA_LEVEL - 10) * 0.006;
    const moist = this.moist.fbm2(x * 0.0013 - 220, z * 0.0013 + 170, 3, 2.0, 0.55);
    const slope = Math.abs(this.rawHeight(x + 2, z) - this.rawHeight(x - 2, z))
      + Math.abs(this.rawHeight(x, z + 2) - this.rawHeight(x, z - 2));

    let biome;
    if (h < SEA_LEVEL - 1) biome = BIOME.ocean;
    else if (h <= SEA_LEVEL + 2) biome = BIOME.beach;
    else if (h > 66) biome = BIOME.snow;
    else if (h > 58) biome = BIOME.alpine;
    else if (temp < -0.18) biome = moist > 0.02 ? BIOME.taiga : BIOME.snow;
    else if (temp > 0.2 && moist < -0.08) biome = BIOME.desert;
    else if (moist > 0.13) biome = BIOME.forest;
    else if (moist > 0.02) biome = fi_birch(x, z) ? BIOME.birch : BIOME.forest;
    else if (moist < -0.16 && temp > 0.02) biome = BIOME.swamp;
    else biome = BIOME.meadow;

    // Surface material selection
    let surface = GRASS;
    let sub = DIRT;
    if (biome === BIOME.ocean) {
      surface = h < SEA_LEVEL - 7 ? GRAVEL : SAND;
      sub = CLAY;
    } else if (biome === BIOME.beach) {
      surface = SAND;
      sub = SANDSTONE;
    } else if (biome === BIOME.desert) {
      surface = SAND;
      sub = SANDSTONE;
    } else if (biome === BIOME.snow) {
      surface = h > 72 ? SNOW : SNOW_GRASS;
      sub = DIRT;
    } else if (biome === BIOME.alpine) {
      surface = slope > 5 ? STONE : (hash2(x, z, this.seed + 3) > 0.4 ? SNOW_GRASS : STONE);
      sub = STONE;
    } else if (biome === BIOME.taiga) {
      surface = moist > 0.12 ? SNOW_GRASS : GRASS;
      sub = DIRT;
    }
    if (slope > 8 && h > SEA_LEVEL + 3 && biome !== BIOME.desert) {
      surface = hash2(x, z, this.seed + 9) > 0.35 ? STONE : MOSSY;
      sub = STONE;
    }
    if (biome === BIOME.swamp && h <= SEA_LEVEL + 2) { surface = GRASS; sub = CLAY; }

    c = { x, z, h, raw, biome, temp, moist, slope, surface, sub };
    if (this.cache.size > 300000) this.cache.clear();
    this.cache.set(key, c);
    return c;
  }

  heightAt(x, z) {
    return this.column(x, z).h;
  }

  biomeAt(x, z) {
    return this.column(x, z).biome;
  }

  treeDensity(biome) {
    switch (biome) {
      case BIOME.forest: return 0.024;
      case BIOME.birch: return 0.018;
      case BIOME.taiga: return 0.024;
      case BIOME.meadow: return 0.004;
      case BIOME.swamp: return 0.012;
      case BIOME.snow: return 0.0025;
      case BIOME.desert: return 0;
      default: return 0.0008;
    }
  }

  // -------------------------------------------------------------------------
  // Chunk generation
  // -------------------------------------------------------------------------
  generateChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const heights = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = ox + x, wz = oz + z;
        const col = this.column(wx, wz);
        const h = col.h;
        heights[z * CHUNK_SIZE + x] = h;
        biomes[z * CHUNK_SIZE + x] = col.biome;

        // Bedrock floor
        blocks[idx(x, 0, z)] = BEDROCK;
        blocks[idx(x, 1, z)] = BEDROCK;
        if (hash3(wx, 2, wz, this.seed) > 0.6) blocks[idx(x, 2, z)] = BEDROCK;

        // Stone core + sparse ore veins
        for (let y = 2; y <= h - 3; y++) {
          let id = STONE;
          const o = hash3(wx, y, wz, this.seed + 11);
          if (y < 48) {
            if (o < 0.0075) id = COAL;
            else if (o < 0.0105) id = IRON;
          }
          blocks[idx(x, y, z)] = id;
        }

        // Sub-surface and surface
        const subDepth = col.biome === BIOME.desert || col.biome === BIOME.beach ? 5 : 3;
        blocks[idx(x, h, z)] = col.surface;
        for (let d = 1; d <= subDepth && h - d > 1; d++) {
          blocks[idx(x, h - d, z)] = d === 1 && col.surface === GRASS ? DIRT : col.sub;
        }
        if (col.biome === BIOME.snow && h > 70) {
          blocks[idx(x, h, z)] = SNOW;
          blocks[idx(x, h - 1, z)] = SNOW;
        }

        // Water / ice
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[idx(x, y, z)] = WATER;
          if (col.temp < -0.2 && h < SEA_LEVEL - 1) blocks[idx(x, SEA_LEVEL, z)] = ICE;
        }
      }
    }

    // Trees and large features (scan a margin so canopies cross chunk edges).
    for (let wz = oz - 3; wz < oz + CHUNK_SIZE + 3; wz++) {
      for (let wx = ox - 3; wx < ox + CHUNK_SIZE + 3; wx++) {
        const col = this.column(wx, wz);
        if (col.h <= SEA_LEVEL + 1) continue;
        const hh = hash2(wx, wz, this.seed + 31);
        const density = this.treeDensity(col.biome);
        if (hh < density) {
          this.placeTree(blocks, ox, oz, wx, wz, col);
        } else if (col.biome === BIOME.desert && hh > 0.996) {
          this.placeCactus(blocks, ox, oz, wx, wz, col.h + 1);
        } else if (hh > 0.9985 && (col.biome === BIOME.meadow || col.biome === BIOME.alpine)) {
          this.placeBoulder(blocks, ox, oz, wx, wz, col.h + 1);
        }
      }
    }

    // Ground cover
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = ox + x, wz = oz + z;
        const h = heights[z * CHUNK_SIZE + x];
        if (h < SEA_LEVEL || h >= WORLD_HEIGHT - 2) continue;
        const top = blocks[idx(x, h, z)];
        const above = blocks[idx(x, h + 1, z)];
        if (above !== AIR) continue;
        const biome = biomes[z * CHUNK_SIZE + x];
        const r = hash2(wx, wz, this.seed + 77);

        if (top === GRASS || top === SNOW_GRASS) {
          if (biome === BIOME.forest || biome === BIOME.birch) {
            if (r < 0.12) blocks[idx(x, h + 1, z)] = r < 0.06 ? FERN : TALL_GRASS;
            else if (r < 0.128) blocks[idx(x, h + 1, z)] = hash2(wx, wz, 5) > 0.5 ? FLOWER_RED : FLOWER_YELLOW;
            else if (r > 0.996) blocks[idx(x, h + 1, z)] = MUSHROOM_RED;
          } else if (biome === BIOME.meadow) {
            if (r < 0.2) blocks[idx(x, h + 1, z)] = TALL_GRASS;
            else if (r < 0.225) blocks[idx(x, h + 1, z)] = hash2(wx, wz, 7) > 0.5 ? FLOWER_YELLOW : FLOWER_RED;
          } else if (biome === BIOME.taiga || biome === BIOME.swamp) {
            if (r < 0.1) blocks[idx(x, h + 1, z)] = r < 0.05 ? FERN : TALL_GRASS;
          } else if (r < 0.025) {
            blocks[idx(x, h + 1, z)] = TALL_GRASS;
          }
          // Rock outcrops
          if (biome === BIOME.alpine && r > 0.94) blocks[idx(x, h + 1, z)] = MOSSY;
        } else if (top === SAND && biome === BIOME.desert && r > 0.997) {
          blocks[idx(x, h + 1, z)] = DEAD_BUSH;
        }
      }
    }

    return { blocks, heights, biomes };
  }

  setLocal(blocks, ox, oz, wx, wy, wz, id, force = false) {
    const lx = wx - ox, lz = wz - oz;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || wy < 0 || wy >= WORLD_HEIGHT) return;
    const i = idx(lx, wy, lz);
    if (force || blocks[i] === AIR || blocks[i] === WATER || blocks[i] === TALL_GRASS) blocks[i] = id;
  }

  placeTree(blocks, ox, oz, wx, wz, col) {
    const r = hash2(wx, wz, this.seed + 131);
    const biome = col.biome;
    let trunkH = 4 + Math.floor(r * 3);
    let leafId = LEAVES_OAK;
    let logId = LOG_OAK;
    let pine = false;
    if (biome === BIOME.birch) { trunkH = 5 + Math.floor(r * 3); leafId = LEAVES_BIRCH; logId = LOG_BIRCH; }
    else if (biome === BIOME.taiga || biome === BIOME.snow) { trunkH = 6 + Math.floor(r * 4); leafId = PINE; logId = LOG_OAK; pine = true; }
    else if (biome === BIOME.swamp) { trunkH = 4 + Math.floor(r * 2); leafId = LEAVES_OAK; }
    const baseY = col.h + 1;

    for (let i = 0; i < trunkH; i++) this.setLocal(blocks, ox, oz, wx, baseY + i, wz, logId, true);

    if (pine) {
      const layers = Math.floor(trunkH * 0.85);
      for (let l = 0; l < layers; l++) {
        const y = baseY + trunkH - 2 - l;
        const radius = Math.max(0, Math.floor((l / layers) * 3.1));
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > radius + 0.5) continue;
            if (dx === 0 && dz === 0 && y < baseY + trunkH) continue;
            this.setLocal(blocks, ox, oz, wx + dx, y, wz + dz, leafId);
          }
        }
      }
      this.setLocal(blocks, ox, oz, wx, baseY + trunkH, wz, leafId);
    } else {
      const topY = baseY + trunkH;
      const radius = 2 + (r > 0.62 ? 1 : 0);
      for (let dy = -2; dy <= 2; dy++) {
        const rr = radius - Math.max(0, Math.abs(dy) - 1) * 0.7;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 1.4);
            if (d > rr + 0.2) continue;
            if (dx === 0 && dz === 0 && dy <= 0) continue;
            if (hash3(wx + dx, topY + dy, wz + dz, this.seed + 5) < 0.08) continue;
            this.setLocal(blocks, ox, oz, wx + dx, topY + dy, wz + dz, leafId);
          }
        }
      }
      // A couple of limbs
      if (r > 0.4) {
        this.setLocal(blocks, ox, oz, wx + 1, baseY + trunkH - 2, wz, logId);
        this.setLocal(blocks, ox, oz, wx - 1, baseY + trunkH - 3, wz + 1, logId);
      }
    }
  }

  placeCactus(blocks, ox, oz, wx, wz, y) {
    const h = 1 + Math.floor(hash2(wx, wz, this.seed + 17) * 3);
    for (let i = 0; i < h; i++) this.setLocal(blocks, ox, oz, wx, y + i, wz, CACTUS, true);
  }

  placeBoulder(blocks, ox, oz, wx, wz, y) {
    const r = 1.4 + hash2(wx, wz, this.seed + 71) * 1.3;
    const mossy = hash2(wx, wz, this.seed + 72) > 0.45;
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.sqrt(dx * dx + dz * dz + dy * dy * 1.5) > r) continue;
          this.setLocal(blocks, ox, oz, wx + dx, y + dy, wz + dz, mossy && dy > 0 ? MOSSY : STONE);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Spawn: find a scenic, walkable overlook near water and mountains.
  // -------------------------------------------------------------------------
  findSpawn() {
    if (this.spawn) return this.spawn;
    let best = null;
    let bestScore = -Infinity;
    for (let radius = 0; radius <= 150; radius += 9) {
      const steps = radius === 0 ? 1 : Math.max(12, Math.floor(radius * 0.7));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + radius * 0.37;
        const x = Math.round(Math.cos(a) * radius + 6);
        const z = Math.round(Math.sin(a) * radius - 4);
        const col = this.column(x, z);
        if (col.h < SEA_LEVEL + 4 || col.h > SEA_LEVEL + 21) continue;
        if (col.slope > 7) continue;
        if (col.biome === BIOME.desert || col.biome === BIOME.ocean || col.biome === BIOME.beach) continue;

        // Flat enough to stand on
        let flat = 0;
        for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [5, 5], [-5, -5]]) {
          flat += Math.abs(this.column(x + dx, z + dz).h - col.h);
        }
        if (flat > 14) continue;

        // Prefer a view over water and mountains in opposite-ish directions.
        let water = 0, mountains = 0, bestWaterAngle = 0;
        for (let a2 = 0; a2 < Math.PI * 2; a2 += Math.PI / 10) {
          const dx = Math.cos(a2), dz = Math.sin(a2);
          for (let d = 16; d <= 70; d += 8) {
            const hh = this.column(x + Math.round(dx * d), z + Math.round(dz * d)).h;
            if (hh < SEA_LEVEL - 1) { water += 34 - Math.min(34, Math.abs(d - 38)) * 0.4; bestWaterAngle = a2; break; }
            if (hh > col.h + 12) { mountains += Math.max(0, hh - 52) * 0.5; break; }
          }
        }
        const score = water * 0.85 + mountains * 0.6 - flat * 2.2 + (col.h - SEA_LEVEL) * 0.7
          + (col.biome === BIOME.forest || col.biome === BIOME.birch ? 6 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { x, z, y: col.h + 1, yaw: Math.atan2(-Math.cos(bestWaterAngle), -Math.sin(bestWaterAngle)), biome: col.biome, score };
        }
      }
      if (best && radius > 90) break;
    }
    if (!best) {
      const col = this.column(0, 0);
      best = { x: 0, z: 0, y: col.h + 1, yaw: Math.PI * 0.25, biome: col.biome, score: 0 };
    }
    this.spawn = best;
    return best;
  }
}

function fi_birch(x, z) {
  return hash2(Math.floor(x / 32), Math.floor(z / 32), 4242) > 0.55;
}

export { idx };
