import * as THREE from 'three';
import { getBlockDef, TILES, ATLAS_COLS, BLOCKS } from '../world/blocks.js';

// ---------------------------------------------------------------------------
// Procedural PBR texture atlas (albedo + normal + roughness).
// Every material in TerraVista is generated at boot: no external assets.
// Tiles are 64px square with an 8px replicated gutter to keep mipmaps clean.
// ---------------------------------------------------------------------------

export const TILE_SIZE = 64;
export const PAD = 8;
export const CELL = TILE_SIZE + PAD * 2; // 80
export const ATLAS_SIZE = CELL * ATLAS_COLS; // 640

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const rgb = (r, g, b) => [r, g, b];
const shade = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
const blend = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function ihash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Tileable value noise. u,v in [0,1); freq is integer lattice count.
function vnoise(u, v, freq, seed) {
  const x = u * freq, y = v * freq;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const i0 = ((x0 % freq) + freq) % freq;
  const j0 = ((y0 % freq) + freq) % freq;
  const i1 = (i0 + 1) % freq;
  const j1 = (j0 + 1) % freq;
  const a = ihash(i0, j0, seed), b = ihash(i1, j0, seed);
  const c = ihash(i0, j1, seed), d = ihash(i1, j1, seed);
  return mix(mix(a, b, fx), mix(c, d, fx), fy);
}

function fbmTile(u, v, baseFreq, oct, seed, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = baseFreq;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(u, v, f, seed + i * 37) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

function ridgedTile(u, v, baseFreq, oct, seed) {
  let sum = 0, amp = 0.55, norm = 0, f = baseFreq, prev = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(u, v, f, seed + i * 11) * 2 - 1);
    n *= n;
    sum += n * amp * prev;
    norm += amp;
    prev = n;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function voronoiTile(u, v, cells, seed) {
  const x = u * cells, y = v * cells;
  const ci = Math.floor(x), cj = Math.floor(y);
  let best = 1e9, second = 1e9, id = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const gi = ci + di, gj = cj + dj;
      const wi = ((gi % cells) + cells) % cells;
      const wj = ((gj % cells) + cells) % cells;
      const px = gi + 0.15 + ihash(wi, wj, seed) * 0.7;
      const py = gj + 0.15 + ihash(wi, wj, seed + 91) * 0.7;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) { second = best; best = d; id = wi * 31 + wj; }
      else if (d < second) second = d;
    }
  }
  return { d: Math.sqrt(best), edge: Math.sqrt(second) - Math.sqrt(best), id: ihash(id, 7, seed) };
}

// ---------------------------------------------------------------------------
// Tile painters: (u,v) -> { c:[r,g,b], a, h, r }
// ---------------------------------------------------------------------------
const P = {};

P[TILES.grass_top] = (u, v) => {
  const n = fbmTile(u, v, 6, 4, 11);
  const fine = fbmTile(u, v, 24, 2, 22);
  const blade = ihash(Math.floor(u * 64), Math.floor(v * 64), 5);
  let c = blend([72, 102, 45], [42, 68, 29], n);
  c = blend(c, [98, 128, 58], fine * 0.55);
  if (blade > 0.82) c = shade(c, 1.16);
  else if (blade < 0.14) c = shade(c, 0.84);
  return { c, a: 1, h: n * 0.45 + fine * 0.25 + blade * 0.22, r: 0.95 };
};

P[TILES.grass_side] = (u, v) => {
  const n = fbmTile(u, v, 6, 4, 13);
  const fine = fbmTile(u, v, 22, 2, 31);
  const fringe = 0.16 + fbmTile(u, 0.5, 7, 3, 55) * 0.1;
  let c;
  let h;
  if (v < fringe) {
    c = blend([70, 101, 44], [45, 70, 30], n);
    c = blend(c, [99, 129, 59], fine * 0.5);
    h = 0.7 + fine * 0.2;
  } else {
    c = blend([82, 60, 40], [58, 42, 28], n);
    c = blend(c, [108, 82, 55], fine * 0.45);
    const pebble = ihash(Math.floor(u * 64), Math.floor(v * 64), 77);
    if (pebble > 0.93) c = shade(c, 1.22);
    h = n * 0.6 + fine * 0.2;
    // dangling grass strands
    const strand = ihash(Math.floor(u * 64), 9, 101);
    if (strand > 0.72 && v < fringe + 0.06 + strand * 0.1) c = blend(c, [62, 88, 38], 0.75);
  }
  return { c, a: 1, h, r: 0.95 };
};

