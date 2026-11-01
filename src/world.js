import * as THREE from "three";
import { STAGES } from "./data.js";
import skyUrl from "./assets/sky-sunset.jpg?url";
import groundNorUrl from "./assets/ground-nor.jpg?url";
import groundRoughUrl from "./assets/ground-rough.jpg?url";
import {
  clamp,
  fbm,
  mulberry32,
  smoothstep,
  smootherstep,
  terrainHeight,
} from "./noise.js";
import {
  createFootprintTexture,
  createGlowTexture,
  createGroundNormalTexture,
  createHandprintTexture,
  createPointTexture,
  createSmokeTexture,
  createStoneBumpTexture,
} from "./textures.js";

const COLOR_KEYS = [
  "skyTop",
  "skyHorizon",
  "skyBottom",
  "fog",
  "ground",
  "rock",
  "grass",
  "key",
  "rim",
  "ambientSky",
  "ambientGround",
  "dust",
  "sunColor",
];
const NUMBER_KEYS = [
  "fogDensity",
  "keyIntensity",
  "rimIntensity",
  "ambientIntensity",
  "dustOpacity",
  "stars",
  "snow",
  "tree",
  "cave",
  "fire",
  "footprints",
  "handprints",
  "sunOpacity",
  "sunScale",
  "moonOpacity",
  "moonScale",
  "exposure",
  "grassSway",
];

const ENV_FALLBACK = {
  moonColor: "#b9d2e6",
  moonPosition: [10, 9, -22],
  moonScale: 5,
};

