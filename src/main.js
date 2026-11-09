import * as THREE from 'three';
import { BLOCKS, BLOCK_IDS, HOTBAR_DEFAULT, INVENTORY_BLOCKS, getBlockDef, isSolid } from './world/blocks.js';
import { WorldGenerator, CHUNK_SIZE, WORLD_HEIGHT, BIOME_META } from './world/worldgen.js';
import { buildAtlases, tileUV, makeBlockIcon } from './render/textures.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const state = {
  seed: 1337, generator: null, spawn: null, chunks: new Map(), edits: new Map(),
  started: false, paused: false, inventory: false, pointerLocked: false,
  yaw: 0, pitch: -0.12, x: 0, y: 65, z: 0, vy: 0, grounded: false, flying: false,
  keys: new Set(), selected: 0, hotbar: [...HOTBAR_DEFAULT], target: null,
  lastTime: 0, time: 0, day: 0.32, fpsFrames: 0, fpsTime: 0, quality: 'high',
  renderDistance: 3, sensitivity: 1, touch: false, move: { x: 0, z: 0 }, lookPointer: null,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dc8dc);
scene.fog = new THREE.Fog(0x9dc8dc, 62, 190);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 260);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const hemi = new THREE.HemisphereLight(0xd9f0ff, 0x4a4638, 1.45);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b4, 2.2);
sun.position.set(-45, 80, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -48; sun.shadow.camera.right = 48;
sun.shadow.camera.top = 48; sun.shadow.camera.bottom = -48;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 180;
sun.shadow.bias = -0.00035;
scene.add(sun, sun.target);

const atlas = buildAtlases(Math.min(renderer.capabilities.getMaxAnisotropy(), 8));
window.__terravistaAtlas = atlas;
const worldMat = new THREE.MeshStandardMaterial({ map: atlas.albedo, normalMap: atlas.normal, roughnessMap: atlas.roughness, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ map: atlas.albedo, roughness: 0.16, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide });
const waterMat = new THREE.MeshStandardMaterial({ map: atlas.albedo, roughness: 0.23, metalness: 0.08, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide });
const plantMat = new THREE.MeshStandardMaterial({ map: atlas.albedo, alphaTest: 0.28, side: THREE.DoubleSide, roughness: 1 });
const worldRoot = new THREE.Group(); scene.add(worldRoot);

const FACE_DATA = [
  { n: [1,0,0], v: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], side: 'side' },
  { n: [-1,0,0], v: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], side: 'side' },
  { n: [0,1,0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], side: 'top' },
  { n: [0,-1,0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], side: 'bottom' },
  { n: [0,0,1], v: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], side: 'side' },
  { n: [0,0,-1], v: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], side: 'side' },
];
const TRI = [0,1,2,0,2,3];

function chunkKey(cx, cz) { return `${cx},${cz}`; }
function getChunk(cx, cz) { return state.chunks.get(chunkKey(cx, cz)); }
function getBlock(x, y, z) {
  if (y < 0 || y >= WORLD_HEIGHT) return y < 0 ? BLOCK_IDS.bedrock : 0;
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const chunk = getChunk(cx, cz);
  if (!chunk) return 0;
  const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk.blocks[(y << 8) | (lz << 4) | lx];
}
function editedKey(x, y, z) { return `${x},${y},${z}`; }
function setBlock(x, y, z, id) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), chunk = getChunk(cx, cz);
  if (!chunk || y < 0 || y >= WORLD_HEIGHT) return;
  const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  chunk.blocks[(y << 8) | (lz << 4) | lx] = id;
  state.edits.set(editedKey(x, y, z), id);
  markSaveDirty();
  rebuildChunk(cx, cz);
  if (lx === 0) rebuildChunk(cx - 1, cz); if (lx === 15) rebuildChunk(cx + 1, cz);
  if (lz === 0) rebuildChunk(cx, cz - 1); if (lz === 15) rebuildChunk(cx, cz + 1);
}