P[TILES.dirt] = (u, v) => {
  const n = fbmTile(u, v, 7, 4, 201);
  const fine = fbmTile(u, v, 26, 2, 207);
  let c = blend([92, 67, 44], [62, 46, 31], n);
  c = blend(c, [117, 89, 62], fine * 0.45);
  const p = ihash(Math.floor(u * 64), Math.floor(v * 64), 88);
  if (p > 0.95) c = shade(c, 1.25);
  return { c, a: 1, h: n * 0.65 + fine * 0.25 + p * 0.1, r: 0.97 };
};

P[TILES.stone] = (u, v) => {
  const n = fbmTile(u, v, 5, 5, 300);
  const fine = fbmTile(u, v, 23, 2, 311);
  const crack = ridgedTile(u, v, 4, 3, 317);
  let c = blend([118, 117, 112], [85, 85, 82], n);
  c = blend(c, [132, 131, 126], fine * 0.4);
  if (crack > 0.82) c = shade(c, 0.66);
  if (fine > 0.8) c = shade(c, 1.12);
  return { c, a: 1, h: n * 0.55 + fine * 0.2 - (crack > 0.82 ? 0.28 : 0), r: 0.88 };
};

P[TILES.cobblestone] = (u, v) => {
  const cell = voronoiTile(u, v, 5, 401);
  const n = fbmTile(u, v, 14, 2, 405);
  const mortar = cell.edge < 0.075;
  let c = mortar ? [72, 72, 69] : blend([116, 115, 110], [80, 80, 78], cell.id * 0.8 + n * 0.3);
  if (!mortar) c = blend(c, [142, 141, 135], n * 0.25);
  const h = mortar ? 0.08 : 0.55 + cell.id * 0.25 + n * 0.2;
  return { c, a: 1, h, r: mortar ? 0.98 : 0.9 };
};

P[TILES.sand] = (u, v) => {
  const n = fbmTile(u, v, 8, 4, 501);
  const fine = fbmTile(u, v, 30, 2, 509);
  const ripple = Math.sin((v * 9 + n * 2.2) * Math.PI * 2) * 0.5 + 0.5;
  let c = blend([214, 197, 148], [189, 168, 118], n);
  c = blend(c, [228, 213, 170], ripple * 0.3);
  const grit = ihash(Math.floor(u * 64), Math.floor(v * 64), 517);
  if (grit > 0.9) c = shade(c, 1.1);
  else if (grit < 0.08) c = shade(c, 0.9);
  return { c, a: 1, h: ripple * 0.35 + n * 0.3 + grit * 0.15, r: 0.95 };
};

P[TILES.sandstone] = (u, v) => {
  const bands = Math.floor(v * 7) / 7;
  const n = fbmTile(u, v, 9, 3, 601);
  const layer = Math.sin(v * Math.PI * 2 * 5) * 0.5 + 0.5;
  let c = blend([204, 181, 129], [168, 144, 99], bands * 0.5 + n * 0.35);
  c = blend(c, [222, 201, 152], layer * 0.2);
  const groove = v < 0.03 || (v > 0.25 && v < 0.28);
  if (groove) c = shade(c, 0.8);
  return { c, a: 1, h: layer * 0.3 + n * 0.3 - (groove ? 0.2 : 0), r: 0.92 };
};

P[TILES.snow] = (u, v) => {
  const n = fbmTile(u, v, 7, 4, 701);
  const fine = fbmTile(u, v, 26, 2, 709);
  let c = blend([238, 242, 244], [207, 219, 227], n * 0.8);
  const sparkle = ihash(Math.floor(u * 64), Math.floor(v * 64), 717);
  if (sparkle > 0.965) c = [255, 255, 255];
  c = blend(c, [255, 255, 255], fine * 0.25);
  return { c, a: 1, h: n * 0.4 + fine * 0.2 + (sparkle > 0.965 ? 0.3 : 0), r: 0.72 };
};

P[TILES.snow_side] = (u, v) => {
  const n = fbmTile(u, v, 8, 3, 721);
  const fringe = 0.2 + fbmTile(u, 0.5, 7, 3, 733) * 0.1;
  if (v < fringe) {
    return { c: blend([240, 244, 246], [210, 222, 230], n), a: 1, h: 0.7, r: 0.75 };
  }
  let c = blend([86, 64, 44], [60, 45, 31], n);
  c = blend(c, [106, 82, 58], fbmTile(u, v, 21, 2, 741) * 0.4);
  return { c, a: 1, h: 0.4 + n * 0.3, r: 0.96 };
};

P[TILES.log_oak_side] = (u, v) => {
  const grain = fbmTile(u * 3.4, v * 0.45, 8, 3, 801);
  const bark = ridgedTile(u * 4.5, v * 0.7, 6, 3, 809);
  let c = blend([96, 70, 42], [58, 42, 27], grain);
  c = blend(c, [122, 92, 58], bark * 0.35);
  if (ihash(Math.floor(u * 30), Math.floor(v * 64), 817) > 0.94) c = shade(c, 0.7);
  return { c, a: 1, h: grain * 0.5 + bark * 0.45, r: 0.94 };
};

