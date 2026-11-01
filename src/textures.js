import * as THREE from "three";

function makeCanvas(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function createGlowTexture(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.32, "rgba(255,255,255,0.32)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.04)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPointTexture(size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.8)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createSmokeTexture(size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    4,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,0.5)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.2)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawHand(ctx, x, y, scale, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.ellipse(0, 40, 55, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  const fingers = [
    [-39, -25, -0.38, 48],
    [-16, -54, -0.16, 68],
    [8, -61, 0.02, 76],
    [31, -52, 0.2, 65],
    [49, -31, 0.38, 48],
  ];
  for (const [fx, fy, angle, length] of fingers) {
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.roundRect(-13, -length, 26, length + 18, 13);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(-52, 62);
  ctx.rotate(-0.8);
  ctx.beginPath();
  ctx.roundRect(-14, -52, 30, 70, 15);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

export function createHandprintTexture(size = 512) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const rand = (() => {
    let seed = 479001599;
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();

  // Pigment blown around an open hand: a negative stencil.
  const cx = size * 0.52;
  const cy = size * 0.5;
  for (let i = 0; i < 11000; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.pow(rand(), 0.62) * size * 0.33;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 0.92;
    const edge = 1 - radius / (size * 0.33);
    const alpha = 0.05 + rand() * 0.2 * edge;
    const warmth = rand();
    ctx.fillStyle = `rgba(${170 + warmth * 50}, ${66 + warmth * 24}, ${30 + warmth * 12}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + rand() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few larger flecks.
  for (let i = 0; i < 70; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.pow(rand(), 0.5) * size * 0.35;
    ctx.fillStyle = `rgba(${150 + rand() * 50}, ${56 + rand() * 28}, ${24 + rand() * 14}, ${0.12 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius * 0.9,
      1 + rand() * 4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // The hand itself, pressed into the pigment. A positive print reads more
  // clearly against a dark cave wall than a negative stencil at this scale.
  ctx.save();
  ctx.fillStyle = "rgba(164, 67, 34, 0.86)";
  drawHand(ctx, cx, cy, 0.8, -0.04);
  ctx.restore();

  // Wear the edges away.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 180; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.pow(rand(), 0.6) * size * 0.34;
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.22})`;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius * 0.9,
      0.5 + rand() * 2.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createFootprintTexture(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const rand = (() => {
    let seed = 92821;
    return () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 4294967296;
    };
  })();
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(20,16,11,0.76)";
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.6, size * 0.17, size * 0.25, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.33, size * 0.14, size * 0.13, 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.82, size * 0.12, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  const toes = [
    [0.34, 0.22, 0.045],
    [0.43, 0.17, 0.04],
    [0.51, 0.16, 0.037],
    [0.59, 0.18, 0.032],
    [0.66, 0.22, 0.027],
  ];
  for (const [x, y, r] of toes) {
    ctx.beginPath();
    ctx.ellipse(size * x, size * y, size * r, size * r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Break the silhouette up with grit.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 500; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.22})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, rand() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGroundNormalTexture(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  let seed = 91357;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const hash = (x, y) => {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return (
      (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) +
      (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v
    );
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let h = 0;
      let amp = 0.55;
      let freq = 5;
      for (let o = 0; o < 5; o += 1) {
        h += noise((x / size) * freq + 3, (y / size) * freq - 2) * amp;
        amp *= 0.5;
        freq *= 2.1;
      }
      height[y * size + x] = h;
    }
  }

  // Scatter a few embedded pebbles.
  for (let i = 0; i < 260; i += 1) {
    const cx = Math.floor(rand() * size);
    const cy = Math.floor(rand() * size);
    const r = 1 + rand() * 4;
    for (let y = -r; y <= r; y += 1) {
      for (let x = -r; x <= r; x += 1) {
        const d = Math.hypot(x, y) / r;
        if (d > 1) continue;
        const px = (cx + x + size) % size;
        const py = (cy + y + size) % size;
        height[py * size + px] += Math.cos(d * Math.PI * 0.5) * 0.09;
      }
    }
  }

  const strength = 3.2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = height[y * size + ((x - 1 + size) % size)];
      const right = height[y * size + ((x + 1) % size)];
      const up = height[((y - 1 + size) % size) * size + x];
      const down = height[((y + 1) % size) * size + x];
      let nx = (left - right) * strength;
      let ny = (up - down) * strength;
      let nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;
      const i = (y * size + x) * 4;
      image.data[i] = (nx * 0.5 + 0.5) * 255;
      image.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.anisotropy = 4;
  return texture;
}
export function createStoneBumpTexture(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 90 + rand() * 110;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // A few pores.
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = `rgba(20,20,20,${rand() * 0.3})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}