function makeGeometry(arrays) {
  if (!arrays.positions.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uvs, 2));
  g.computeBoundingSphere();
  return g;
}
function pushFace(out, x, y, z, face, tile, scale = 1) {
  const uv = tileUV(tile); const tex = [[uv.u0,uv.v0],[uv.u0,uv.v1],[uv.u1,uv.v1],[uv.u1,uv.v0]];
  for (const i of TRI) {
    const p = face.v[i]; out.positions.push(x + p[0] * scale, y + p[1] * scale, z + p[2] * scale);
    out.normals.push(...face.n); out.uvs.push(...tex[i]);
  }
}
function pushPlant(out, x, y, z, tile) {
  const uv = tileUV(tile); const a = [[uv.u0,uv.v0],[uv.u0,uv.v1],[uv.u1,uv.v1],[uv.u1,uv.v0]];
  for (const rot of [0, Math.PI / 2]) for (const flip of [false, true]) {
    for (const i of TRI) {
      let px = [0.12,0.12,0.88,0.88][i], pz = [0.12,0.88,0.88,0.12][i];
      if (flip) px = 1 - px;
      const rx = px - 0.5, rz = pz - 0.5;
      const vx = 0.5 + rx * Math.cos(rot) - rz * Math.sin(rot), vz = 0.5 + rx * Math.sin(rot) + rz * Math.cos(rot);
      out.positions.push(x + vx, y + (i === 1 || i === 2 ? 0.95 : 0.02), z + vz);
      out.normals.push(0, 0.7, 0); out.uvs.push(...a[i]);
    }
  }
}
function visibleAgainst(id, other) {
  if (other === 0 || BLOCKS[other]?.plant) return true;
  if (id === BLOCK_IDS.water) return other !== BLOCK_IDS.water;
  if (BLOCKS[id]?.render === 'glass') return other !== id && other !== BLOCK_IDS.glass;
  return !BLOCKS[other]?.opaque;
}

function rebuildChunk(cx, cz) {
  const c = getChunk(cx, cz); if (!c) return;
  if (c.group) { worldRoot.remove(c.group); c.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const group = new THREE.Group(); group.position.set(cx * 16, 0, cz * 16); c.group = group;
  const opaque = { positions: [], normals: [], uvs: [] }, transparent = { positions: [], normals: [], uvs: [] }, plants = { positions: [], normals: [], uvs: [] };
  for (let y = 0; y < WORLD_HEIGHT; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const id = c.blocks[(y << 8) | (z << 4) | x]; if (!id) continue;
    const def = BLOCKS[id];
    if (def.plant) { pushPlant(plants, x, y, z, def.tiles.all ?? def.tiles.side); continue; }
    const out = id === BLOCK_IDS.water || def.render === 'glass' ? transparent : opaque;
    for (const face of FACE_DATA) {
      const other = getBlock(cx * 16 + x + face.n[0], y + face.n[1], cz * 16 + z + face.n[2]);
      if (visibleAgainst(id, other)) pushFace(out, x, y, z, face, def.tiles[face.side] ?? def.tiles.side);
    }
  }
  const geo = makeGeometry(opaque);
  if (geo) { const mesh = new THREE.Mesh(geo, worldMat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  const transGeo = makeGeometry(transparent);
  if (transGeo) {
    const waterGeo = new THREE.BufferGeometry(), glassGeo = new THREE.BufferGeometry();
    // Keep water and glass separated to preserve distinct optical response.
    const water = { positions: [], normals: [], uvs: [] }, glass = { positions: [], normals: [], uvs: [] };
    for (let y = 0; y < WORLD_HEIGHT; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = c.blocks[(y << 8) | (z << 4) | x]; if (id !== BLOCK_IDS.water && BLOCKS[id]?.render !== 'glass') continue;
      const out = id === BLOCK_IDS.water ? water : glass, def = BLOCKS[id];
      for (const face of FACE_DATA) { const other = getBlock(cx*16+x+face.n[0], y+face.n[1], cz*16+z+face.n[2]); if (visibleAgainst(id, other)) pushFace(out,x,y,z,face,def.tiles[face.side] ?? def.tiles.side); }
    }
    waterGeo.copy(makeGeometry(water) || new THREE.BufferGeometry()); glassGeo.copy(makeGeometry(glass) || new THREE.BufferGeometry());
    if (water.positions.length) { const m = new THREE.Mesh(waterGeo, waterMat); m.renderOrder = 2; group.add(m); }
    if (glass.positions.length) { const m = new THREE.Mesh(glassGeo, glassMat); m.renderOrder = 3; group.add(m); }
    transGeo.dispose();
  }
  const plantGeo = makeGeometry(plants);
  if (plantGeo) { const m = new THREE.Mesh(plantGeo, plantMat); m.castShadow = true; group.add(m); }
  worldRoot.add(group);
}

// ---------------------------------------------------------------------------
// World streaming, interface and gameplay
// ---------------------------------------------------------------------------
const playerHeight = 1.78;
const playerRadius = 0.31;
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();
const loadingQueue = [];
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
let mineHeld = false;
let mineProgress = 0;
let mineKey = '';
let saveTimer = 0;

function showToast(message) {
  const stack = $('toast-stack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  stack.append(toast);
  window.setTimeout(() => toast.remove(), 2400);
}

function setLoading(percent, label) {
  $('load-fill').style.width = `${Math.max(0, Math.min(100, percent))}%`;
  $('load-label').textContent = label;
}

function queueChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (state.chunks.has(key) || loadingQueue.some((item) => item.key === key)) return;
  loadingQueue.push({ cx, cz, key, distance: Math.max(Math.abs(cx - Math.floor(state.x / 16)), Math.abs(cz - Math.floor(state.z / 16))) });
  loadingQueue.sort((a, b) => a.distance - b.distance);
}

function generateQueuedChunk() {
  const next = loadingQueue.shift();
  if (!next) return false;
  const data = state.generator.generateChunk(next.cx, next.cz);
  const chunk = { ...data, group: null, cx: next.cx, cz: next.cz };
  state.chunks.set(next.key, chunk);
  for (const [position, id] of state.edits) {
    const [wx, y, wz] = position.split(',').map(Number);
    if (Math.floor(wx / 16) !== next.cx || Math.floor(wz / 16) !== next.cz || y < 0 || y >= WORLD_HEIGHT) continue;
    const lx = ((wx % 16) + 16) % 16, lz = ((wz % 16) + 16) % 16;
    chunk.blocks[(y << 8) | (lz << 4) | lx] = id;
  }
  rebuildChunk(next.cx, next.cz);
  if (getChunk(next.cx - 1, next.cz)) rebuildChunk(next.cx - 1, next.cz);
  if (getChunk(next.cx + 1, next.cz)) rebuildChunk(next.cx + 1, next.cz);
  if (getChunk(next.cx, next.cz - 1)) rebuildChunk(next.cx, next.cz - 1);
  if (getChunk(next.cx, next.cz + 1)) rebuildChunk(next.cx, next.cz + 1);
  return true;
}

function requestAroundPlayer() {
  const cx = Math.floor(state.x / 16), cz = Math.floor(state.z / 16);
  const distance = state.touch ? Math.min(state.renderDistance, 3) : state.renderDistance;
  for (let r = 0; r <= distance; r++) {
    for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
      queueChunk(cx + x, cz + z);
    }
  }
  const unloadDistance = distance + 2;
  for (const [key, chunk] of state.chunks) {
    if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) <= unloadDistance) continue;
    worldRoot.remove(chunk.group);
    chunk.group?.traverse((object) => object.geometry?.dispose());
    state.chunks.delete(key);
  }
}