P[TILES.log_oak_top] = (u, v) => {
  const dx = u - 0.5, dy = v - 0.5;
  const d = Math.sqrt(dx * dx + dy * dy);
  const ring = Math.sin(d * 48 + fbmTile(u, v, 9, 2, 821) * 7) * 0.5 + 0.5;
  let c = blend([142, 108, 66], [96, 70, 42], ring * 0.6 + d * 1.1);
  c = blend(c, [162, 128, 82], (1 - d) * 0.25);
  return { c, a: 1, h: ring * 0.5 + (1 - d) * 0.3, r: 0.93 };
};

P[TILES.log_birch_side] = (u, v) => {
  const n = fbmTile(u, v, 7, 3, 901);
  let c = blend([220, 218, 204], [186, 184, 170], n);
  c = blend(c, [235, 233, 222], fbmTile(u, v, 24, 2, 909) * 0.4);
  const dash = ihash(Math.floor(u * 22), Math.floor(v * 10), 917);
  if (dash > 0.82) c = blend(c, [58, 56, 50], 0.9);
  return { c, a: 1, h: n * 0.5 + (dash > 0.82 ? -0.1 : 0), r: 0.92 };
};

P[TILES.log_birch_top] = (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5);
  const ring = Math.sin(d * 44 + fbmTile(u, v, 8, 2, 921) * 6) * 0.5 + 0.5;
  let c = blend([214, 202, 170], [166, 148, 116], ring * 0.5 + d);
  return { c, a: 1, h: ring * 0.4, r: 0.92 };
};

function leafPainter(base, dark, light, seed, hole = 0.34) {
  return (u, v) => {
    const cluster = fbmTile(u, v, 7, 3, seed);
    const detail = fbmTile(u, v, 26, 2, seed + 5);
    const vein = Math.abs(Math.sin((u * 8 + v * 5 + cluster * 2) * Math.PI));
    let c = blend(dark, base, clamp01((cluster - 0.15) * 1.8));
    c = blend(c, light, Math.max(0, detail - 0.48) * 1.4);
    if (vein < 0.06) c = shade(c, 0.8);
    const a = cluster > hole ? 1 : 0;
    return { c, a, h: cluster * 0.8 + detail * 0.2, r: 0.88 };
  };
}

P[TILES.leaves_oak] = leafPainter([54, 92, 38], [27, 52, 22], [92, 126, 52], 1001, 0.33);
P[TILES.leaves_birch] = leafPainter([98, 128, 54], [58, 84, 34], [139, 166, 78], 1101, 0.36);
P[TILES.leaves_pine] = leafPainter([34, 64, 38], [16, 33, 20], [58, 90, 48], 1201, 0.28);

P[TILES.planks_oak] = (u, v) => {
  const board = Math.floor(v * 4);
  const seam = Math.abs((v * 4) % 1) < 0.045 || Math.abs((v * 4) % 1) > 0.955;
  const grain = fbmTile(u * 6, v * 1.4 + board, 8, 3, 1301);
  let c = blend([164, 126, 76], [126, 94, 55], grain);
  c = blend(c, [186, 148, 92], fbmTile(u, v, 22, 2, 1309) * 0.35);
  const knot = ihash(Math.floor(u * 5) + board * 13, board, 1317);
  if (knot > 0.9) c = shade(c, 0.78);
  if (seam) c = shade(c, 0.62);
  return { c, a: 1, h: grain * 0.35 - (seam ? 0.3 : 0), r: 0.85 };
};

P[TILES.dark_planks] = (u, v) => {
  const board = Math.floor(v * 4);
  const grain = fbmTile(u * 6, v * 1.3 + board, 7, 3, 1321);
  const seam = Math.abs((v * 4) % 1) < 0.05;
  let c = blend([92, 71, 50], [62, 47, 32], grain);
  c = blend(c, [110, 86, 60], fbmTile(u, v, 20, 2, 1329) * 0.3);
  if (seam) c = shade(c, 0.6);
  return { c, a: 1, h: grain * 0.3 - (seam ? 0.25 : 0), r: 0.88 };
};

P[TILES.gravel] = (u, v) => {
  const cell = voronoiTile(u, v, 9, 1401);
  const n = fbmTile(u, v, 20, 2, 1405);
  let c = blend([106, 102, 96], [64, 62, 59], cell.id * 0.7 + n * 0.3);
  if (cell.edge < 0.05) c = [48, 47, 45];
  if (cell.id > 0.85) c = blend(c, [138, 130, 118], 0.4);
  return { c, a: 1, h: cell.edge < 0.05 ? 0.1 : 0.5 + cell.id * 0.3, r: 0.95 };
};

