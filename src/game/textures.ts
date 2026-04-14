// Procedural DOOM-style textures generated at startup
const TEX_SIZE = 64;

export type TextureData = ImageData;

function createTexture(fn: (x: number, y: number) => [number, number, number]): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * TEX_SIZE + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) & 255;
}

// Wall type 1: Gray metal panels (tech base)
function metalWall(x: number, y: number): [number, number, number] {
  const brickH = 16, brickW = 32;
  const row = Math.floor(y / brickH);
  const offset = (row % 2) * (brickW / 2);
  const bx = (x + offset) % brickW;
  const by = y % brickH;
  // Mortar lines
  if (bx === 0 || by === 0) return [30, 30, 35];
  // Panel noise
  const n = hash(x, y) * 0.15;
  const base = 70 + n;
  // Rivet pattern
  if ((bx === 4 || bx === brickW - 4) && (by === 4 || by === brickH - 4)) {
    return [base + 30, base + 30, base + 35] as [number, number, number];
  }
  // Horizontal line detail
  if (by === Math.floor(brickH / 2)) {
    return [base - 10, base - 10, base - 5] as [number, number, number];
  }
  return [base, base, base + 5] as [number, number, number];
}

// Wall type 2: Blood red hell walls
function hellWall(x: number, y: number): [number, number, number] {
  const n = hash(x, y);
  const n2 = hash(x + 7, y + 13);
  const base = 80 + (n * 0.2);
  // Cracks
  const crack = Math.abs(Math.sin(x * 0.3 + y * 0.1) * Math.cos(y * 0.2)) > 0.85;
  if (crack) return [20, 5, 5];
  // Blood streaks
  if (n2 > 220 && y > 20) {
    return [140 + (n * 0.15), 10, 10] as [number, number, number];
  }
  // Demonic symbol hints
  const cx = x - 32, cy = y - 32;
  const ring = Math.abs(Math.sqrt(cx * cx + cy * cy) - 20);
  if (ring < 2 && n > 100) {
    return [160, 30, 10];
  }
  return [base + 40, base * 0.2, base * 0.15] as [number, number, number];
}

// Wall type 3: Green tech panels
function techWall(x: number, y: number): [number, number, number] {
  const panelW = 32, panelH = 32;
  const px = x % panelW, py = y % panelH;
  const n = hash(x, y) * 0.1;
  // Panel border
  if (px === 0 || py === 0 || px === panelW - 1 || py === panelH - 1) {
    return [20, 50, 20];
  }
  // Screen area in center
  if (px > 8 && px < 24 && py > 8 && py < 24) {
    const flicker = hash(x + Math.floor(Date.now() * 0.001), y) > 200 ? 30 : 0;
    return [10 + flicker, 80 + n + flicker, 20 + flicker] as [number, number, number];
  }
  // Panel body
  return [35 + n, 45 + n, 35 + n] as [number, number, number];
}

// Wall type 4: Blue energy walls
function energyWall(x: number, y: number): [number, number, number] {
  const n = hash(x, y) * 0.15;
  const wave = Math.sin(y * 0.15 + x * 0.05) * 20;
  const glow = Math.sin(y * 0.3) * 15;
  // Energy conduit lines
  if (x % 16 === 0 || x % 16 === 1) {
    return [40 + n, 60 + n, 180 + glow] as [number, number, number];
  }
  return [20 + n, 30 + n + wave * 0.3, 90 + n + wave + glow] as [number, number, number];
}

// Floor: dark industrial tiles
function floorTex(x: number, y: number): [number, number, number] {
  const tileSize = 16;
  const tx = x % tileSize, ty = y % tileSize;
  const n = hash(x, y) * 0.12;
  // Tile border/grout
  if (tx === 0 || ty === 0) return [20, 18, 15];
  // Tile surface
  const base = 40 + n;
  return [base, base - 3, base - 5] as [number, number, number];
}

// Ceiling: dark panels
function ceilingTex(x: number, y: number): [number, number, number] {
  const n = hash(x, y) * 0.1;
  const panelW = 32;
  const px = x % panelW;
  if (px === 0) return [15, 15, 18];
  const base = 25 + n;
  return [base, base, base + 3] as [number, number, number];
}

export interface TextureSet {
  walls: ImageData[];   // index 0 unused, 1-4 are wall types
  floor: ImageData;
  ceiling: ImageData;
  wallPixels: Uint8ClampedArray[]; // direct pixel access
  floorPixels: Uint8ClampedArray;
  ceilingPixels: Uint8ClampedArray;
}

export function generateTextures(): TextureSet {
  const w1 = createTexture(metalWall);
  const w2 = createTexture(hellWall);
  const w3 = createTexture(techWall);
  const w4 = createTexture(energyWall);
  const fl = createTexture(floorTex);
  const cl = createTexture(ceilingTex);
  // Dummy for index 0
  const dummy = createTexture(() => [0, 0, 0]);

  return {
    walls: [dummy, w1, w2, w3, w4],
    floor: fl,
    ceiling: cl,
    wallPixels: [dummy.data, w1.data, w2.data, w3.data, w4.data],
    floorPixels: fl.data,
    ceilingPixels: cl.data,
  };
}

export const TEX_W = TEX_SIZE;
export const TEX_H = TEX_SIZE;