function setWorld(seed) {
  state.seed = (Number(seed) || 1337) >>> 0;
  state.generator = new WorldGenerator(state.seed);
  state.spawn = state.generator.findSpawn();
  state.chunks.clear(); state.edits.clear(); loadingQueue.length = 0;
  worldRoot.clear();
  state.x = state.spawn.x + 0.5; state.y = state.spawn.y; state.z = state.spawn.z + 0.5;
  state.yaw = state.spawn.yaw; state.pitch = -0.08; state.vy = 0; state.grounded = false;
  state.time = 0; state.day = 0.32;
  camera.position.set(state.x, state.y + 1.62, state.z);
  camera.rotation.set(state.pitch, state.yaw, 0);
  $('world-label').textContent = `Seed ${state.seed}`;
  $('start-biome').textContent = BIOME_META[state.spawn.biome]?.name || 'Wilderness';
  $('stat-seed').textContent = state.seed;
  setLoading(12, 'Finding a place to begin…');
  queueChunk(Math.floor(state.x / 16), Math.floor(state.z / 16));
  requestAroundPlayer();
  generateQueuedChunk();
  rebuildHotbar();
  updateBiomeUI();
  $('btn-play').disabled = false;
  setLoading(100, 'Your world is ready');
  $('load-status').classList.add('ready');
  localStorage.setItem('terravista-seed', String(state.seed));
}