P[TILES.clay] = (u, v) => {
  const n = fbmTile(u, v, 9, 3, 1501);
  let c = blend([158, 162, 164], [126, 132, 137], n);
  c = blend(c, [178, 181, 181], fbmTile(u, v, 24, 2, 1509) * 0.3);
  return { c, a: 1, h: n * 0.35, r: 0.92 };
};

P[TILES.glass] = (u, v) => {
  const edge = u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94;
  const streak = Math.abs(u - v * 0.7 - 0.16) < 0.035;
  const n = fbmTile(u, v, 12, 2, 1601);
  let a = 0.08 + n * 0.05;
  let c = [206, 226, 232];
  if (edge) { a = 0.55; c = [198, 220, 226]; }
  if (streak) { a = 0.22; c = [235, 248, 250]; }
  return { c, a, h: 0.5, r: 0.08 };
};

P[TILES.water] = (u, v) => {
  const n = fbmTile(u, v, 8, 3, 1701);
  return { c: blend([46, 106, 122], [26, 72, 92], n), a: 0.8, h: n * 0.3, r: 0.15 };
};

P[TILES.coal_ore] = (u, v) => {
  const n = fbmTile(u, v, 6, 4, 1801);
  const blob = fbmTile(u, v, 9, 2, 1805);
  let c = blend([112, 111, 107], [82, 82, 80], n);
  if (blob > 0.6) c = blend([34, 34, 35], [18, 18, 19], (blob - 0.6) * 2.4);
  return { c, a: 1, h: n * 0.45 + (blob > 0.6 ? 0.15 : 0), r: 0.82 };
};

P[TILES.iron_ore] = (u, v) => {
  const n = fbmTile(u, v, 6, 4, 1901);
  const blob = fbmTile(u, v, 8, 3, 1905);
  let c = blend([112, 111, 107], [82, 82, 80], n);
  if (blob > 0.58) c = blend([188, 154, 116], [142, 108, 76], (blob - 0.58) * 2.2);
  return { c, a: 1, h: n * 0.45 + (blob > 0.58 ? 0.15 : 0), r: 0.8 };
};

P[TILES.bedrock] = (u, v) => {
  const cell = voronoiTile(u, v, 6, 2001);
  const n = fbmTile(u, v, 12, 3, 2005);
  let c = blend([62, 62, 64], [28, 28, 30], cell.id * 0.7 + n * 0.3);
  if (cell.edge < 0.04) c = [16, 16, 18];
  return { c, a: 1, h: 0.3 + cell.id * 0.4, r: 0.9 };
};

P[TILES.tall_grass] = (u, v) => {
  const px = u * 64;
  const bladeId = Math.floor(px / 3);
  const jitter = ihash(bladeId, 3, 2101);
  const center = (bladeId + 0.5) * 3 / 64 + (jitter - 0.5) * 0.02;
  const width = 0.008 + jitter * 0.012;
  const top = 0.05 + jitter * 0.42;
  const bend = Math.sin(v * 2.2 + jitter * 5) * 0.03 + (1 - v) * 0.02;
  const inside = Math.abs(u - center - bend * (1 - v)) < width;
  if (!inside || v < top) return { c: [0, 0, 0], a: 0, h: 0, r: 1 };
  const shadeN = 0.7 + (1 - v) * 0.5;
  const c = [66 * shadeN, 106 * shadeN, 44 * shadeN];
  return { c, a: 1, h: 0.5, r: 0.9 };
};

function flowerPainter(petal, center, seed) {
  return (u, v) => {
    const dx = Math.abs(u - 0.5), dy = Math.abs(v - 0.26);
    const stem = dx < 0.017 && v > 0.24 && v < 0.98;
    const leaf = (dy > 0.25 && dy < 0.35 && dx > 0.02 && dx < 0.13);
    const petalR = Math.hypot((u - 0.5) * 1.3, (v - 0.26) * 1.9);
    const petals = petalR < 0.14 && !(petalR < 0.045);
    const core = petalR < 0.045;
    if (core) return { c: center, a: 1, h: 0.6, r: 0.7 };
    if (petals) {
      const n = fbmTile(u, v, 20, 2, seed);
      return { c: blend(petal, [255, 245, 220], n * 0.25), a: 1, h: 0.7, r: 0.7 };
    }
    if (leaf) return { c: [58, 96, 40], a: 1, h: 0.5, r: 0.9 };
    if (stem) return { c: [54, 88, 36], a: 1, h: 0.5, r: 0.9 };
    return { c: [0, 0, 0], a: 0, h: 0, r: 1 };
  };
}