function makeRockGeometry(detail = 1, seed = 1, amount = 0.22) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const random = mulberry32(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const scale = 1 + (random() - 0.5) * amount;
    v.multiplyScalar(scale);
    v.y *= 0.88 + random() * 0.18;
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeBladeGeometry() {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.028, 0, 0,
    0.028, 0, 0,
    -0.011, 0.55, 0,
    0.011, 0.55, 0,
    0, 1, 0,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

function makeGhost(height, width, pose) {
  const meshMaterial = new THREE.MeshStandardMaterial({
    color: "#3b3126",
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    emissive: "#21150d",
    emissiveIntensity: 0.12,
  });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(width * 0.17, width * 0.22, height * 0.3, 8),
    meshMaterial,
  );
  torso.position.y = height * 0.64;
  torso.rotation.z = pose * 0.06;
  group.add(torso);

  const shoulders = new THREE.Mesh(
    new THREE.SphereGeometry(width * 0.22, 10, 8),
    meshMaterial,
  );
  shoulders.position.y = height * 0.8;
  shoulders.scale.set(1, 0.6, 0.7);
  group.add(shoulders);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(width * 0.13, 12, 10),
    meshMaterial,
  );
  head.position.set(pose * 0.03, height * 0.94, 0.01);
  head.scale.set(0.9, 1.08, 0.95);
  group.add(head);

  const legGeo = new THREE.CylinderGeometry(width * 0.055, width * 0.045, height * 0.38, 6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, meshMaterial);
    leg.position.set(side * width * 0.075, height * 0.23, 0);
    leg.rotation.x = side * pose * 0.08;
    group.add(leg);

    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.045, width * 0.035, height * 0.34, 6),
      meshMaterial,
    );
    arm.position.set(side * width * 0.23, height * 0.62, 0);
    arm.rotation.z = side * (0.06 + pose * 0.05);
    arm.rotation.x = pose * 0.08;
    group.add(arm);
  }

  group.userData.material = meshMaterial;
  return group;
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.clock = 0;
    this.stageFloat = 0;

    this.mixes = STAGES.map((stage) => {
      const colors = {};
      for (const key of COLOR_KEYS) colors[key] = new THREE.Color(stage.env[key]);
      colors.moonColor = new THREE.Color(stage.env.moonColor ?? ENV_FALLBACK.moonColor);
      const numbers = {};
      for (const key of NUMBER_KEYS) {
        numbers[key] = stage.env[key] ?? ENV_FALLBACK[key] ?? 0;
      }
      return {
        colors,
        numbers,
        sunPosition: new THREE.Vector3(...stage.env.sunPosition),
        moonPosition: new THREE.Vector3(...(stage.env.moonPosition ?? ENV_FALLBACK.moonPosition)),
        keyPosition: new THREE.Vector3(...stage.env.keyPosition),
      };
    });

    this.env = {
      colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, new THREE.Color()])),
      numbers: Object.fromEntries(NUMBER_KEYS.map((key) => [key, 0])),
      sunPosition: new THREE.Vector3(),
      moonPosition: new THREE.Vector3(),
      keyPosition: new THREE.Vector3(),
    };
    this.env.colors.moonColor = new THREE.Color();

    this.glowTexture = createGlowTexture();
    this.pointTexture = createPointTexture();
    this.smokeTexture = createSmokeTexture();
    this.handTexture = createHandprintTexture();
    this.footprintTexture = createFootprintTexture();
    this.stoneBump = createStoneBumpTexture(256);
    this.stoneBump.repeat.set(5, 5);
    this.groundNormal = createGroundNormalTexture(512);

    this.buildLights();
    this.buildSky();
    this.buildLandscape();
    this.buildTrees();
    this.buildCave();
    this.buildFire();
    this.buildProps();
    this.buildParticles();
    this.buildCelestial();
    this.buildGhosts();

    this.updateEnvironment(0, 1);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight("#d9e2df", "#3b2b1c", 0.6);
    this.scene.add(this.hemi);

    this.key = new THREE.DirectionalLight("#ffd4a0", 2.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 32;
    this.key.shadow.camera.left = -8;
    this.key.shadow.camera.right = 8;
    this.key.shadow.camera.top = 9;
    this.key.shadow.camera.bottom = -4;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.key.target.position.set(0, 0.9, 0);
    this.scene.add(this.key, this.key.target);

    this.rim = new THREE.DirectionalLight("#7ba4bc", 1.3);
    this.rim.castShadow = false;
    this.scene.add(this.rim);

    this.fireLight = new THREE.PointLight("#ff8a3c", 0, 8, 2);
    this.fireLight.position.set(1.15, 0.5, 0.35);
    this.scene.add(this.fireLight);

    this.bounce = new THREE.PointLight("#6b8192", 4, 12, 2);
    this.bounce.position.set(-3, 1.8, 3);
    this.scene.add(this.bounce);
  }

  buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color("#112027") },
      uHorizon: { value: new THREE.Color("#d8945c") },
      uBottom: { value: new THREE.Color("#3a2b20") },
      uTime: { value: 0 },
      uSkyTexture: { value: null },
      uHasSky: { value: 0 },
      uSkyStrength: { value: 0.66 },
      uSkyRotation: { value: 0.08 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        uniform float uTime;
        uniform sampler2D uSkyTexture;
        uniform float uHasSky;
        uniform float uSkyStrength;
        uniform float uSkyRotation;
        varying vec3 vWorldPosition;

        vec3 srgbToLinear(vec3 c) {
          return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
        }

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec3 dir = normalize(vWorldPosition - cameraPosition);
          float elevation = clamp(dir.y, -1.0, 1.0);
          vec3 color = mix(uBottom, uHorizon, smoothstep(-0.18, 0.04, elevation));
          color = mix(color, uTop, smoothstep(0.02, 0.75, elevation));

          float angle = atan(dir.z, dir.x);
          float cloud = noise(vec2(angle * 2.0 + uTime * 0.006, elevation * 7.0));
          cloud += 0.5 * noise(vec2(angle * 5.0 - uTime * 0.01, elevation * 14.0));
          cloud = smoothstep(0.55, 1.35, cloud);
          float band = 1.0 - smoothstep(0.04, 0.42, abs(elevation - 0.1));
          color += cloud * band * 0.035;

          if (uHasSky > 0.5) {
            vec2 skyUv = vec2(
              atan(dir.z, dir.x) / 6.28318530718 + 0.5 + uSkyRotation,
              asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359 + 0.5
            );
            vec3 photo = srgbToLinear(texture2D(uSkyTexture, skyUv).rgb);
            float detail = dot(photo, vec3(0.299, 0.587, 0.114));
            detail = smoothstep(0.02, 0.92, detail);
            vec3 detailed = color * (0.62 + detail * 0.95) + photo * 0.06;
            color = mix(color, detailed, uSkyStrength);
          }

          float grain = hash(gl_FragCoord.xy) - 0.5;
          color += grain / 255.0;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.skyTexture = new THREE.TextureLoader().load(skyUrl, (texture) => {
      texture.colorSpace = THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 4;
      this.skyUniforms.uSkyTexture.value = texture;
      this.skyUniforms.uHasSky.value = 1;
    });    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 28), material);
    sky.renderOrder = -20;
    this.scene.add(sky);
    this.sky = sky;
  }

  buildLandscape() {
    const geometry = new THREE.PlaneGeometry(52, 52, 150, 150);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = terrainHeight(x, z);
      position.setY(i, y);
      const variation = 0.72 + fbm(x * 0.44 + 9, z * 0.44 - 3, 3) * 0.5;
      const patch = smoothstep(0.48, 0.72, fbm(x * 0.14 - 6, z * 0.14 + 2, 3));
      const tone = variation - patch * 0.16;
      colors[i * 3] = tone;
      colors[i * 3 + 1] = tone * 0.98;
      colors[i * 3 + 2] = tone * 0.92;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: "#8b765d",
      roughness: 0.94,
      metalness: 0,
      vertexColors: true,
      roughnessMap: null,
      normalMap: null,
      normalScale: new THREE.Vector2(1.1, 1.1),
    });
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    const textureLoader = new THREE.TextureLoader();
    const makeTile = (url, colorSpace = THREE.NoColorSpace) => {
      const texture = textureLoader.load(url);
      texture.colorSpace = colorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(10, 10);
      texture.anisotropy = 4;
      return texture;
    };
    const normalMap = makeTile(groundNorUrl);
    const roughnessMap = makeTile(groundRoughUrl);
    normalMap.onUpdate = () => { this.terrainMaterial.normalMap = normalMap; this.terrainMaterial.needsUpdate = true; };
    roughnessMap.onUpdate = () => { this.terrainMaterial.roughnessMap = roughnessMap; this.terrainMaterial.needsUpdate = true; };
    this.terrainMaterial.normalMap = normalMap;
    this.terrainMaterial.roughnessMap = roughnessMap;
    this.terrainMaterial.needsUpdate = true;

    this.snowMaterial = new THREE.MeshStandardMaterial({
      color: "#b9c9ce",
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      normalMap: this.groundNormal,
      normalScale: new THREE.Vector2(1.6, 1.6),
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.snowOverlay = new THREE.Mesh(geometry.clone(), this.snowMaterial);
    this.snowOverlay.position.y = 0.008;
    this.snowOverlay.receiveShadow = true;
    this.snowOverlay.visible = false;
    this.scene.add(this.snowOverlay);

    // Scattered stones.
    const random = mulberry32(11939);
    const rockGeo = makeRockGeometry(1, 119, 0.22);
    this.rockMaterial = new THREE.MeshStandardMaterial({
      color: "#5a4b38",
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    });
    const count = 170;
    const rocks = new THREE.InstancedMesh(rockGeo, this.rockMaterial, count);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 2.8 + Math.pow(random(), 0.7) * 16;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const size = 0.05 + Math.pow(random(), 2.2) * 0.36;
      pos.set(x, terrainHeight(x, z) + size * 0.24, z);
      euler.set(random() * 0.8, random() * Math.PI * 2, random() * 0.8);
      quat.setFromEuler(euler);
      scale.set(size * (0.75 + random() * 0.5), size * (0.45 + random() * 0.5), size * (0.75 + random() * 0.5));
      matrix.compose(pos, quat, scale);
      rocks.setMatrixAt(i, matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(rocks);
    this.rocks = rocks;

    // A few distant boulders to give the horizon weight without crowding the
    // specimen. The near-field is reserved for footprints and grass.
    this.boulders = new THREE.Group();
    const boulderPositions = [
      [-8.8, -2.4, 1.1, 0.12],
      [9.6, -5.2, 1.3, 1.4],
      [-12.5, 4.1, 1.5, 2.7],
    ];
    for (let i = 0; i < boulderPositions.length; i += 1) {
      const [x, z, size, rotation] = boulderPositions[i];
      const boulder = new THREE.Mesh(
        makeRockGeometry(2, 219 + i, 0.2),
        this.rockMaterial,
      );
      boulder.scale.set(size * 1.2, size * 0.75, size);
      boulder.position.set(x, terrainHeight(x, z) + size * 0.32, z);
      boulder.rotation.set(rotation * 0.2, rotation, rotation * 0.12);
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      this.boulders.add(boulder);
    }
    this.scene.add(this.boulders);

    // Grass blades, animated on the GPU.
    this.grassUniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.7 },
    };
    this.grassMaterial = new THREE.MeshStandardMaterial({
      color: "#6d5d38",
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.grassMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.grassUniforms.uTime;
      shader.uniforms.uWind = this.grassUniforms.uWind;
      shader.vertexShader = `
        uniform float uTime;
        uniform float uWind;
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
          #include <begin_vertex>
          float bladeHeight = max(position.y, 0.0);
          float sway = sin(uTime * 1.25 + instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29) * bladeHeight * bladeHeight * 0.22 * uWind;
          transformed.x += sway;
          transformed.z += cos(uTime * 0.83 + instanceMatrix[3].x * 0.23) * bladeHeight * bladeHeight * 0.08 * uWind;
        `,
      );
    };
    const bladeGeo = makeBladeGeometry();
    const grassCount = 2200;
    const grass = new THREE.InstancedMesh(bladeGeo, this.grassMaterial, grassCount);
    const grassColor = new THREE.Color();
    for (let i = 0; i < grassCount; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 1.7 + Math.pow(random(), 0.6) * 13;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 0.28 + random() * 0.72;
      pos.set(x, terrainHeight(x, z), z);
      euler.set(0, random() * Math.PI * 2, 0);
      quat.setFromEuler(euler);
      scale.set(height * 0.85, height, height * 0.85);
      matrix.compose(pos, quat, scale);
      grass.setMatrixAt(i, matrix);
      const shade = 0.68 + random() * 0.45;
      grassColor.setRGB(shade, shade * 0.94, shade * 0.7);
      grass.setColorAt(i, grassColor);
    }
    grass.instanceMatrix.needsUpdate = true;
    grass.instanceColor.needsUpdate = true;
    grass.castShadow = false;
    grass.receiveShadow = true;
    grass.frustumCulled = false;
    this.scene.add(grass);
    this.grass = grass;

    // Low, dark shrubs.
    const shrubGeo = new THREE.IcosahedronGeometry(1, 0);
    this.shrubMaterial = new THREE.MeshStandardMaterial({
      color: "#3d3a27",
      roughness: 1,
      flatShading: true,
    });
    const shrubs = new THREE.InstancedMesh(shrubGeo, this.shrubMaterial, 44);
    for (let i = 0; i < 44; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 5 + random() * 11;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const size = 0.2 + random() * 0.5;
      pos.set(x, terrainHeight(x, z) + size * 0.3, z);
      euler.set(random() * 0.3, random() * Math.PI * 2, random() * 0.3);
      quat.setFromEuler(euler);
      scale.set(size * 1.5, size * 0.7, size * 1.1);
      matrix.compose(pos, quat, scale);
      shrubs.setMatrixAt(i, matrix);
    }
    shrubs.instanceMatrix.needsUpdate = true;
    shrubs.castShadow = true;
    this.scene.add(shrubs);
    this.shrubs = shrubs;

    // A single, continuous ridge line instead of a ring of shards. Fog does
    // most of the work; the silhouette is there only to give the horizon depth.
    const segments = 180;
    const ridgePositions = new Float32Array((segments + 1) * 2 * 3);
    const ridgeIndices = [];
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const radius = 43 + fbm(Math.cos(angle) * 2.2 + 8, Math.sin(angle) * 2.2 - 4, 3) * 7;
      const height =
        1.2 +
        fbm(Math.cos(angle) * 3.4 - 2, Math.sin(angle) * 3.4 + 6, 4) * 5.8 +
        fbm(Math.cos(angle) * 9 + 1, Math.sin(angle) * 9, 2) * 1.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const top = i * 6;
      ridgePositions[top] = x;
      ridgePositions[top + 1] = height;
      ridgePositions[top + 2] = z;
      ridgePositions[top + 3] = x;
      ridgePositions[top + 4] = -2.5;
      ridgePositions[top + 5] = z;
      if (i < segments) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        ridgeIndices.push(a, b, c, c, b, d);
      }
    }
    const ridgeGeometry = new THREE.BufferGeometry();
    ridgeGeometry.setAttribute("position", new THREE.BufferAttribute(ridgePositions, 3));
    ridgeGeometry.setIndex(ridgeIndices);
    ridgeGeometry.computeVertexNormals();
    this.mountainMaterial = new THREE.MeshBasicMaterial({
      color: "#5d5343",
      fog: true,
      side: THREE.DoubleSide,
    });
    this.mountains = new THREE.Mesh(ridgeGeometry, this.mountainMaterial);
    this.mountains.renderOrder = -2;
    this.scene.add(this.mountains);
  }

  buildTrees() {
    this.treeMaterial = new THREE.MeshStandardMaterial({
      color: "#3c3727",
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 1,
      depthWrite: true,
    });
    this.trees = new THREE.Group();
    this.treeCanopies = [];
    const treeData = [
      [-9.2, -10.8, 4.6, 0.4],
      [8.4, -13.2, 5.5, 1.3],
      [-14.5, -7.5, 3.7, 2.2],
    ];
    for (let t = 0; t < treeData.length; t += 1) {
      const [x, z, height, phase] = treeData[t];
      const group = new THREE.Group();
      group.position.set(x, terrainHeight(x, z), z);
      const trunkMat = this.treeMaterial;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(height * 0.012, height * 0.03, height * 0.52, 7),
        trunkMat,
      );
      trunk.position.y = height * 0.26;
      trunk.rotation.z = 0.04;
      group.add(trunk);

      const branchA = new THREE.Mesh(
        new THREE.CylinderGeometry(height * 0.008, height * 0.018, height * 0.38, 6),
        trunkMat,
      );
      branchA.position.set(-height * 0.09, height * 0.58, 0.02);
      branchA.rotation.z = 0.82;
      group.add(branchA);
      const branchB = branchA.clone();
      branchB.position.x = height * 0.08;
      branchB.rotation.z = -0.7;
      group.add(branchB);

      const canopy = new THREE.Group();
      canopy.position.y = height * 0.72;
      const clusters = 12;
      const canopyRandom = mulberry32(41 + t * 17);
      for (let c = 0; c < clusters; c += 1) {
        const leaf = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 1),
          trunkMat,
        );
        const angle = (c / clusters) * Math.PI * 2;
        const radius = height * (0.04 + canopyRandom() * 0.17);
        leaf.position.set(
          Math.cos(angle) * radius,
          (canopyRandom() - 0.35) * height * 0.2,
          Math.sin(angle) * radius * 0.65,
        );
        leaf.scale.set(
          height * (0.07 + canopyRandom() * 0.06),
          height * (0.035 + canopyRandom() * 0.045),
          height * (0.06 + canopyRandom() * 0.055),
        );
        leaf.rotation.y = canopyRandom() * Math.PI;
        canopy.add(leaf);
      }
      group.add(canopy);
      this.treeCanopies.push({ group: canopy, phase });
      this.trees.add(group);
    }
    this.scene.add(this.trees);
  }

  buildCave() {
    this.caveMaterial = new THREE.MeshStandardMaterial({
      color: "#4d3d2d",
      roughness: 0.97,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    this.caveGroup = new THREE.Group();
    this.caveGroup.visible = false;

    const wallGeometry = new THREE.PlaneGeometry(7.2, 4.7, 36, 24);
    const wallPos = wallGeometry.attributes.position;
    for (let i = 0; i < wallPos.count; i += 1) {
      const x = wallPos.getX(i);
      const y = wallPos.getY(i);
      wallPos.setZ(i, (fbm(x * 0.6 + 3, y * 0.6 - 2, 4) - 0.5) * 0.22);
    }
    wallGeometry.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeometry, this.caveMaterial);
    wall.position.set(0.2, 2.15, -3.45);
    wall.receiveShadow = true;
    wall.renderOrder = 1;
    this.caveGroup.add(wall);
    this.caveWall = wall;

    const caveRocks = [
      [-3.9, 1.0, -2.9, 1.4, 2.0, 1.15, 0.2],
      [4.0, 0.95, -3.0, 1.5, 2.1, 1.2, 1.1],
      [-2.1, 4.15, -2.9, 2.5, 0.85, 1.1, 0.15],
      [2.0, 4.2, -3.0, 2.6, 0.9, 1.2, 0.7],
      [-3.1, 0.35, -2.2, 1.0, 0.5, 0.85, 1.8],
      [3.4, 0.35, -2.15, 1.1, 0.45, 0.9, 0.5],
    ];
    this.caveRocks = [];
    for (let i = 0; i < caveRocks.length; i += 1) {
      const [x, y, z, sx, sy, sz, rotation] = caveRocks[i];
      const rock = new THREE.Mesh(
        makeRockGeometry(2, 871 + i, 0.17),
        this.caveMaterial,
      );
      rock.position.set(x, y, z);
      rock.scale.set(sx, sy, sz);
      rock.rotation.set(rotation * 0.12, rotation, rotation * 0.06);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.renderOrder = 1;
      this.caveGroup.add(rock);
      this.caveRocks.push(rock);
    }

    this.handprintMaterial = new THREE.MeshBasicMaterial({
      map: this.handTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: "#a2826d",
    });
    const prints = [
      [-1.8, 1.72, 0.55, -0.1],
      [1.55, 1.55, 0.58, -0.04],
      [2.0, 2.18, 0.44, 0.1],
    ];
    for (const [x, y, scale, rotation] of prints) {
      const print = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.handprintMaterial);
      print.position.set(x, y, -3.24);
      print.scale.setScalar(scale);
      print.rotation.z = rotation;
      print.renderOrder = 3;
      this.caveGroup.add(print);
    }

    this.scene.add(this.caveGroup);
  }

  buildFire() {
    this.fireGroup = new THREE.Group();
    const fireX = 1.2;
    const fireZ = 0.3;
    const fireY = terrainHeight(fireX, fireZ);
    this.fireGroup.position.set(fireX, fireY, fireZ);
    this.scene.add(this.fireGroup);
    this.firePosition = new THREE.Vector3(fireX, fireY, fireZ);

    const charred = new THREE.MeshStandardMaterial({
      color: "#211811",
      roughness: 1,
    });
    const logGeo = new THREE.CylinderGeometry(0.032, 0.045, 0.62, 7);
    for (let i = 0; i < 4; i += 1) {
      const log = new THREE.Mesh(logGeo, charred);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI + 0.2;
      log.position.y = 0.05 + i * 0.01;
      log.position.x = Math.cos(i * 2.1) * 0.03;
      log.position.z = Math.sin(i * 2.1) * 0.03;
      log.castShadow = true;
      this.fireGroup.add(log);
    }

    const stoneGeo = new THREE.DodecahedronGeometry(1, 0);
    const ringMat = new THREE.MeshStandardMaterial({
      color: "#5a5448",
      roughness: 0.9,
      flatShading: true,
    });
    for (let i = 0; i < 11; i += 1) {
      const angle = (i / 11) * Math.PI * 2;
      const stone = new THREE.Mesh(stoneGeo, ringMat);
      const radius = 0.38 + Math.random() * 0.05;
      stone.position.set(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius);
      stone.scale.set(0.09 + Math.random() * 0.05, 0.06 + Math.random() * 0.03, 0.08 + Math.random() * 0.04);
      stone.rotation.set(Math.random(), Math.random() * 3, Math.random());
      stone.castShadow = true;
      this.fireGroup.add(stone);
    }

    this.fireGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: "#ff9746",
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.75,
      }),
    );
    this.fireGlow.position.y = 0.34;
    this.fireGlow.scale.set(1.25, 1.25, 1);
    this.fireGroup.add(this.fireGlow);

    // Flame particles.
    this.flameCount = 190;
    const positions = new Float32Array(this.flameCount * 3);
    const colors = new Float32Array(this.flameCount * 3);
    const sizes = new Float32Array(this.flameCount);
    const alphas = new Float32Array(this.flameCount);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    this.flameGeometry = geometry;

    this.flameMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.8) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uPixelRatio * (280.0 / max(0.1, -mv.z)), 0.8, 80.0);
          vColor = aColor;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uOpacity;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flames = new THREE.Points(geometry, this.flameMaterial);
    this.flames.frustumCulled = false;
    this.fireGroup.add(this.flames);
    this.flameParticles = Array.from({ length: this.flameCount }, () => this.spawnFlame(true));

    // Smoke.
    this.smokeParticles = [];
    for (let i = 0; i < 9; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.smokeTexture,
        color: "#665c52",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(0, 0, 0);
      this.fireGroup.add(sprite);
      this.smokeParticles.push({
        sprite,
        life: i / 9,
        speed: 0.12 + Math.random() * 0.08,
        drift: (Math.random() - 0.5) * 0.15,
        scale: 0.8 + Math.random() * 0.7,
      });
    }

    this.fireGroup.visible = false;
  }

  spawnFlame(initial = false) {
    const ember = Math.random() < 0.14;
    return {
      life: initial ? Math.random() : 0,
      speed: ember ? 0.12 + Math.random() * 0.12 : 0.7 + Math.random() * 0.8,
      baseX: (Math.random() - 0.5) * (ember ? 0.35 : 0.22),
      baseZ: (Math.random() - 0.5) * (ember ? 0.35 : 0.2),
      height: ember ? 1.2 + Math.random() * 0.9 : 0.45 + Math.random() * 0.42,
      size: ember ? 0.018 + Math.random() * 0.02 : 0.1 + Math.random() * 0.16,
      phase: Math.random() * Math.PI * 2,
      drift: 0.04 + Math.random() * 0.16,
      ember,
    };
  }

  buildProps() {
    // Footprints leading out of the distance.
    this.footprintMaterial = new THREE.MeshBasicMaterial({
      map: this.footprintTexture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: "#2b2117",
    });
    this.footprints = new THREE.Group();
    const printGeo = new THREE.PlaneGeometry(0.3, 0.46);
    printGeo.rotateX(-Math.PI / 2);
    const points = [
      [0.45, 3.9],
      [0.12, 3.25],
      [0.38, 2.6],
      [-0.08, 1.95],
      [0.24, 1.35],
      [-0.2, 0.78],
    ];
    for (let i = 0; i < points.length; i += 1) {
      for (const side of [-1, 1]) {
        const [x, z] = points[i];
        const footprint = new THREE.Mesh(printGeo, this.footprintMaterial);
        const offsetX = side * 0.095;
        footprint.position.set(
          x + offsetX,
          terrainHeight(x + offsetX, z + i * 0.18) + 0.012,
          z + i * 0.18,
        );
        footprint.rotation.y = -0.22 + side * 0.08;
        footprint.scale.setScalar(0.8 + i * 0.03);
        footprint.renderOrder = 2;
        this.footprints.add(footprint);
      }
    }
    this.scene.add(this.footprints);

    // A spear planted near the camp.
    this.spearGroup = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.017, 1.72, 7),
      new THREE.MeshStandardMaterial({ color: "#4c3622", roughness: 0.88 }),
    );
    shaft.position.y = 0.86;
    shaft.castShadow = true;
    this.spearGroup.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.036, 0.18, 5),
      new THREE.MeshStandardMaterial({ color: "#7b7569", roughness: 0.72, flatShading: true }),
    );
    tip.position.y = 1.8;
    tip.castShadow = true;
    this.spearGroup.add(tip);
    const binding = new THREE.Mesh(
      new THREE.TorusGeometry(0.025, 0.009, 5, 12),
      new THREE.MeshStandardMaterial({ color: "#2a1c11", roughness: 1 }),
    );
    binding.rotation.x = Math.PI / 2;
    binding.position.y = 1.68;
    this.spearGroup.add(binding);
    this.spearGroup.position.set(0.95, terrainHeight(0.95, -0.4), -0.4);
    this.spearGroup.rotation.z = -0.1;
    this.spearGroup.rotation.x = 0.04;
    this.spearGroup.visible = false;
    this.scene.add(this.spearGroup);

    // A handaxe resting on a flat stone.
    this.axeGroup = new THREE.Group();
    const axeShape = new THREE.Shape();
    axeShape.moveTo(0, -0.18);
    axeShape.bezierCurveTo(0.11, -0.11, 0.13, 0.06, 0, 0.2);
    axeShape.bezierCurveTo(-0.13, 0.06, -0.11, -0.11, 0, -0.18);
    const axeGeo = new THREE.ExtrudeGeometry(axeShape, {
      depth: 0.025,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.012,
      bevelThickness: 0.01,
      steps: 1,
    });
    axeGeo.center();
    const axe = new THREE.Mesh(
      axeGeo,
      new THREE.MeshStandardMaterial({
        color: "#81796b",
        roughness: 0.62,
        metalness: 0.03,
        flatShading: true,
      }),
    );
    axe.scale.set(1.4, 1.4, 1.4);
    axe.rotation.x = Math.PI / 2;
    axe.rotation.z = 0.5;
    axe.castShadow = true;
    axe.position.y = 0.03;
    this.axeGroup.add(axe);
    const base = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.3, 0),
      this.rockMaterial,
    );
    base.scale.set(1.2, 0.28, 0.9);
    base.position.y = -0.03;
    base.receiveShadow = true;
    this.axeGroup.add(base);
    this.axeGroup.position.set(-0.75, terrainHeight(-0.75, 0.65) + 0.12, 0.65);
    this.axeGroup.visible = false;
    this.scene.add(this.axeGroup);
  }

  buildParticles() {
    // Dust suspended in the air.
    this.dustUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0.7 },
      uColor: { value: new THREE.Color("#f2c793") },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.8) },
    };
    const dustCount = 820;
    const dustPos = new Float32Array(dustCount * 3);
    const dustSize = new Float32Array(dustCount);
    const dustPhase = new Float32Array(dustCount);
    const dustDrift = new Float32Array(dustCount);
    const dustRandom = mulberry32(541);
    for (let i = 0; i < dustCount; i += 1) {
      dustPos[i * 3] = (dustRandom() - 0.5) * 19;
      dustPos[i * 3 + 1] = dustRandom() * 4.8;
      dustPos[i * 3 + 2] = (dustRandom() - 0.5) * 19;
      dustSize[i] = 0.35 + Math.pow(dustRandom(), 2.4) * 1.5;
      dustPhase[i] = dustRandom() * Math.PI * 2;
      dustDrift[i] = 0.3 + dustRandom() * 1.2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute("aSize", new THREE.BufferAttribute(dustSize, 1));
    dustGeo.setAttribute("aPhase", new THREE.BufferAttribute(dustPhase, 1));
    dustGeo.setAttribute("aDrift", new THREE.BufferAttribute(dustDrift, 1));
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: this.dustUniforms,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute float aDrift;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * 0.055 * aDrift + 8.0, 5.6) - 0.3;
          p.x += sin(uTime * 0.09 + aPhase) * aDrift * 0.65;
          p.z += cos(uTime * 0.07 + aPhase * 1.3) * aDrift * 0.65;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uPixelRatio * (52.0 / max(0.2, -mv.z)), 0.4, 7.5);
          vAlpha = 0.2 + 0.8 * (0.5 + 0.5 * sin(uTime * 0.7 + aPhase * 2.0));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMaterial);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    // Snow.
    this.snowUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.8) },
    };
    const snowCount = 650;
    const snowPos = new Float32Array(snowCount * 3);
    const snowSize = new Float32Array(snowCount);
    const snowPhase = new Float32Array(snowCount);
    const snowSpeed = new Float32Array(snowCount);
    const snowRandom = mulberry32(1977);
    for (let i = 0; i < snowCount; i += 1) {
      snowPos[i * 3] = (snowRandom() - 0.5) * 18;
      snowPos[i * 3 + 1] = snowRandom() * 12;
      snowPos[i * 3 + 2] = (snowRandom() - 0.5) * 18;
      snowSize[i] = 0.45 + snowRandom() * 1.7;
      snowPhase[i] = snowRandom() * Math.PI * 2;
      snowSpeed[i] = 0.6 + snowRandom() * 1.1;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
    snowGeo.setAttribute("aSize", new THREE.BufferAttribute(snowSize, 1));
    snowGeo.setAttribute("aPhase", new THREE.BufferAttribute(snowPhase, 1));
    snowGeo.setAttribute("aSpeed", new THREE.BufferAttribute(snowSpeed, 1));
    this.snowMaterial = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 0.75 * aSpeed + 12.0, 12.0);
          p.x += sin(uTime * 0.7 + aPhase) * 0.5 + uTime * 0.05;
          p.z += cos(uTime * 0.5 + aPhase * 1.4) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uPixelRatio * (58.0 / max(0.2, -mv.z)), 0.6, 11.0);
          vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.1 + aPhase));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(0.9, 0.96, 1.0, a * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.snow = new THREE.Points(snowGeo, this.snowMaterial);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);

    // Stars, including a faint galactic band.
    this.starUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.8) },
    };
    const starCount = 1700;
    const starPos = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    const starPhase = new Float32Array(starCount);
    const starColor = new Float32Array(starCount * 3);
    const starRandom = mulberry32(882);
    for (let i = 0; i < starCount; i += 1) {
      const band = i < 440;
      let theta = starRandom() * Math.PI * 2;
      let y;
      if (band) {
        y = 0.35 + (starRandom() - 0.5) * 0.28;
      } else {
        y = Math.pow(starRandom(), 0.55) * 0.96 + 0.04;
      }
      const radius = 72;
      const r = Math.sqrt(1 - y * y);
      starPos[i * 3] = Math.cos(theta) * r * radius;
      starPos[i * 3 + 1] = y * radius;
      starPos[i * 3 + 2] = Math.sin(theta) * r * radius;
      starSize[i] = 0.5 + Math.pow(starRandom(), 3) * 3.2;
      starPhase[i] = starRandom() * Math.PI * 2;
      const tint = starRandom();
      starColor[i * 3] = 0.65 + tint * 0.35;
      starColor[i * 3 + 1] = 0.72 + tint * 0.25;
      starColor[i * 3 + 2] = 0.85 + tint * 0.15;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));
    starGeo.setAttribute("aPhase", new THREE.BufferAttribute(starPhase, 1));
    starGeo.setAttribute("aColor", new THREE.BufferAttribute(starColor, 3));
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float twinkle = 0.68 + 0.32 * sin(uTime * (0.6 + aPhase * 0.12) + aPhase * 5.0);
          gl_PointSize = clamp(aSize * uPixelRatio * (1.0 + twinkle), 0.5, 8.0);
          vColor = aColor;
          vAlpha = twinkle;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.04, d);
          gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -5;
    this.scene.add(this.stars);

    // Low mist near the ground.
    this.mistParticles = [];
    for (let i = 0; i < 7; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.smokeTexture,
        color: "#c8b69d",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      const x = (i / 6 - 0.5) * 20 + (i % 2 ? 1.5 : -1.3);
      const z = -10 - (i % 3) * 2.5;
      sprite.position.set(x, 0.65 + (i % 2) * 0.25, z);
      sprite.scale.set(12 + (i % 3) * 4, 3.2 + (i % 2) * 1.4, 1);
      this.scene.add(sprite);
      this.mistParticles.push({ sprite, phase: i * 1.7 });
    }
  }

  buildCelestial() {
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: "#ffc07d",
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 1,
        fog: false,
      }),
    );
    this.sunSprite.position.set(-15, 3.4, -24);
    this.scene.add(this.sunSprite);

    this.moonSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: "#c9ddec",
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
        fog: false,
      }),
    );
    this.moonSprite.position.set(10, 9, -22);
    this.scene.add(this.moonSprite);
  }

  buildGhosts() {
    this.ghosts = new THREE.Group();
    this.ghostData = [
      [-2.2, -2.6, 1.04, 0.86, 0.3],
      [2.3, -3.3, 1.26, 0.9, -0.2],
      [-3.7, -4.6, 1.48, 0.94, 0.4],
      [3.6, -5.5, 1.62, 0.98, -0.35],
      [-1.5, -6.3, 1.68, 1.0, 0.15],
      [1.6, -7.2, 1.72, 1.0, -0.1],
    ];
    for (let i = 0; i < this.ghostData.length; i += 1) {
      const [x, z, height, width, pose] = this.ghostData[i];
      const ghost = makeGhost(height, width, pose);
      ghost.position.set(x, terrainHeight(x, z), z);
      ghost.rotation.y = -0.25 + i * 0.08;
      ghost.userData.baseY = ghost.position.y;
      ghost.userData.index = i;
      this.ghosts.add(ghost);
    }
    this.ghosts.visible = false;
    this.scene.add(this.ghosts);
  }

  updateEnvironment(stageFloat, delta) {
    const last = STAGES.length - 1;
    const progress = clamp(stageFloat, 0, last);
    const index = Math.min(Math.floor(progress), last - 1);
    const frac = progress - index;
    const t = smootherstep(0.1, 0.9, frac);
    const a = this.mixes[index];
    const b = this.mixes[Math.min(index + 1, last)];

    for (const key of COLOR_KEYS) {
      this.env.colors[key].lerpColors(a.colors[key], b.colors[key], t);
    }
    this.env.colors.moonColor.lerpColors(a.colors.moonColor, b.colors.moonColor, t);
    for (const key of NUMBER_KEYS) {
      this.env.numbers[key] = THREE.MathUtils.lerp(a.numbers[key], b.numbers[key], t);
    }
    this.env.sunPosition.lerpVectors(a.sunPosition, b.sunPosition, t);
    this.env.moonPosition.lerpVectors(a.moonPosition, b.moonPosition, t);
    this.env.keyPosition.lerpVectors(a.keyPosition, b.keyPosition, t);
  }

  applyEnvironment(time, stageFloat) {
    const env = this.env;
    const num = env.numbers;
    const col = env.colors;

    this.scene.fog.color.copy(col.fog);
    this.scene.fog.density = num.fogDensity;

    this.skyUniforms.uTop.value.copy(col.skyTop);
    this.skyUniforms.uHorizon.value.copy(col.skyHorizon);
    this.skyUniforms.uBottom.value.copy(col.skyBottom);
    this.skyUniforms.uTime.value = time;

    this.hemi.color.copy(col.ambientSky);
    this.hemi.groundColor.copy(col.ambientGround);
    this.hemi.intensity = num.ambientIntensity;

    this.key.color.copy(col.key);
    this.key.intensity = num.keyIntensity;
    this.key.position.copy(env.keyPosition);
    this.key.position.y = Math.max(2.2, this.key.position.y);

    this.rim.color.copy(col.rim);
    this.rim.intensity = num.rimIntensity;
    this.rim.position.set(-this.key.position.x * 0.9, 3.4, -Math.abs(this.key.position.z) - 4);

    this.terrainMaterial.color.copy(col.ground).lerp(new THREE.Color("#b4a072"), 0.32);
    this.rockMaterial.color.copy(col.rock);
    this.grassMaterial.color.copy(col.grass);
    this.shrubMaterial.color.copy(col.grass).multiplyScalar(0.55);
    this.mountainMaterial.color.copy(col.fog).multiplyScalar(0.82);
    this.treeMaterial.color.copy(col.fog).multiplyScalar(0.32);
    this.treeMaterial.opacity = num.tree;
    this.trees.visible = num.tree > 0.015;

    this.grassUniforms.uWind.value = num.grassSway;
    this.grassUniforms.uTime.value = time;
    this.shrubs.visible = num.tree > 0.02;

    this.footprintMaterial.opacity = num.footprints * 0.62;
    this.footprints.visible = num.footprints > 0.01;

    const cave = num.cave;
    this.caveMaterial.opacity = cave;
    this.caveGroup.visible = cave > 0.015;
    this.handprintMaterial.opacity = num.handprints * Math.min(1, cave * 2.4) * 0.58;

    this.sunSprite.material.color.copy(col.sunColor);
    this.sunSprite.material.opacity = num.sunOpacity;
    this.sunSprite.position.copy(env.sunPosition);
    this.sunSprite.scale.setScalar(num.sunScale);
    this.sunSprite.visible = num.sunOpacity > 0.01;

    this.moonSprite.material.color.copy(col.moonColor);
    this.moonSprite.material.opacity = num.moonOpacity;
    this.moonSprite.position.copy(env.moonPosition);
    this.moonSprite.scale.setScalar(num.moonScale);
    this.moonSprite.visible = num.moonOpacity > 0.01;

    this.dustMaterial.uniformsNeedUpdate = false;
    this.dustUniforms.uTime.value = time;
    this.dustUniforms.uOpacity.value = num.dustOpacity;
    this.dustUniforms.uColor.value.copy(col.dust);
    this.dust.visible = num.dustOpacity > 0.01;

    this.snowUniforms.uTime.value = time;
    this.snowUniforms.uOpacity.value = num.snow;
    this.snow.visible = num.snow > 0.01;
    this.snowOverlay.visible = num.snow > 0.02;
    this.snowOverlay.material.opacity = Math.min(1, num.snow * 1.3);
    this.snowOverlay.material.color.copy(col.fog).lerp(new THREE.Color("#eef7fa"), 0.62);

    this.starUniforms.uTime.value = time;
    this.starUniforms.uOpacity.value = num.stars;
    this.stars.visible = num.stars > 0.01;

    this.key.shadow.intensity = 0.82;
    this.renderer.toneMappingExposure = num.exposure * 1.2;

    // Fire follows the campfire.
    const fire = num.fire;
    this.fireGroup.visible = fire > 0.015;
    this.fireLight.intensity = fire * 8;
    this.fireLight.color.set("#ff8a3c");
    this.fireGlow.material.opacity = fire * 0.55;
    this.flameMaterial.uniforms.uOpacity.value = fire;
    this.flameMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.8);
    this.dustUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.8);
    this.snowUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.8);

    this.trees.children.forEach((tree, i) => {
      const canopy = this.treeCanopies[i];
      if (canopy) {
        canopy.group.rotation.z = Math.sin(time * 0.33 + canopy.phase) * 0.018 * num.tree;
        canopy.group.rotation.x = Math.cos(time * 0.27 + canopy.phase) * 0.012 * num.tree;
      }
    });

    this.mistParticles.forEach(({ sprite, phase }, i) => {
      const amount =
        num.snow * 0.16 + num.cave * 0.09 + num.fire * 0.035 + 0.025;
      sprite.material.opacity = amount;
      sprite.material.color.copy(col.fog).lerp(new THREE.Color("#d6c4a5"), 0.4);
      sprite.position.x += Math.sin(time * 0.05 + phase) * 0.0008;
      sprite.position.y = 0.7 + Math.sin(time * 0.08 + phase) * 0.12;
      sprite.visible = amount > 0.01;
    });

    // Props belong to deep time, not to every chapter.
    this.spearGroup.visible = stageFloat > 1.75 && stageFloat < 4.55;
    this.axeGroup.visible = stageFloat > 1.35 && stageFloat < 5.6;

    const ghostOpacity = smoothstep(5.42, 6.0, stageFloat);
    this.ghosts.visible = ghostOpacity > 0.005;
    this.ghosts.children.forEach((ghost, i) => {
      const material = ghost.userData.material;
      const appear = smoothstep(5.4 + i * 0.07, 5.82 + i * 0.055, stageFloat);
      material.opacity = appear * 0.33;
      ghost.position.y = ghost.userData.baseY + Math.sin(time * 0.35 + i * 1.7) * 0.012;
      ghost.rotation.y += Math.sin(time * 0.12 + i) * 0.0002;
    });

    this.fireLight.position.copy(this.firePosition).add(new THREE.Vector3(0, 0.42, 0));
    this.fireLight.intensity *= 0.92 + Math.sin(time * 15.7) * 0.05 + Math.sin(time * 27.1) * 0.03;
  }

  updateFire(delta, time, fireAmount) {
    if (!this.fireGroup.visible && fireAmount < 0.01) return;
    const positions = this.flameGeometry.attributes.position.array;
    const colors = this.flameGeometry.attributes.aColor.array;
    const sizes = this.flameGeometry.attributes.aSize.array;
    const alphas = this.flameGeometry.attributes.aAlpha.array;
    const color = new THREE.Color();
    const hot = new THREE.Color("#ffe3a1");
    const mid = new THREE.Color("#ff9a3c");
    const cool = new THREE.Color("#7b2b12");

    for (let i = 0; i < this.flameCount; i += 1) {
      const p = this.flameParticles[i];
      p.life += delta * p.speed;
      if (p.life > 1) {
        const fresh = this.spawnFlame(false);
        Object.assign(p, fresh);
      }
      const life = p.life;
      const t = Math.min(life, 1);
      const spread = 1 - t * 0.55;
      const x = p.baseX * spread + Math.sin(time * 3.2 + p.phase) * p.drift * t;
      const z = p.baseZ * spread + Math.cos(time * 2.7 + p.phase * 1.2) * p.drift * t;
      const y = 0.05 + t * p.height;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      if (p.ember) {
        color.copy(mid).lerp(cool, t);
        sizes[i] = p.size * (1 - t * 0.5);
        alphas[i] = Math.sin(Math.min(1, t * 1.5) * Math.PI) * 0.75;
      } else {
        if (t < 0.42) color.copy(hot).lerp(mid, t / 0.42);
        else color.copy(mid).lerp(cool, (t - 0.42) / 0.58);
        sizes[i] = p.size * (1 - t * 0.75);
        alphas[i] = Math.sin(Math.min(1, t * 1.8) * Math.PI) * 0.55;
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    this.flameGeometry.attributes.position.needsUpdate = true;
    this.flameGeometry.attributes.aColor.needsUpdate = true;
    this.flameGeometry.attributes.aSize.needsUpdate = true;
    this.flameGeometry.attributes.aAlpha.needsUpdate = true;

    this.fireGlow.material.opacity = fireAmount * (0.55 + Math.sin(time * 13) * 0.06);

    this.smokeParticles.forEach((smoke) => {
      smoke.life += delta * smoke.speed;
      if (smoke.life > 1) smoke.life = 0;
      const t = smoke.life;
      smoke.sprite.position.set(
        Math.sin(time * 0.8 + t * 5) * 0.18 * t + smoke.drift * t,
        0.25 + t * 1.6,
        Math.cos(time * 0.7 + t * 4) * 0.12 * t,
      );
      const scale = (0.35 + t * 1.2) * smoke.scale;
      smoke.sprite.scale.set(scale, scale, 1);
      smoke.sprite.material.opacity = Math.sin(t * Math.PI) * 0.1 * fireAmount;
    });
  }

  update(stageFloat, time, delta, pointer) {
    this.clock = time;
    this.stageFloat = stageFloat;
    this.updateEnvironment(stageFloat, delta);
    const env = this.env;
    this.applyEnvironment(time, stageFloat);
    this.updateFire(delta, time, env.numbers.fire);

    // A little camera-facing rotation of the light ring keeps the smoke alive.
    this.fireGroup.rotation.y = Math.sin(time * 0.05) * 0.002;

    // Pointer parallax for atmosphere only.
    this.dust.rotation.y = pointer.x * 0.006;
    this.snow.rotation.y = pointer.x * 0.004;
  }
}