function seedFromText(text) {
  const raw = String(text).trim();
  if (/^-?\d+$/.test(raw)) return Number(raw) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function rebuildHotbar() {
  const bar = $('hotbar');
  bar.replaceChildren();
  state.hotbar.forEach((id, index) => {
    const def = getBlockDef(id);
    const slot = document.createElement('button');
    slot.className = `hotbar-slot${index === state.selected ? ' selected' : ''}`;
    slot.setAttribute('aria-label', `${index + 1}: ${def.name}`);
    slot.innerHTML = `<span class="slot-key">${index + 1}</span><img alt="" src="${makeBlockIcon(id)}"><span class="slot-name">${def.name}</span>`;
    slot.addEventListener('click', () => { state.selected = index; rebuildHotbar(); });
    bar.append(slot);
  });
}

function buildInventory() {
  const grid = $('inventory-grid');
  grid.replaceChildren();
  for (const id of INVENTORY_BLOCKS) {
    const def = getBlockDef(id);
    const button = document.createElement('button');
    button.className = 'inventory-item';
    button.title = def.name;
    button.innerHTML = `<img alt="" src="${makeBlockIcon(id)}"><span>${def.name}</span>`;
    button.addEventListener('click', () => {
      state.hotbar[state.selected] = id;
      rebuildHotbar();
      closeInventory();
      showToast(`${def.name} selected`);
    });
    grid.append(button);
  }
}

function updateBiomeUI() {
  if (!state.generator) return;
  const col = state.generator.column(Math.floor(state.x), Math.floor(state.z));
  const name = BIOME_META[col.biome]?.name || 'Wilderness';
  $('biome-chip').textContent = name;
  $('stat-biome').textContent = name;
  $('compass-coords').textContent = `${Math.floor(state.x)} · ${Math.floor(state.y)} · ${Math.floor(state.z)}`;
  $('stat-pos').textContent = `${Math.floor(state.x)}, ${Math.floor(state.y)}, ${Math.floor(state.z)}`;
}

function findTarget() {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  let x = Math.floor(camera.position.x), y = Math.floor(camera.position.y), z = Math.floor(camera.position.z);
  const stepX = Math.sign(direction.x), stepY = Math.sign(direction.y), stepZ = Math.sign(direction.z);
  const deltaX = stepX ? Math.abs(1 / direction.x) : Infinity;
  const deltaY = stepY ? Math.abs(1 / direction.y) : Infinity;
  const deltaZ = stepZ ? Math.abs(1 / direction.z) : Infinity;
  let maxX = stepX > 0 ? (x + 1 - camera.position.x) * deltaX : (camera.position.x - x) * deltaX;
  let maxY = stepY > 0 ? (y + 1 - camera.position.y) * deltaY : (camera.position.y - y) * deltaY;
  let maxZ = stepZ > 0 ? (z + 1 - camera.position.z) * deltaZ : (camera.position.z - z) * deltaZ;
  let previous = null;
  for (let distance = 0; distance <= 7; distance++) {
    const id = getBlock(x, y, z);
    if (id && id !== BLOCK_IDS.water && !getBlockDef(id).plant) return { x, y, z, id, previous };
    previous = { x, y, z };
    if (maxX < maxY && maxX < maxZ) { x += stepX; distance = maxX; maxX += deltaX; }
    else if (maxY < maxZ) { y += stepY; distance = maxY; maxY += deltaY; }
    else { z += stepZ; distance = maxZ; maxZ += deltaZ; }
  }
  return null;
}

function blockIntersectsPlayer(x, y, z) {
  return x + 1 > state.x - playerRadius && x < state.x + playerRadius
    && z + 1 > state.z - playerRadius && z < state.z + playerRadius
    && y + 1 > state.y && y < state.y + playerHeight;
}

function mineTarget(dt) {
  const target = state.target;
  if (!mineHeld || !target) { mineProgress = 0; mineKey = ''; $('mining-ring').classList.add('hidden'); return; }
  const key = editedKey(target.x, target.y, target.z);
  if (key !== mineKey) { mineKey = key; mineProgress = 0; }
  const def = getBlockDef(target.id);
  $('target-name').textContent = def.name;
  $('target-name').classList.add('show');
  if (def.hardness < 0) { showToast('This block cannot be mined'); mineHeld = false; return; }
  mineProgress += dt / Math.max(0.16, def.hardness * 0.62);
  $('mining-ring').classList.remove('hidden');
  $('ring-fg').style.strokeDashoffset = `${119.4 * (1 - Math.min(1, mineProgress))}`;
  if (mineProgress >= 1) {
    setBlock(target.x, target.y, target.z, 0);
    mineHeld = false; mineProgress = 0; mineKey = '';
    $('mining-ring').classList.add('hidden');
    showToast(`${def.name} mined`);
  }
}

function placeBlock() {
  const target = state.target;
  if (!target?.previous) return;
  const { x, y, z } = target.previous;
  if (y < 0 || y >= WORLD_HEIGHT || blockIntersectsPlayer(x, y, z)) return;
  const id = state.hotbar[state.selected];
  if (!id || getBlockDef(id).plant) return;
  setBlock(x, y, z, id);
  showToast(`${getBlockDef(id).name} placed`);
}

function openInventory() {
  if (!state.started || state.paused) return;
  state.inventory = true; mineHeld = false;
  $('inventory-screen').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeInventory() {
  state.inventory = false;
  $('inventory-screen').classList.add('hidden');
}
function pauseGame() {
  if (!state.started || state.paused) return;
  state.paused = true; mineHeld = false;
  $('pause-screen').classList.remove('hidden');
  $('stat-seed').textContent = state.seed;
  $('stat-day').textContent = `${Math.floor(state.time / 240) + 1} · ${formatClock()}`;
  if (document.pointerLockElement) document.exitPointerLock();
}
function resumeGame() {
  state.paused = false;
  $('pause-screen').classList.add('hidden');
  if (!state.touch) canvas.requestPointerLock?.();
}
function formatClock() {
  const hours = Math.floor((state.day * 24 + state.time / 600) % 24);
  const minutes = Math.floor((state.time % 600) / 10);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
function startGame() {
  if (state.started) return;
  state.started = true; state.paused = false;
  $('start-screen').classList.add('hidden'); $('hud').classList.remove('hidden');
  state.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  $('mobile-controls').classList.toggle('hidden', !state.touch);
  if (!state.touch) canvas.requestPointerLock?.();
  showToast(`Welcome to ${BIOME_META[state.spawn.biome]?.name || 'TerraVista'}`);
}

function collideAt(x, y, z) {
  const minX = Math.floor(x - playerRadius), maxX = Math.floor(x + playerRadius);
  const minY = Math.floor(y + 0.02), maxY = Math.floor(y + playerHeight - 0.03);
  const minZ = Math.floor(z - playerRadius), maxZ = Math.floor(z + playerRadius);
  for (let by = minY; by <= maxY; by++) for (let bz = minZ; bz <= maxZ; bz++) for (let bx = minX; bx <= maxX; bx++) {
    const id = getBlock(bx, by, bz);
    if (isSolid(id) && !getBlockDef(id).plant) return true;
  }
  return false;
}

function movePlayer(dt) {
  const forward = (state.keys.has('KeyW') || state.move.z < -0.15 ? 1 : 0) - (state.keys.has('KeyS') || state.move.z > 0.15 ? 1 : 0);
  const strafe = (state.keys.has('KeyD') || state.move.x > 0.15 ? 1 : 0) - (state.keys.has('KeyA') || state.move.x < -0.15 ? 1 : 0);
  const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
  const speed = state.flying ? (sprint ? 12 : 7) : (sprint ? 7.3 : 4.7);
  const length = Math.hypot(forward, strafe) || 1;
  const dx = (Math.sin(state.yaw) * forward + Math.cos(state.yaw) * strafe) * speed * dt / length;
  const dz = (-Math.cos(state.yaw) * forward + Math.sin(state.yaw) * strafe) * speed * dt / length;
  const nx = state.x + dx;
  if (!collideAt(nx, state.y, state.z)) state.x = nx;
  const nz = state.z + dz;
  if (!collideAt(state.x, state.y, nz)) state.z = nz;

  const jumping = state.keys.has('Space') || state.touchJump;
  if (state.flying) {
    const vertical = (jumping ? 1 : 0) - (state.keys.has('ControlLeft') || state.keys.has('ControlRight') ? 1 : 0);
    state.y += vertical * speed * dt;
    state.vy = 0; state.grounded = false;
  } else {
    if (jumping && state.grounded) { state.vy = 8.2; state.grounded = false; }
    state.vy -= 23 * dt;
    const ny = state.y + state.vy * dt;
    if (!collideAt(state.x, ny, state.z)) { state.y = ny; state.grounded = false; }
    else {
      if (state.vy < 0) state.grounded = true;
      state.vy = 0;
    }
  }
  if (state.y < -8) {
    state.y = state.spawn.y; state.x = state.spawn.x + 0.5; state.z = state.spawn.z + 0.5; state.vy = 0;
    showToast('Returned to your starting point');
  }
  camera.position.set(state.x, state.y + 1.62, state.z);
  camera.rotation.set(state.pitch, state.yaw, 0);
}

// ---------------------------------------------------------------------------
// Input, persistence, settings and the frame loop
// ---------------------------------------------------------------------------
const SAVE_KEY = 'terravista-save-v1';
let saveDirty = false;
let saveCooldown = 0;
let joystickPointer = null;
let lookTouch = null;
let touchJump = false;

function persistWorld() {
  try {
    const save = {
      seed: state.seed,
      edits: [...state.edits.entries()],
      player: { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch },
      hotbar: state.hotbar,
      selected: state.selected,
      time: state.time,
      day: state.day,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    localStorage.setItem('terravista-seed', String(state.seed));
    saveDirty = false;
    showToast('World saved');
  } catch (error) {
    console.warn('Could not save TerraVista world:', error);
    showToast('Could not save world on this device');
  }
}

function markSaveDirty() {
  saveDirty = true;
  saveCooldown = 1.4;
}

function readSavedWorld() {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!save || !Number.isFinite(Number(save.seed))) return null;
    return save;
  } catch { return null; }
}

function setQuality(quality) {
  state.quality = quality;
  const presets = {
    low: { pixel: 0.85, shadows: false, shadowSize: 512, exposure: 1.05 },
    medium: { pixel: 1.1, shadows: true, shadowSize: 768, exposure: 1.1 },
    high: { pixel: 1.45, shadows: true, shadowSize: 1024, exposure: 1.12 },
    ultra: { pixel: 1.8, shadows: true, shadowSize: 1536, exposure: 1.15 },
  };
  const preset = presets[quality] || presets.high;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.pixel));
  sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
  sun.shadow.map?.dispose(); sun.shadow.map = null;
  sun.castShadow = preset.shadows;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.toneMappingExposure = preset.exposure;
  $('quality-val').textContent = ({ low: 'Performance', medium: 'Balanced', high: 'High', ultra: 'Cinematic' })[quality];
  $('quality-seg').querySelectorAll('[data-quality]').forEach((button) => {
    button.classList.toggle('active', button.dataset.quality === quality);
  });
  renderer.setSize(innerWidth, innerHeight);
}