P[TILES.flower_red] = flowerPainter([196, 54, 48], [228, 190, 80], 2201);
P[TILES.flower_yellow] = flowerPainter([232, 192, 58], [120, 80, 30], 2301);

P[TILES.fern] = (u, v) => {
  const bladeId = Math.floor((u * 64) / 4);
  const jitter = ihash(bladeId, 5, 2401);
  const top = 0.12 + jitter * 0.32;
  const center = (bladeId + 0.5) * 4 / 64 + (jitter - 0.5) * 0.015;
  const width = 0.012 + jitter * 0.008;
  const leaflet = Math.sin(v * 40 + jitter * 4) * 0.012;
  const inside = Math.abs(u - center - leaflet) < width;
  if (!inside || v < top) {
    // little side leaflets
    if (v > top && v < 0.92 && Math.abs(u - center) < 0.035 + (1 - v) * 0.02) {
      const c = [46, 78, 34];
      return { c, a: 1, h: 0.5, r: 0.9 };
    }
    return { c: [0, 0, 0], a: 0, h: 0, r: 1 };
  }
  const c = [52 + (1 - v) * 20, 88 + (1 - v) * 18, 38];
  return { c, a: 1, h: 0.5, r: 0.9 };
};

P[TILES.mossy_stone] = (u, v) => {
  const stone = P[TILES.stone](u, v);
  const moss = fbmTile(u, v, 6, 3, 2501);
  const patch = fbmTile(u, v, 3, 2, 2509);
  if (patch + moss * 0.5 > 0.75) {
    return { c: blend([74, 96, 50], [48, 68, 34], moss), a: 1, h: stone.h + 0.2, r: 0.95 };
  }
  return stone;
};

P[TILES.path] = (u, v) => {
  const dirt = P[TILES.dirt](u, v);
  const n = fbmTile(u, v, 10, 3, 2601);
  const edge = Math.min(u, 1 - u, v, 1 - v) < 0.07;
  const c = blend(dirt.c, [126, 104, 72], n * 0.3);
  return { c: edge ? shade(c, 0.72) : c, a: 1, h: dirt.h, r: 0.95 };
};

P[TILES.ice] = (u, v) => {
  const n = fbmTile(u, v, 5, 3, 2701);
  const crack = ridgedTile(u, v, 5, 2, 2705);
  let c = blend([186, 220, 234], [136, 182, 208], n);
  if (crack > 0.84) c = [232, 246, 252];
  return { c, a: 0.85, h: crack > 0.84 ? 0.4 : n * 0.2, r: 0.06 };
};

P[TILES.bricks] = (u, v) => {
  const row = Math.floor(v * 8);
  const offset = row % 2 === 0 ? 0 : 0.5;
  const bx = (u * 4 + offset) % 1;
  const by = (v * 8) % 1;
  const mortar = bx < 0.045 || by < 0.09;
  const n = fbmTile(u, v, 20, 3, 2801);
  let c = mortar ? [178, 168, 150] : blend([154, 78, 57], [120, 54, 42], n);
  if (!mortar) c = blend(c, [180, 104, 74], n * 0.2);
  return { c, a: 1, h: mortar ? 0.2 : 0.55 + n * 0.2, r: mortar ? 0.95 : 0.85 };
};

P[TILES.stone_bricks] = (u, v) => {
  const row = Math.floor(v * 4);
  const offset = row % 2 === 0 ? 0 : 0.5;
  const bx = (u * 2 + offset) % 1;
  const by = (v * 4) % 1;
  const mortar = bx < 0.035 || by < 0.055;
  const n = fbmTile(u, v, 15, 3, 2901);
  let c = mortar ? [68, 68, 66] : blend([116, 115, 111], [89, 88, 85], n);
  return { c, a: 1, h: mortar ? 0.1 : 0.5 + n * 0.25, r: 0.9 };
};

P[TILES.glowstone] = (u, v) => {
  const cell = voronoiTile(u, v, 6, 3001);
  const n = fbmTile(u, v, 14, 3, 3005);
  let c = blend([232, 190, 96], [186, 122, 48], cell.id * 0.7 + n * 0.3);
  if (cell.edge < 0.05) c = [112, 68, 30];
  if (cell.id > 0.8) c = blend(c, [255, 234, 168], 0.6);
  return { c, a: 1, h: cell.edge < 0.05 ? 0.2 : 0.55 + cell.id * 0.25, r: 0.55 };
};

