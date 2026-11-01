export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const smoothstep = (min, max, value) => {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
};

export const smootherstep = (min, max, value) => {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

// Small deterministic PRNG so every reload gets the same landscape.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = fade(xf);
  const v = fade(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalizer = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise(x * frequency, y * frequency) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / normalizer;
}

export function ridgedFbm(x, y, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalizer = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(valueNoise(x * frequency, y * frequency) * 2 - 1);
    value += n * n * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return value / normalizer;
}

export function terrainHeight(x, z) {
  const distance = Math.hypot(x, z);
  const clearing = smoothstep(1.9, 6.5, distance);
  const broad = (fbm(x * 0.11 + 3.2, z * 0.11 - 1.7, 4) - 0.5) * 0.7;
  const detail = (fbm(x * 0.47 - 2.4, z * 0.47 + 4.1, 3) - 0.5) * 0.11;
  const ridge = (ridgedFbm(x * 0.055, z * 0.055, 3) - 0.5) * 0.5;
  return (broad + detail + ridge * 0.4) * clearing;
}