function updateDistance(value) {
  state.renderDistance = Number(value);
  $('distance-val').textContent = `${state.renderDistance} chunks`;
  requestAroundPlayer();
}

function bindButton(id, handler) {
  const element = $(id);
  if (element) element.addEventListener('click', handler);
}

function handleKeyDown(event) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat && ['KeyE', 'KeyF', 'Escape'].includes(event.code)) return;
  if (event.code === 'Escape') {
    if (state.inventory) closeInventory();
    else if (state.started && !state.paused) pauseGame();
    else if (state.paused) resumeGame();
    return;
  }
  if (!state.started || state.paused || state.inventory) return;
  state.keys.add(event.code);
  if (event.code === 'KeyE') openInventory();
  if (event.code === 'KeyF') { state.flying = !state.flying; state.vy = 0; showToast(state.flying ? 'Flight enabled' : 'Flight disabled'); }
  if (event.code === 'KeyC') $('compass').classList.toggle('off');
  if (/^Digit[1-9]$/.test(event.code)) { state.selected = Number(event.code.slice(-1)) - 1; rebuildHotbar(); }
}

function handleKeyUp(event) { state.keys.delete(event.code); }

function pointerLook(dx, dy) {
  const sensitivity = state.sensitivity * 0.0022;
  state.yaw -= dx * sensitivity;
  state.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, state.pitch - dy * sensitivity));
}