P[TILES.copper] = (u, v) => {
  const n = fbmTile(u, v, 8, 3, 3101);
  const patina = fbmTile(u, v, 5, 2, 3105);
  let c = blend([188, 116, 78], [148, 84, 54], n);
  if (patina > 0.62) c = blend(c, [86, 142, 116], (patina - 0.62) * 2.1);
  return { c, a: 1, h: n * 0.35, r: 0.62 };
};

P[TILES.marble] = (u, v) => {
  const n = fbmTile(u, v, 4, 4, 3201);
  const vein = Math.abs(fbmTile(u, v, 3, 3, 3205) - 0.5);
  let c = blend([226, 223, 215], [190, 188, 181], n);
  if (vein < 0.035) c = [136, 136, 132];
  return { c, a: 1, h: n * 0.25 - (vein < 0.035 ? 0.1 : 0), r: 0.55 };
};

P[TILES.red_sand] = (u, v) => {
  const n = fbmTile(u, v, 8, 4, 3301);
  const fine = fbmTile(u, v, 28, 2, 3309);
  let c = blend([198, 118, 76], [160, 84, 54], n);
  c = blend(c, [216, 142, 96], fine * 0.35);
  return { c, a: 1, h: n * 0.4 + fine * 0.2, r: 0.95 };
};

P[TILES.cactus_side] = (u, v) => {
  const rib = Math.sin(u * Math.PI * 8) * 0.5 + 0.5;
  const n = fbmTile(u, v, 12, 3, 3401);
  let c = blend([64, 106, 48], [40, 76, 34], rib * 0.4 + n * 0.4);
  const spine = ihash(Math.floor(u * 40), Math.floor(v * 64), 3405);
  if (spine > 0.96 && rib > 0.7) c = [212, 206, 168];
  return { c, a: 1, h: rib * 0.4 + n * 0.2, r: 0.9 };
};

P[TILES.cactus_top] = (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5);
  const n = fbmTile(u, v, 10, 2, 3411);
  let c = blend([78, 120, 56], [48, 84, 40], d * 1.4 + n * 0.3);
  return { c, a: 1, h: (1 - d) * 0.4 + n * 0.2, r: 0.9 };
};

P[TILES.dead_bush] = (u, v) => {
  const px = u * 64;
  const branch = Math.abs((px - 32) / 64) < 0.014 && v > 0.3;
  const twig = Math.abs(v - (0.55 + Math.abs(px - 32) * 0.006)) < 0.013 && Math.abs(px - 32) > 3;
  if (!branch && !twig) return { c: [0, 0, 0], a: 0, h: 0, r: 1 };
  const n = ihash(Math.floor(px), Math.floor(v * 64), 3501);
  return { c: [112 + n * 20, 82 + n * 12, 48], a: 1, h: 0.5, r: 0.92 };
};

P[TILES.mushroom_red] = (u, v) => {
  const dx = Math.abs(u - 0.5);
  const cap = Math.hypot((u - 0.5) * 2.2, (v - 0.38) * 2.8) < 0.55 && v < 0.45;
  const stem = dx < 0.045 && v > 0.4 && v < 0.9;
  if (!cap && !stem) return { c: [0, 0, 0], a: 0, h: 0, r: 1 };
  if (stem) return { c: [228, 218, 198], a: 1, h: 0.4, r: 0.85 };
  const spot = ihash(Math.floor(u * 10), Math.floor(v * 10), 3601) > 0.84;
  return { c: spot ? [242, 232, 216] : [184, 46, 38], a: 1, h: 0.6, r: 0.75 };
};

P[TILES.mushroom_brown] = (u, v) => {
  const cap = Math.hypot((u - 0.5) * 2.5, (v - 0.36) * 3) < 0.6;
  const stem = Math.abs(u - 0.5) < 0.04 && v > 0.4 && v < 0.9;
  if (!cap && !stem) return { c: [0, 0, 0], a: 0, h: 0, r: 1 };
  if (stem) return { c: [196, 184, 160], a: 1, h: 0.4, r: 0.9 };
  return { c: [128, 92, 62], a: 1, h: 0.6, r: 0.8 };
};

P[TILES.basalt] = (u, v) => {
  const col = Math.floor(u * 7) / 7;
  const n = fbmTile(u, v, 9, 3, 3701);
  const ridge = Math.abs(((u * 7) % 1) - 0.5);
  let c = blend([62, 64, 70], [34, 35, 40], n * 0.6 + ridge * 0.8);
  return { c, a: 1, h: (1 - ridge) * 0.5 + n * 0.3, r: 0.85 };
};

P[TILES.terracotta] = (u, v) => {
  const n = fbmTile(u, v, 8, 3, 3801);
  const layer = Math.sin(v * 18) * 0.5 + 0.5;
  let c = blend([166, 96, 68], [132, 70, 50], n * 0.6 + layer * 0.25);
  return { c, a: 1, h: n * 0.3, r: 0.92 };
};

P[TILES.wool] = (u, v) => {
  const n = fbmTile(u, v, 22, 2, 3901);
  const weave = (Math.sin(u * 64) * Math.sin(v * 64)) * 0.5 + 0.5;
  let c = blend([232, 231, 224], [204, 203, 196], n * 0.5 + weave * 0.3);
  return { c, a: 1, h: n * 0.3 + weave * 0.2, r: 0.98 };
};

// Fall back to dirt for any unassigned tile.
for (let i = 0; i < 64; i++) if (!P[i]) P[i] = P[TILES.dirt];

// ---------------------------------------------------------------------------
// Atlas assembly
// ---------------------------------------------------------------------------
function buildAtlasData() {
  const px = ATLAS_SIZE;
  const albedoData = new Uint8ClampedArray(px * px * 4);
  const normalData = new Uint8ClampedArray(px * px * 4);
  const roughData = new Uint8ClampedArray(px * px * 4);

  for (let tile = 0; tile < 64; tile++) {
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    const painter = P[tile];
    const colors = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
    const heights = new Float32Array(TILE_SIZE * TILE_SIZE);
    const roughs = new Float32Array(TILE_SIZE * TILE_SIZE);

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const u = (x + 0.5) / TILE_SIZE;
        const v = (y + 0.5) / TILE_SIZE;
        const out = painter(u, v);
        const i = y * TILE_SIZE + x;
        colors[i * 4] = out.c[0];
        colors[i * 4 + 1] = out.c[1];
        colors[i * 4 + 2] = out.c[2];
        colors[i * 4 + 3] = Math.round(clamp01(out.a) * 255);
        heights[i] = out.h;
        roughs[i] = out.r;
      }
    }

    // Normals from the height field (tangent space, +Y up).
    const strength = 7.5;
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const xm = x > 0 ? x - 1 : x, xp = x < TILE_SIZE - 1 ? x + 1 : x;
        const ym = y > 0 ? y - 1 : y, yp = y < TILE_SIZE - 1 ? y + 1 : y;
        const hL = heights[y * TILE_SIZE + xm], hR = heights[y * TILE_SIZE + xp];
        const hU = heights[ym * TILE_SIZE + x], hD = heights[yp * TILE_SIZE + x];
        let nx = -(hR - hL) * strength;
        let ny = (hD - hU) * strength;
        let nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len; ny /= len; nz /= len;
        const i = (y * TILE_SIZE + x) * 4;
        normalData[(row * CELL + PAD + y) * px * 4 + (col * CELL + PAD + x) * 4] = (nx * 0.5 + 0.5) * 255;
        normalData[(row * CELL + PAD + y) * px * 4 + (col * CELL + PAD + x) * 4 + 1] = (ny * 0.5 + 0.5) * 255;
        normalData[(row * CELL + PAD + y) * px * 4 + (col * CELL + PAD + x) * 4 + 2] = (nz * 0.5 + 0.5) * 255;
        normalData[(row * CELL + PAD + y) * px * 4 + (col * CELL + PAD + x) * 4 + 3] = 255;
      }
    }

    // Gutter-replicated albedo/roughness/normal for clean mipmaps.
    for (let cy = 0; cy < CELL; cy++) {
      for (let cx = 0; cx < CELL; cx++) {
        const sx = Math.min(TILE_SIZE - 1, Math.max(0, cx - PAD));
        const sy = Math.min(TILE_SIZE - 1, Math.max(0, cy - PAD));
        const si = (sy * TILE_SIZE + sx) * 4;
        const di = ((row * CELL + cy) * px + (col * CELL + cx)) * 4;
        albedoData[di] = colors[si];
        albedoData[di + 1] = colors[si + 1];
        albedoData[di + 2] = colors[si + 2];
        albedoData[di + 3] = colors[si + 3];
        if (cx >= PAD && cx < PAD + TILE_SIZE && cy >= PAD && cy < PAD + TILE_SIZE) {
          const rough = roughs[(cy - PAD) * TILE_SIZE + (cx - PAD)];
          roughData[di] = roughData[di + 1] = roughData[di + 2] = rough * 255;
          roughData[di + 3] = 255;
        } else {
          const sxr = Math.min(TILE_SIZE - 1, Math.max(0, cx - PAD));
          const syr = Math.min(TILE_SIZE - 1, Math.max(0, cy - PAD));
          const rough = roughs[syr * TILE_SIZE + sxr];
          roughData[di] = roughData[di + 1] = roughData[di + 2] = rough * 255;
          roughData[di + 3] = 255;
        }
        if (cx < PAD || cx >= PAD + TILE_SIZE || cy < PAD || cy >= PAD + TILE_SIZE) {
          const nx2 = Math.min(TILE_SIZE - 1, Math.max(0, cx - PAD));
          const ny2 = Math.min(TILE_SIZE - 1, Math.max(0, cy - PAD));
          const ni = ((row * CELL + PAD + ny2) * px + (col * CELL + PAD + nx2)) * 4;
          normalData[di] = normalData[ni];
          normalData[di + 1] = normalData[ni + 1];
          normalData[di + 2] = normalData[ni + 2];
          normalData[di + 3] = 255;
        }
      }
    }
  }

  return { albedoData, normalData, roughData };
}