function setMineHeld(value) { mineHeld = value; if (!value) mineProgress = 0; }

function bindTouchControls() {
  const moveZone = $('move-zone');
  const knob = $('joystick-knob');
  moveZone.addEventListener('pointerdown', (event) => {
    event.preventDefault(); joystickPointer = event.pointerId; moveZone.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  moveZone.addEventListener('pointermove', (event) => { if (event.pointerId === joystickPointer) updateJoystick(event); });
  const endJoystick = (event) => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null; state.move.x = 0; state.move.z = 0; knob.style.transform = 'translate(0, 0)';
  };
  moveZone.addEventListener('pointerup', endJoystick); moveZone.addEventListener('pointercancel', endJoystick);
  function updateJoystick(event) {
    const rect = moveZone.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.max(1, Math.hypot(dx, dy)), scale = Math.min(1, 42 / length);
    const x = dx * scale, y = dy * scale;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    state.move.x = x / 42; state.move.z = y / 42;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.touch || !state.started || state.paused || state.inventory) return;
    if (event.pointerType !== 'touch') return;
    lookTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!lookTouch || event.pointerId !== lookTouch.id) return;
    pointerLook(lookTouch.x - event.clientX, lookTouch.y - event.clientY);
    lookTouch.x = event.clientX; lookTouch.y = event.clientY;
  });
  const endLook = (event) => { if (lookTouch?.id === event.pointerId) lookTouch = null; };
  canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);

  $('btn-jump').addEventListener('pointerdown', (event) => { event.preventDefault(); touchJump = true; });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) $('btn-jump').addEventListener(type, () => { touchJump = false; });
  $('btn-mine').addEventListener('pointerdown', (event) => { event.preventDefault(); setMineHeld(true); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) $('btn-mine').addEventListener(type, () => setMineHeld(false));
  $('btn-place').addEventListener('click', placeBlock);
  bindButton('btn-fly', () => { state.flying = !state.flying; showToast(state.flying ? 'Flight enabled' : 'Flight disabled'); });
}