function dataToCanvas(data, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(data, size, size), 0, 0);
  return canvas;
}

export function buildAtlases(maxAnisotropy = 4) {
  const { albedoData, normalData, roughData } = buildAtlasData();
  const albedoCanvas = dataToCanvas(albedoData, ATLAS_SIZE);
  const normalCanvas = dataToCanvas(normalData, ATLAS_SIZE);
  const roughCanvas = dataToCanvas(roughData, ATLAS_SIZE);

  const mk = (canvas, srgb) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
    tex.needsUpdate = true;
    return tex;
  };

  return {
    albedo: mk(albedoCanvas, true),
    normal: mk(normalCanvas, false),
    roughness: mk(roughCanvas, false),
    albedoCanvas,
    normalCanvas,
    roughCanvas,
    atlasSize: ATLAS_SIZE,
  };
}

// ---------------------------------------------------------------------------
// UV helpers
// ---------------------------------------------------------------------------
export function tileUV(tile) {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const inset = 1.0;
  const x0 = (col * CELL + PAD + inset) / ATLAS_SIZE;
  const x1 = (col * CELL + PAD + TILE_SIZE - inset) / ATLAS_SIZE;
  const vTop = 1 - (row * CELL + PAD + inset) / ATLAS_SIZE;
  const vBottom = 1 - (row * CELL + PAD + TILE_SIZE - inset) / ATLAS_SIZE;
  return { u0: x0, u1: x1, v0: vBottom, v1: vTop };
}

const iconCache = new Map();

// Isometric block icon for the HUD/inventory, composed from atlas tiles.
export function makeBlockIcon(defOrId, size = 64) {
  const def = typeof defOrId === 'number' ? getBlockDef(defOrId) : defOrId;
  const key = `${def.id}:${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const atlas = window.__terravistaAtlas;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  if (!atlas) return canvas;
  const ctx = canvas.getContext('2d');
  const src = atlas.albedoCanvas;
  const col = (tile) => tile % ATLAS_COLS;
  const row = (tile) => Math.floor(tile / ATLAS_COLS);
  const crop = (tile) => {
    const c = document.createElement('canvas');
    c.width = TILE_SIZE; c.height = TILE_SIZE;
    c.getContext('2d').drawImage(src, col(tile) * CELL + PAD, row(tile) * CELL + PAD, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
    return c;
  };
  const top = crop(def.tiles.top);
  const side = crop(def.tiles.side);

  const s = size;
  const cx = s / 2, cy = s * 0.5;
  const w = s * 0.42, h = s * 0.235;
  ctx.imageSmoothingEnabled = true;
  // top face
  ctx.save();
  ctx.translate(cx, cy - h * 1.55);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(top, 0, 0, w, h);
  ctx.restore();
  // left face (darker)
  ctx.save();
  ctx.translate(cx, cy - h * 1.05);
  ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.drawImage(side, 0, 0, w, h * 2.05);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(0, 0, w, h * 2.1);
  ctx.restore();
  // right face (lighter)
  ctx.save();
  ctx.translate(cx, cy - h * 0.54);
  ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.drawImage(side, w, 0, -w, h * 2.05);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, w, h * 2.1);
  ctx.restore();

  iconCache.set(key, canvas);
  return canvas;
}

export function averageTileColor(tile) {
  const atlas = window.__terravistaAtlas;
  if (!atlas) return [0.5, 0.5, 0.5];
  const image = atlas.albedoCanvas.getContext('2d').getImageData(
    (tile % ATLAS_COLS) * CELL + PAD, Math.floor(tile / ATLAS_COLS) * CELL + PAD, TILE_SIZE, TILE_SIZE
  ).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < image.length; i += 16) {
    if (image[i + 3] > 20) { r += image[i]; g += image[i + 1]; b += image[i + 2]; n++; }
  }
  if (!n) return [0.5, 0.5, 0.5];
  return [r / n / 255, g / n / 255, b / n / 255];
}

export function blockParticleColor(id) {
  const def = getBlockDef(id);
  return averageTileColor(def.tiles.side);
}