function bindInterface() {
  bindButton('btn-play', startGame);
  bindButton('btn-new-world', () => { $('seed-input').value = String(Math.floor(Math.random() * 1_000_000_000)); setWorld(seedFromText($('seed-input').value)); });
  bindButton('btn-new-world-2', () => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    $('seed-input').value = String(seed); setWorld(seed); state.started = false; state.paused = false;
    $('pause-screen').classList.add('hidden'); $('hud').classList.add('hidden'); $('start-screen').classList.remove('hidden');
    showToast('A fresh world is ready');
  });
  bindButton('btn-apply-seed', () => {
    const seed = seedFromText($('seed-input').value || '1337');
    $('seed-input').value = String(seed); setWorld(seed); showToast(`World seed ${seed} generated`);
  });
  bindButton('btn-resume', resumeGame); bindButton('btn-resume-2', resumeGame); bindButton('btn-pause', pauseGame);
  bindButton('btn-close-inventory', closeInventory);
  bindButton('btn-save', persistWorld);
  bindButton('btn-map', () => $('compass').classList.toggle('off'));
  bindButton('btn-graphics', () => { pauseGame(); document.querySelector('[data-tab="tab-graphics"]')?.click(); });
  bindButton('btn-respawn', () => {
    $('death-screen').classList.add('hidden'); state.x = state.spawn.x + 0.5; state.y = state.spawn.y; state.z = state.spawn.z + 0.5;
    state.vy = 0; state.flying = false; markSaveDirty();
  });
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tab.dataset.tab));
  }));
  document.querySelectorAll('[data-quality]').forEach((button) => button.addEventListener('click', () => setQuality(button.dataset.quality)));
  $('distance-range').addEventListener('input', (event) => updateDistance(event.target.value));
  $('fov-range').addEventListener('input', (event) => {
    camera.fov = Number(event.target.value); camera.updateProjectionMatrix(); $('fov-val').textContent = `${camera.fov}°`;
  });
  $('sens-range').addEventListener('input', (event) => {
    state.sensitivity = Number(event.target.value) / 100; $('sens-val').textContent = `${state.sensitivity.toFixed(1)}×`;
  });
  for (const [id, apply] of [
    ['toggle-bloom', (enabled) => { renderer.toneMappingExposure = enabled ? 1.12 : 1; }],
    ['toggle-shadows', (enabled) => { renderer.shadowMap.enabled = enabled; sun.castShadow = enabled; }],
    ['toggle-audio', () => {}],
  ]) $(id).addEventListener('click', (event) => {
    const button = event.currentTarget, enabled = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(enabled)); button.classList.toggle('on', enabled); apply(enabled);
  });

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', () => { state.keys.clear(); setMineHeld(false); touchJump = false; });
  document.addEventListener('pointerlockchange', () => { state.pointerLocked = document.pointerLockElement === canvas; });
  document.addEventListener('mousemove', (event) => {
    if (state.pointerLocked && state.started && !state.paused && !state.inventory) pointerLook(event.movementX, event.movementY);
  });
  canvas.addEventListener('click', () => {
    if (state.started && !state.paused && !state.inventory && !state.touch && !state.pointerLocked) canvas.requestPointerLock?.();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('mousedown', (event) => {
    if (!state.started || state.paused || state.inventory || state.touch) return;
    if (event.button === 0) setMineHeld(true);
    if (event.button === 2) placeBlock();
  });
  window.addEventListener('mouseup', (event) => { if (event.button === 0) setMineHeld(false); });
  window.addEventListener('wheel', (event) => {
    if (!state.started || state.paused || state.inventory) return;
    state.selected = (state.selected + (event.deltaY > 0 ? 1 : 8)) % 9; rebuildHotbar();
  }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  });
  bindTouchControls();
}

function updateCompass() {
  const strip = $('compass-strip');
  const heading = ((state.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const degrees = heading * 180 / Math.PI;
  strip.style.transform = `translateX(${160 - (degrees / 360) * 640}px)`;
}

function updateSky(dt) {
  state.time += dt;
  const angle = state.day * Math.PI * 2 + state.time * 0.0007;
  sun.position.set(Math.cos(angle) * 90, Math.sin(angle) * 90, 28);
  sun.target.position.set(state.x, 0, state.z);
  const daylight = Math.max(0, Math.sin(angle));
  hemi.intensity = 0.48 + daylight * 1.05;
  sun.intensity = 0.08 + daylight * 2.15;
  const sky = new THREE.Color().setRGB(0.035 + daylight * 0.48, 0.07 + daylight * 0.62, 0.12 + daylight * 0.68);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  $('start-clock').textContent = formatClock();
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, state.lastTime ? (now - state.lastTime) / 1000 : 0);
  state.lastTime = now;
  if (state.started && !state.paused && !state.inventory) {
    movePlayer(dt);
    if (now - (state.lastChunkRequest || 0) > 750) { requestAroundPlayer(); state.lastChunkRequest = now; }
    generateQueuedChunk();
    state.target = findTarget();
    if (state.target) {
      $('target-name').textContent = getBlockDef(state.target.id).name;
      $('target-name').classList.add('show');
    } else $('target-name').classList.remove('show');
    mineTarget(dt);
    updateBiomeUI(); updateCompass(); updateSky(dt);
    if (saveDirty) { saveCooldown -= dt; if (saveCooldown <= 0) persistWorld(); }
    if (state.y < -5) $('death-screen').classList.remove('hidden');
  } else {
    // Continue filling the nearby terrain while menus are open.
    if (state.generator && loadingQueue.length) generateQueuedChunk();
    updateSky(dt * 0.2);
  }
  state.fpsFrames++; state.fpsTime += dt;
  if (state.fpsTime >= 0.5) {
    $('fps').textContent = `${Math.round(state.fpsFrames / state.fpsTime)} FPS`;
    $('fps').classList.toggle('hidden', !state.started);
    state.fpsFrames = 0; state.fpsTime = 0;
  }
  renderer.render(scene, camera);
}

function boot() {
  state.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  buildInventory(); updateHealthUI(); bindInterface();
  const saved = readSavedWorld();
  const seed = saved?.seed ?? Number(localStorage.getItem('terravista-seed')) ?? 1337;
  $('seed-input').value = String(seed);
  setWorld(seed);
  if (saved) {
    state.edits = new Map(saved.edits || []);
    for (const chunk of state.chunks.values()) {
      for (const [position, id] of state.edits) {
        const [x, y, z] = position.split(',').map(Number);
        if (Math.floor(x / 16) === chunk.cx && Math.floor(z / 16) === chunk.cz && y >= 0 && y < WORLD_HEIGHT) {
          chunk.blocks[(y << 8) | ((((z % 16) + 16) % 16) << 4) | ((x % 16 + 16) % 16)] = id;
        }
      }
      rebuildChunk(chunk.cx, chunk.cz);
    }
    if (saved.player && [saved.player.x, saved.player.y, saved.player.z].every(Number.isFinite)) {
      Object.assign(state, { x: saved.player.x, y: saved.player.y, z: saved.player.z, yaw: saved.player.yaw || 0, pitch: saved.player.pitch || 0 });
    }
    state.hotbar = Array.isArray(saved.hotbar) && saved.hotbar.length === 9 ? saved.hotbar : [...HOTBAR_DEFAULT];
    state.selected = Math.max(0, Math.min(8, Number(saved.selected) || 0));
    state.time = Number(saved.time) || 0; state.day = Number(saved.day) || 0.32;
    camera.position.set(state.x, state.y + 1.62, state.z); camera.rotation.set(state.pitch, state.yaw, 0);
    rebuildHotbar(); updateBiomeUI();
  }
  updateDistance($('distance-range').value);
  setQuality(state.quality);
  requestAnimationFrame(animate);
}

boot();

function updateHealthUI() {
  const row = $('health-row');
  if (row.childElementCount) return;
  for (let i = 0; i < 10; i++) {
    const heart = document.createElement('span'); heart.className = 'heart';
    heart.innerHTML = '<svg viewBox="0 0 20 18" aria-hidden="true"><path d="M10 17S1 11.4 1 6.1C1 1.2 7.1.3 10 4.2 12.9.3 19 1.2 19 6.1 19 11.4 10 17 10 17Z" fill="#df7567" stroke="#f3c7a6" stroke-width="1"/></svg>';
    row.append(heart);
  }
}

