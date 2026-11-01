import * as THREE from "three";
import { createGlowTexture, createStoneBumpTexture } from "./textures.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import skullUrl from "./assets/skull.glb?url";

const TAU = Math.PI * 2;

function damp(current, target, lambda, delta) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

/**
 * The rig is intentionally skeletal: a fossil reconstruction rather than a
 * fleshed actor. That lets the silhouette change dramatically between species
 * while every joint still reads as anatomy instead of a seam.
 */
function makeBoneGeometry() {
  const profile = [
    [0.35, 0.0],
    [0.72, -0.01],
    [0.92, -0.045],
    [1.0, -0.1],
    [0.84, -0.16],
    [0.64, -0.24],
    [0.6, -0.5],
    [0.65, -0.76],
    [0.84, -0.84],
    [1.0, -0.9],
    [0.92, -0.955],
    [0.7, -0.99],
    [0.3, -1.0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 12);
}

function makeRibCurve(side, index, count) {
  const t = index / (count - 1);
  const y = 0.87 - t * 0.47;
  const width = 0.55 + Math.sin(t * Math.PI) * 0.36;
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y + 0.03, -0.36),
    new THREE.Vector3(side * width * 0.48, y + 0.02, -0.33),
    new THREE.Vector3(side * width * 0.92, y - 0.005, -0.04),
    new THREE.Vector3(side * width * 0.86, y - 0.05, 0.24),
    new THREE.Vector3(side * width * 0.5, y - 0.085, 0.49),
    new THREE.Vector3(side * 0.055, y - 0.105, 0.575),
  ]);
}

function makeClavicleCurve(side) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.865, 0.53),
    new THREE.Vector3(side * 0.34, 0.9, 0.42),
    new THREE.Vector3(side * 0.68, 0.935, 0.2),
    new THREE.Vector3(side * 0.93, 0.93, 0.02),
  ]);
}

function makeFloatingRibCurve(side, y) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y + 0.02, -0.35),
    new THREE.Vector3(side * 0.28, y + 0.01, -0.31),
    new THREE.Vector3(side * 0.48, y - 0.01, -0.04),
    new THREE.Vector3(side * 0.42, y - 0.04, 0.2),
    new THREE.Vector3(side * 0.22, y - 0.06, 0.34),
  ]);
}

function makePubicArchCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.062, -0.025, 0.0),
    new THREE.Vector3(-0.04, -0.052, 0.022),
    new THREE.Vector3(0, -0.06, 0.038),
    new THREE.Vector3(0.04, -0.052, 0.022),
    new THREE.Vector3(0.062, -0.025, 0.0),
  ]);
}

function makeMandibleCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.041, 0.033, 0.0),
    new THREE.Vector3(-0.038, 0.015, 0.024),
    new THREE.Vector3(-0.024, 0.002, 0.048),
    new THREE.Vector3(0, -0.005, 0.058),
    new THREE.Vector3(0.024, 0.002, 0.048),
    new THREE.Vector3(0.038, 0.015, 0.024),
    new THREE.Vector3(0.041, 0.033, 0.0),
  ]);
}

function makeFurTuftGeometry() {
  return new THREE.ConeGeometry(1, 1, 4, 1, false);
}

export class Hominid {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "hominid";
    scene.add(this.root);

    this.sphereGeo = new THREE.SphereGeometry(1, 24, 18);
    this.lowSphereGeo = new THREE.SphereGeometry(1, 16, 12);
    this.jointGeo = new THREE.SphereGeometry(1, 16, 12);
    this.boneGeo = makeBoneGeometry();

    const bump = createStoneBumpTexture(256);
    bump.repeat.set(4, 4);
    this.boneMaterial = new THREE.MeshStandardMaterial({
      color: "#d0bd98",
      roughness: 0.66,
      metalness: 0.01,
      bumpMap: bump,
      bumpScale: 0.003,
      envMapIntensity: 0.3,
      emissive: "#1a1109",
      emissiveIntensity: 0.22,
    });
    this.teethMaterial = new THREE.MeshStandardMaterial({
      color: "#e1d3b7",
      roughness: 0.52,
      metalness: 0.02,
    });
    this.skullMaterial = new THREE.MeshPhysicalMaterial({
      color: "#b89d78",
      roughness: 0.52,
      metalness: 0.0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.6,
    });
    this.socketMaterial = new THREE.MeshStandardMaterial({
      color: "#0a0705",
      roughness: 0.92,
      metalness: 0,
    });
    this.furMaterial = new THREE.MeshStandardMaterial({
      color: "#3a2a1d",
      roughness: 0.98,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.furPeltMaterial = new THREE.MeshStandardMaterial({
      color: "#35261a",
      roughness: 1,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.stoneMaterial = new THREE.MeshStandardMaterial({
      color: "#777064",
      roughness: 0.82,
      metalness: 0.02,
      flatShading: true,
    });
    this.ochreMaterial = new THREE.MeshStandardMaterial({
      color: "#a64124",
      roughness: 0.9,
    });

    this.current = {
      ...this.defaultFigure(),
      ...this.defaultPose(),
    };
    this.currentColor = new THREE.Color(this.current.skin);
    this.targetColor = new THREE.Color(this.current.skin);
    this.currentFur = 0;
    this.stageIndex = 0;

    this.build();
    this.skullReady = this.loadSkull().catch((error) => {
      console.error("HOMO skull load failed", error);
      this.skullError = error;
    });
  }

  defaultFigure() {
    return {
      height: 1.1,
      legs: 0.92,
      arms: 1.2,
      shoulders: 0.96,
      torso: 0.94,
      head: 0.92,
      cranium: 0.82,
      jaw: 1.34,
      brow: 1.55,
      hair: 1.2,
      beard: 0.35,
      belly: 0.95,
      neck: 0.58,
      fur: 0.28,
      wrap: 0.55,
      skin: "#b39a76",
    };
  }

  defaultPose() {
    return {
      spineX: 0.2,
      chestX: 0.05,
      headX: 0.04,
      headY: -0.18,
      armLX: 0.06,
      armLZ: -0.13,
      armRX: -0.08,
      armRZ: 0.12,
      forearmL: -0.18,
      forearmR: -0.24,
      thighL: -0.08,
      shinL: 0.24,
      thighR: 0.1,
      shinR: 0.14,
      hipsY: 0,
    };
  }

  build() {
    this.pelvis = new THREE.Group();
    this.root.add(this.pelvis);
    this.buildPelvis();

    this.torsoPivot = new THREE.Group();
    this.pelvis.add(this.torsoPivot);
    this.buildRibcage();
    this.buildLumbarSpine();

    this.chestGroup = new THREE.Group();
    this.torsoPivot.add(this.chestGroup);

    this.buildLegs();
    this.buildArms();
    this.buildNeckAndSkull();
    this.buildFurMantle();

    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: "#000000",
        map: createGlowTexture(128),
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.006;
    this.contactShadow.renderOrder = 1;
    this.root.add(this.contactShadow);

    this.update(
      0,
      0.016,
      {
        figure: this.defaultFigure(),
        pose: this.defaultPose(),
        props: { chopper: 0, spear: 0, fur: 0.3, paint: 0 },
      },
      0,
      true,
    );
  }

  ellipsoid(parent, material, position, scale, geometry = this.sphereGeo) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  joint(parent, material, position, radius) {
    const mesh = new THREE.Mesh(this.jointGeo, material);
    mesh.position.set(...position);
    mesh.scale.setScalar(radius);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  buildPelvis() {
    this.sacrum = this.ellipsoid(this.pelvis, this.boneMaterial, [0, -0.005, -0.022], [0.026, 0.05, 0.024]);
    this.iliumL = this.ellipsoid(this.pelvis, this.boneMaterial, [-0.058, 0.02, -0.012], [0.044, 0.068, 0.014]);
    this.iliumR = this.ellipsoid(this.pelvis, this.boneMaterial, [0.058, 0.02, -0.012], [0.044, 0.068, 0.014]);
    this.iliumL.rotation.set(0.12, 0.16, 0.48);
    this.iliumR.rotation.set(0.12, -0.16, -0.48);
    this.ischiumL = this.ellipsoid(this.pelvis, this.boneMaterial, [-0.052, -0.045, -0.015], [0.018, 0.034, 0.012]);
    this.ischiumR = this.ellipsoid(this.pelvis, this.boneMaterial, [0.052, -0.045, -0.015], [0.018, 0.034, 0.012]);
    this.ischiumL.rotation.z = 0.18;
    this.ischiumR.rotation.z = -0.18;
    this.pubicArch = new THREE.Mesh(
      new THREE.TubeGeometry(makePubicArchCurve(), 22, 0.008, 5, false),
      this.boneMaterial,
    );
    this.pubicArch.castShadow = true;
    this.pelvis.add(this.pubicArch);
    this.hipJointL = this.joint(this.pelvis, this.boneMaterial, [-0.07, -0.018, 0], 1);
    this.hipJointR = this.joint(this.pelvis, this.boneMaterial, [0.07, -0.018, 0], 1);
  }

  buildRibcage() {
    this.ribcage = new THREE.Group();
    this.torsoPivot.add(this.ribcage);

    const ribCount = 8;
    for (let i = 0; i < ribCount; i += 1) {
      for (const side of [-1, 1]) {
        const geometry = new THREE.TubeGeometry(
          makeRibCurve(side, i, ribCount),
          18,
          0.022,
          4,
          false,
        );
        const rib = new THREE.Mesh(geometry, this.boneMaterial);
        rib.castShadow = true;
        this.ribcage.add(rib);
      }
    }

    this.sternum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.04, 0.34, 5, 2),
      this.boneMaterial,
    );
    this.sternum.position.set(0, 0.66, 0.575);
    this.sternum.scale.set(1, 1, 0.5);
    this.sternum.castShadow = true;
    this.ribcage.add(this.sternum);

    this.clavicleL = new THREE.Mesh(
      new THREE.TubeGeometry(makeClavicleCurve(-1), 14, 0.028, 4, false),
      this.boneMaterial,
    );
    this.clavicleR = new THREE.Mesh(
      new THREE.TubeGeometry(makeClavicleCurve(1), 14, 0.028, 4, false),
      this.boneMaterial,
    );
    this.clavicleL.castShadow = true;
    this.clavicleR.castShadow = true;
    this.ribcage.add(this.clavicleL, this.clavicleR);

    this.scapulaL = this.ellipsoid(this.ribcage, this.boneMaterial, [-0.64, 0.83, -0.31], [0.26, 0.31, 0.035]);
    this.scapulaR = this.ellipsoid(this.ribcage, this.boneMaterial, [0.64, 0.83, -0.31], [0.26, 0.31, 0.035]);
    this.scapulaL.rotation.z = 0.22;
    this.scapulaR.rotation.z = -0.22;

    this.vertebrae = [];
    for (let i = 0; i < 12; i += 1) {
      const t = i / 11;
      const vertebra = this.ellipsoid(
        this.ribcage,
        this.boneMaterial,
        [0, 0.06 + t * 0.86, -0.37],
        [0.045, 0.018, 0.04],
        this.lowSphereGeo,
      );
      const spine = new THREE.Mesh(
        new THREE.ConeGeometry(0.014, 0.095, 4),
        this.boneMaterial,
      );
      spine.position.set(0, 0.06 + t * 0.86, -0.45);
      spine.rotation.x = Math.PI / 2;
      spine.castShadow = true;
      this.ribcage.add(spine);
      this.vertebrae.push(vertebra, spine);
    }

    for (const side of [-1, 1]) {
      for (const y of [0.34, 0.29]) {
        const rib = new THREE.Mesh(
          new THREE.TubeGeometry(makeFloatingRibCurve(side, y), 16, 0.018, 4, false),
          this.boneMaterial,
        );
        rib.castShadow = true;
        this.ribcage.add(rib);
      }
    }
  }

  buildLumbarSpine() {
    this.lumbar = [];
    for (let i = 0; i < 5; i += 1) {
      const vertebra = this.ellipsoid(
        this.torsoPivot,
        this.boneMaterial,
        [0, 0, -0.02],
        [0.032, 0.018, 0.03],
        this.lowSphereGeo,
      );
      const process = new THREE.Mesh(
        new THREE.ConeGeometry(0.012, 0.075, 4),
        this.boneMaterial,
      );
      process.rotation.x = Math.PI / 2;
      process.castShadow = true;
      this.torsoPivot.add(process);
      this.lumbar.push({ vertebra, process, index: i });
    }
  }

  buildLegs() {
    this.legs = {};
    for (const side of [-1, 1]) {
      const key = side < 0 ? "L" : "R";
      const thigh = new THREE.Group();
      this.pelvis.add(thigh);
      const thighMesh = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      thighMesh.castShadow = true;
      thigh.add(thighMesh);
      const knee = new THREE.Group();
      thigh.add(knee);
      const kneeJoint = this.joint(knee, this.boneMaterial, [0, 0, 0], 1);
      const patella = this.ellipsoid(knee, this.boneMaterial, [0, 0.004, 0.022], [0.021, 0.026, 0.01], this.lowSphereGeo);
      const tibia = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      tibia.castShadow = true;
      knee.add(tibia);
      const fibula = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      fibula.castShadow = true;
      fibula.position.x = side * 0.022;
      knee.add(fibula);
      const ankle = new THREE.Group();
      knee.add(ankle);
      const ankleJoint = this.joint(ankle, this.boneMaterial, [0, 0, 0], 1);
      const foot = this.buildFoot(side);
      ankle.add(foot.group);

      this.legs[key] = {
        thigh,
        thighMesh,
        knee,
        kneeJoint,
        patella,
        tibia,
        fibula,
        ankle,
        ankleJoint,
        foot,
        hipSide: side,
      };
    }
  }

  buildFoot(side) {
    const group = new THREE.Group();
    const calcaneus = this.ellipsoid(group, this.boneMaterial, [0, -0.012, -0.02], [0.021, 0.014, 0.033], this.lowSphereGeo);
    const midfoot = this.ellipsoid(group, this.boneMaterial, [0, -0.01, 0.02], [0.026, 0.009, 0.034], this.lowSphereGeo);
    const toes = [];
    for (let i = 0; i < 5; i += 1) {
      const x = -0.019 + i * 0.0095;
      const length = 0.04 - Math.abs(i - 1) * 0.005;
      const metatarsal = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      metatarsal.scale.set(0.0032, length, 0.0032);
      metatarsal.position.set(x, -0.013, 0.045);
      metatarsal.rotation.x = -Math.PI / 2;
      metatarsal.castShadow = true;
      group.add(metatarsal);
      const toe = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      toe.scale.set(0.0028, 0.016 - i * 0.001, 0.0028);
      toe.position.set(x, -0.016, 0.075);
      toe.rotation.x = -Math.PI / 2;
      toe.castShadow = true;
      group.add(toe);
      toes.push(toe);
    }
    return { group, calcaneus, midfoot, toes };
  }

  buildArms() {
    this.arms = {};
    for (const side of [-1, 1]) {
      const key = side < 0 ? "L" : "R";
      const upper = new THREE.Group();
      this.chestGroup.add(upper);
      const humerus = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      humerus.castShadow = true;
      upper.add(humerus);
      const shoulderJoint = this.joint(upper, this.boneMaterial, [0, 0, 0], 1);
      const elbow = new THREE.Group();
      upper.add(elbow);
      const elbowJoint = this.joint(elbow, this.boneMaterial, [0, 0, 0], 1);
      const radius = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      radius.castShadow = true;
      radius.position.x = -side * 0.013;
      elbow.add(radius);
      const ulna = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      ulna.castShadow = true;
      ulna.position.x = side * 0.013;
      elbow.add(ulna);
      const wrist = new THREE.Group();
      elbow.add(wrist);
      const wristJoint = this.joint(wrist, this.boneMaterial, [0, 0, 0], 1);
      const hand = this.buildHand(side);
      wrist.add(hand.group);

      this.arms[key] = {
        upper,
        humerus,
        shoulderJoint,
        elbow,
        elbowJoint,
        radius,
        ulna,
        wrist,
        wristJoint,
        hand,
        side,
      };
    }

    this.chopperGroup = new THREE.Group();
    const chopper = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1, 0),
      this.stoneMaterial,
    );
    chopper.scale.set(0.033, 0.014, 0.046);
    chopper.rotation.set(0.3, 0.5, 0.2);
    chopper.castShadow = true;
    this.chopperGroup.add(chopper);
    this.chopperGroup.position.set(0, -0.04, 0.022);
    this.chopperGroup.rotation.set(-0.7, 0.15, 0.3);
    this.arms.R.hand.group.add(this.chopperGroup);

    this.ochreGroup = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.004, 0.075, 6),
      this.ochreMaterial,
    );
    stick.rotation.x = 0.25;
    stick.position.y = -0.02;
    stick.castShadow = true;
    this.ochreGroup.add(stick);
    this.ochreGroup.position.set(0, -0.05, 0.02);
    this.arms.R.hand.group.add(this.ochreGroup);
  }

  buildHand(side) {
    const group = new THREE.Group();
    const palm = this.ellipsoid(group, this.boneMaterial, [0, -0.016, 0.002], [0.019, 0.022, 0.01], this.lowSphereGeo);
    const fingers = [];
    const fingerXs = [-0.0135, -0.0045, 0.0045, 0.013];
    for (let i = 0; i < 4; i += 1) {
      const pivot = new THREE.Group();
      pivot.position.set(fingerXs[i], -0.03, 0.004);
      pivot.rotation.z = (i - 1.5) * 0.04;
      const proximal = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      proximal.scale.set(0.0037, 0.016, 0.0037);
      proximal.position.y = -0.007;
      proximal.castShadow = true;
      pivot.add(proximal);
      const knuckle = this.joint(pivot, this.boneMaterial, [0, -0.016, 0.0], 0.0048);
      const distal = new THREE.Group();
      distal.position.y = -0.016;
      const distalBone = new THREE.Mesh(this.boneGeo, this.boneMaterial);
      distalBone.scale.set(0.0032, 0.013, 0.0032);
      distalBone.position.y = -0.006;
      distalBone.castShadow = true;
      distal.add(distalBone);
      pivot.add(distal);
      group.add(pivot);
      fingers.push({ pivot, distal, proximal, knuckle });
    }

    const thumbPivot = new THREE.Group();
    thumbPivot.position.set(side < 0 ? 0.02 : -0.02, -0.018, 0.006);
    thumbPivot.rotation.z = side < 0 ? -0.85 : 0.85;
    const thumb = new THREE.Mesh(this.boneGeo, this.boneMaterial);
    thumb.scale.set(0.0042, 0.014, 0.0042);
    thumb.position.y = -0.006;
    thumb.castShadow = true;
    thumbPivot.add(thumb);
    const thumbTip = new THREE.Mesh(this.boneGeo, this.boneMaterial);
    thumbTip.scale.set(0.0032, 0.011, 0.0032);
    thumbTip.position.y = -0.019;
    thumbTip.castShadow = true;
    thumbPivot.add(thumbTip);
    group.add(thumbPivot);

    return { group, palm, fingers, thumbPivot };
  }

  buildNeckAndSkull() {
    this.neckGroup = new THREE.Group();
    this.chestGroup.add(this.neckGroup);
    this.neckCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.95, 1, 10, 3),
      new THREE.MeshStandardMaterial({
        color: "#7d6a50",
        roughness: 0.82,
        metalness: 0,
      }),
    );
    this.neckCore.castShadow = true;
    this.neckGroup.add(this.neckCore);
    this.neckVertebrae = [];
    for (let i = 0; i < 5; i += 1) {
      const vertebra = this.ellipsoid(
        this.neckGroup,
        this.boneMaterial,
        [0, i * 0.02, -0.004],
        [0.029, 0.011, 0.026],
        this.lowSphereGeo,
      );
      const process = new THREE.Mesh(
        new THREE.ConeGeometry(0.006, 0.025, 4),
        this.boneMaterial,
      );
      process.position.set(0, i * 0.02, -0.027);
      process.rotation.x = Math.PI / 2;
      process.castShadow = true;
      this.neckGroup.add(process);
      this.neckVertebrae.push(vertebra, process);
    }

    this.head = new THREE.Group();
    this.neckGroup.add(this.head);
    this.buildSkull();
  }

  buildSkull() {
    this.cranium = this.ellipsoid(this.head, this.boneMaterial, [0, 0.067, -0.002], [0.047, 0.061, 0.057]);
    this.face = this.ellipsoid(this.head, this.boneMaterial, [0, 0.041, 0.03], [0.035, 0.034, 0.029]);
    this.maxilla = this.ellipsoid(this.head, this.boneMaterial, [0, 0.025, 0.046], [0.029, 0.019, 0.021]);
    this.brow = this.ellipsoid(this.head, this.boneMaterial, [0, 0.066, 0.054], [0.044, 0.008, 0.012]);
    this.browL = this.ellipsoid(this.head, this.boneMaterial, [-0.027, 0.068, 0.053], [0.021, 0.007, 0.011]);
    this.browR = this.ellipsoid(this.head, this.boneMaterial, [0.027, 0.068, 0.053], [0.021, 0.007, 0.011]);
    this.cheekL = this.ellipsoid(this.head, this.boneMaterial, [-0.027, 0.043, 0.045], [0.017, 0.013, 0.011]);
    this.cheekR = this.ellipsoid(this.head, this.boneMaterial, [0.027, 0.043, 0.045], [0.017, 0.013, 0.011]);
    this.nasalBridge = this.ellipsoid(this.head, this.boneMaterial, [0, 0.051, 0.061], [0.0065, 0.017, 0.008]);
    this.nasalAperture = this.ellipsoid(this.head, this.socketMaterial, [0, 0.036, 0.061], [0.009, 0.014, 0.005], this.lowSphereGeo);
    const nasalGeometry = new THREE.BufferGeometry();
    nasalGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        -0.009, 0.052, 0.0665,
        0.009, 0.052, 0.0665,
        0, 0.027, 0.0635,
      ], 3),
    );
    nasalGeometry.computeVertexNormals();
    this.nasalCavity = new THREE.Mesh(
      nasalGeometry,
      new THREE.MeshBasicMaterial({
        color: "#090604",
        side: THREE.DoubleSide,
      }),
    );
    this.head.add(this.nasalCavity);
    this.nasalSeptum = this.ellipsoid(
      this.head,
      this.boneMaterial,
      [0, 0.04, 0.066],
      [0.0015, 0.012, 0.002],
      this.lowSphereGeo,
    );
    this.mandible = new THREE.Mesh(
      new THREE.TubeGeometry(makeMandibleCurve(), 24, 0.0075, 5, false),
      this.boneMaterial,
    );
    this.mandible.castShadow = true;
    this.head.add(this.mandible);
    this.chin = this.ellipsoid(this.head, this.boneMaterial, [0, 0.004, 0.052], [0.015, 0.012, 0.009]);
    this.occiput = this.ellipsoid(this.head, this.boneMaterial, [0, 0.058, -0.048], [0.035, 0.032, 0.02]);

    this.eyeSockets = [];
    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(this.sphereGeo, this.socketMaterial);
      socket.position.set(side * 0.0255, 0.0555, 0.0505);
      socket.scale.set(0.013, 0.016, 0.011);
      this.head.add(socket);
      this.eyeSockets.push(socket);

      const temple = this.ellipsoid(
        this.head,
        this.socketMaterial,
        [side * 0.047, 0.048, -0.002],
        [0.005, 0.008, 0.005],
        this.lowSphereGeo,
      );
      temple.material = this.socketMaterial;
    }

    this.mouthVoid = this.ellipsoid(
      this.head,
      this.socketMaterial,
      [0, 0.014, 0.052],
      [0.022, 0.006, 0.004],
      this.lowSphereGeo,
    );

    this.teeth = [];
    for (let i = 0; i < 7; i += 1) {
      const angle = -0.48 + (i / 6) * 0.96;
      const x = Math.sin(angle) * 0.022;
      const z = 0.055 + Math.cos(angle) * 0.005;
      for (const y of [0.019, 0.007]) {
        const tooth = new THREE.Mesh(
          new THREE.BoxGeometry(0.0038, 0.0052, 0.003),
          this.teethMaterial,
        );
        tooth.position.set(x, y, z);
        tooth.rotation.y = -angle;
        tooth.castShadow = true;
        this.head.add(tooth);
        this.teeth.push(tooth);
      }
    }

    this.crest = this.ellipsoid(this.head, this.boneMaterial, [0, 0.098, -0.006], [0.005, 0.036, 0.028]);
    this.bun = this.ellipsoid(this.head, this.boneMaterial, [0, 0.054, -0.054], [0.024, 0.026, 0.015]);

    // A little ochre mark on the cranium for the later, symbolic chapters.
    this.faceMark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.055, 0.012),
      new THREE.MeshBasicMaterial({
        color: "#a64a2b",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.faceMark.position.set(-0.03, 0.052, 0.058);
    this.faceMark.rotation.z = 0.4;
    this.head.add(this.faceMark);
  }

  async loadSkull() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(skullUrl);
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = this.skullMaterial;
      child.castShadow = true;
      child.receiveShadow = false;
      child.frustumCulled = false;
    });
    this.skullGroup = new THREE.Group();
    this.skullGroup.name = "specimen-skull";
    this.skullGroup.add(model);
    this.head.add(this.skullGroup);
    // The primitive skull is now only a fallback for slow/failed loads.
    for (const child of this.head.children) {
      if (child !== this.skullGroup) child.visible = false;
    }
    this.skullModel = model;
  }
  buildFurMantle() {
    this.furGroup = new THREE.Group();
    this.torsoPivot.add(this.furGroup);
    const count = 150;
    const mesh = new THREE.InstancedMesh(
      makeFurTuftGeometry(),
      this.furMaterial,
      count,
    );
    mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const rand = (() => {
      let seed = 8817;
      return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    })();
    for (let i = 0; i < count; i += 1) {
      const angle = rand() * TAU;
      const row = i % 3;
      position.set(
        Math.cos(angle) * (0.09 + row * 0.014),
        0.29 - row * 0.038 + rand() * 0.02,
        Math.sin(angle) * (0.062 + row * 0.012) - 0.01,
      );
      if (position.z > 0.02 && Math.abs(position.x) < 0.07) position.z -= 0.09;
      const tilt = 0.6 + rand() * 0.5;
      quaternion.setFromEuler(
        new THREE.Euler(tilt * Math.cos(angle) + 0.15, 0, -tilt * Math.sin(angle)),
      );
      scale.set(0.004 + rand() * 0.003, 0.025 + rand() * 0.04, 0.004 + rand() * 0.003);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.furGroup.add(mesh);
    this.furMesh = mesh;

    const pelts = [
      [-0.088, 0.278, -0.004, 0.07, 0.05, 0.06],
      [0.088, 0.278, -0.004, 0.07, 0.05, 0.06],
      [0.0, 0.235, -0.06, 0.1, 0.085, 0.045],
    ];
    this.furPelts = [];
    for (const [x, y, z, sx, sy, sz] of pelts) {
      const pelt = new THREE.Mesh(this.lowSphereGeo, this.furPeltMaterial);
      pelt.position.set(x, y, z);
      pelt.scale.set(sx, sy, sz);
      pelt.rotation.x = -0.12;
      this.furGroup.add(pelt);
      this.furPelts.push(pelt);
    }
    this.furGroup.visible = false;
  }

  update(time, delta, targets, stageIndex, snap = false) {
    const figure = targets.figure;
    const pose = targets.pose;
    const props = targets.props;
    this.stageIndex = stageIndex;

    const lambda = snap ? 1000 : 5.5;
    const poseLambda = snap ? 1000 : 7;
    for (const key of Object.keys(figure)) {
      if (key === "skin") continue;
      this.current[key] = damp(this.current[key] ?? 1, figure[key], lambda, delta);
    }
    for (const key of Object.keys(pose)) {
      this.current[key] = damp(this.current[key] ?? 0, pose[key], poseLambda, delta);
    }
    this.currentFur = damp(this.currentFur, props.fur ?? 0, 6, delta);

    this.targetColor.set(figure.skin);
    if (snap) this.currentColor.copy(this.targetColor);
    else this.currentColor.lerp(this.targetColor, 1 - Math.exp(-4 * delta));
    this.boneMaterial.color.copy(this.currentColor);

    const cur = this.current;
    const h = cur.height;
    const breathe = Math.sin(time * 1.35) * 0.5 + 0.5;
    const slow = Math.sin(time * 0.37);
    const headIdleY = Math.sin(time * 0.27 + 0.8) * 0.022;
    const headIdleX = Math.sin(time * 0.41 + 1.6) * 0.01;

    const legLen = h * 0.5 * cur.legs;
    const thighLen = legLen * 0.52;
    const shinLen = legLen * 0.48;
    const footHeight = h * 0.025;
    const thighLX = cur.thighL + slow * 0.006;
    const thighRX = cur.thighR - slow * 0.006;
    const shinLX = cur.shinL + breathe * 0.004;
    const shinRX = cur.shinR + breathe * 0.004;
    const verticalL = thighLen * Math.cos(thighLX) + shinLen * Math.cos(thighLX + shinLX);
    const verticalR = thighLen * Math.cos(thighRX) + shinLen * Math.cos(thighRX + shinRX);
    const pelvisY = footHeight + Math.max(verticalL, verticalR) + h * 0.008;

    this.pelvis.position.set(slow * h * 0.004, pelvisY, 0);
    this.pelvis.rotation.z = slow * 0.012;
    this.pelvis.rotation.y = Math.sin(time * 0.19) * 0.018;

    const torsoLen = h * 0.3 * cur.torso;
    const shoulderHalf = h * 0.095 * cur.shoulders;
    const hipHalf = h * 0.07 + h * 0.004 * cur.belly;

    this.torsoPivot.rotation.x = cur.spineX + Math.sin(time * 0.31) * 0.006;
    this.torsoPivot.rotation.y = Math.sin(time * 0.23 + 1.1) * 0.012;
    this.chestGroup.rotation.x = cur.chestX;
    this.chestGroup.position.y = torsoLen * 0.8;

    this.ribcage.scale.set(
      h * 0.112 * (0.94 + cur.shoulders * 0.06),
      torsoLen * (1 + breathe * 0.002),
      h * 0.074 * (0.94 + cur.shoulders * 0.06) * (1 + breathe * 0.012),
    );
    this.ribcage.position.y = 0;

    this.sacrum.scale.set(h * 0.026, h * 0.05, h * 0.024);
    this.iliumL.position.set(-h * 0.06, h * 0.02, -h * 0.02);
    this.iliumR.position.set(h * 0.06, h * 0.02, -h * 0.02);
    this.iliumL.scale.set(h * 0.036, h * 0.07, h * 0.018);
    this.iliumR.scale.copy(this.iliumL.scale);
    this.ischiumL.position.set(-h * 0.052, -h * 0.045, -h * 0.015);
    this.ischiumR.position.set(h * 0.052, -h * 0.045, -h * 0.015);
    this.ischiumL.scale.set(h * 0.018, h * 0.034, h * 0.012);
    this.ischiumR.scale.copy(this.ischiumL.scale);
    this.pubicArch.scale.setScalar(h);
    this.hipJointL.position.set(-hipHalf, -h * 0.018, 0);
    this.hipJointR.position.set(hipHalf, -h * 0.018, 0);
    this.hipJointL.scale.setScalar(h * 0.02);
    this.hipJointR.scale.setScalar(h * 0.02);

    this.lumbar.forEach(({ vertebra, process, index }) => {
      const y = h * (0.018 + index * 0.017);
      vertebra.position.set(0, y, -h * 0.022);
      vertebra.scale.set(h * 0.03, h * 0.014, h * 0.028);
      process.position.set(0, y, -h * 0.05);
      process.scale.setScalar(h);
    });

    // Legs.
    const footAngleL = -(thighLX + shinLX);
    const footAngleR = -(thighRX + shinRX);
    for (const key of ["L", "R"]) {
      const leg = this.legs[key];
      const side = leg.hipSide;
      const thighX = key === "L" ? thighLX : thighRX;
      const shinX = key === "L" ? shinLX : shinRX;
      const footAngle = key === "L" ? footAngleL : footAngleR;
      leg.thigh.position.set(side * hipHalf, -h * 0.018, 0);
      leg.thigh.rotation.x = thighX;
      leg.thigh.rotation.z = side * 0.012;
      leg.thighMesh.scale.set(h * 0.034, thighLen, h * 0.032);
      leg.knee.position.y = -thighLen;
      leg.knee.rotation.x = shinX;
      leg.kneeJoint.scale.setScalar(h * 0.026);
      leg.patella.position.set(0, 0.002, h * 0.028);
      leg.patella.scale.set(h * 0.02, h * 0.024, h * 0.009);
      leg.tibia.scale.set(h * 0.026, shinLen, h * 0.023);
      leg.fibula.scale.set(h * 0.011, shinLen * 0.96, h * 0.01);
      leg.fibula.position.set(side * h * 0.022, 0, h * 0.006);
      leg.ankle.position.y = -shinLen;
      leg.ankleJoint.scale.setScalar(h * 0.018);
      leg.foot.group.scale.setScalar(h);
      leg.foot.group.rotation.x = footAngle + 0.08;
      leg.foot.calcaneus.scale.set(0.021, 0.014, 0.033);
      leg.foot.midfoot.scale.set(0.026, 0.009, 0.034);
    }

    // Arms.
    const upperLen = h * 0.153 * cur.arms;
    const foreLen = h * 0.136 * cur.arms;
    for (const key of ["L", "R"]) {
      const arm = this.arms[key];
      const side = arm.side;
      const rotX = key === "L" ? cur.armLX : cur.armRX;
      const rotZ = key === "L" ? cur.armLZ : cur.armRZ;
      const fore = key === "L" ? cur.forearmL : cur.forearmR;
      arm.upper.position.set(side * shoulderHalf, torsoLen * 0.12, 0);
      arm.upper.rotation.set(rotX + Math.sin(time * 0.5 + side) * 0.012, 0, rotZ);
      arm.humerus.scale.set(h * 0.027, upperLen, h * 0.025);
      arm.shoulderJoint.scale.setScalar(h * 0.018);
      arm.elbow.position.y = -upperLen;
      arm.elbow.rotation.x = fore + Math.sin(time * 0.43 + side * 2) * 0.01;
      arm.elbowJoint.scale.setScalar(h * 0.018);
      arm.radius.scale.set(h * 0.014, foreLen * 0.98, h * 0.012);
      arm.ulna.scale.set(h * 0.015, foreLen, h * 0.013);
      arm.radius.position.set(-side * h * 0.013, 0, 0);
      arm.ulna.position.set(side * h * 0.013, 0, 0);
      arm.wrist.position.y = -foreLen;
      arm.wristJoint.scale.setScalar(h * 0.012);
      arm.hand.group.scale.setScalar(h);
      arm.hand.group.rotation.set(0.08, side * 0.05, side * -0.04);
      const fingerCurl = 0.2 + Math.sin(time * 0.6 + side) * 0.015;
      arm.hand.fingers.forEach((finger, i) => {
        finger.pivot.rotation.x = fingerCurl + i * 0.015;
        finger.distal.rotation.x = 0.12 + fingerCurl * 0.65;
      });
      arm.hand.thumbPivot.rotation.x = fingerCurl * 0.4;
    }

    // Neck and skull.
    const neckLen = h * 0.05 * cur.neck;
    this.neckGroup.position.y = torsoLen * 0.15;
    this.neckGroup.scale.setScalar(h);
    this.neckCore.position.y = (neckLen / h) * 0.5;
    this.neckCore.scale.set(h * 0.021, neckLen / h, h * 0.021);
    this.neckVertebrae.forEach((vertebra, index) => {
      const level = Math.floor(index / 2);
      const isProcess = index % 2 === 1;
      vertebra.position.y = (level / 4) * (neckLen / h) * 0.82;
      vertebra.position.z = -h * 0.035;
      if (isProcess) vertebra.position.z = -h * 0.06;
    });
    this.head.position.y = neckLen / h;
    this.head.rotation.x = cur.headX + headIdleX;
    this.head.rotation.y = cur.headY + headIdleY;
    this.head.rotation.z = Math.sin(time * 0.2) * 0.008;
    this.head.scale.setScalar(1);

    const headScale = cur.head;
    const craniumScale = cur.cranium;

    if (this.skullGroup) {
      this.skullGroup.scale.set(
        0.42 * headScale * (0.85 + craniumScale * 0.15),
        0.47 * headScale,
        0.33 * headScale * (0.88 + cur.jaw * 0.12),
      );
      this.skullGroup.position.set(0, -0.008, 0.026 + (cur.jaw - 1) * 0.006);
      this.skullMaterial.color.copy(this.currentColor).multiplyScalar(0.92);
      this.skullMaterial.roughness = 0.5 + (1 - craniumScale) * 0.08;
    }
    this.cranium.scale.set(
      0.046 * headScale * (0.88 + craniumScale * 0.12),
      0.06 * headScale * (0.9 + craniumScale * 0.1),
      0.055 * headScale * (0.86 + craniumScale * 0.14),
    );
    this.face.scale.set(0.034 * headScale, 0.033 * headScale, 0.028 * headScale);
    this.maxilla.position.z = 0.044 + cur.jaw * 0.004;
    this.maxilla.scale.set(0.029 * headScale, 0.018 * headScale, 0.02 * headScale);
    this.brow.scale.set(0.043 * headScale, 0.007 * headScale * cur.brow, 0.011 * headScale * cur.brow);
    this.browL.scale.set(0.021 * headScale, 0.006 * headScale * cur.brow, 0.01 * headScale * cur.brow);
    this.browR.scale.copy(this.browL.scale);
    this.browL.position.z = 0.053;
    this.browR.position.z = 0.053;
    this.cheekL.scale.set(0.017 * headScale, 0.013 * headScale, 0.011 * headScale);
    this.cheekR.scale.copy(this.cheekL.scale);
    this.mandible.position.set(0, 0.012, 0.058 + (cur.jaw - 1) * 0.005);
    this.mandible.scale.set(headScale * 1.15, headScale * (0.9 + cur.jaw * 0.1), headScale);
    this.chin.position.set(0, 0.006, 0.082);
    this.chin.scale.set(0.017 * headScale, 0.013 * headScale, 0.011 * headScale);
    this.nasalBridge.scale.set(0.0065 * headScale, 0.017 * headScale, 0.008 * headScale);
    this.nasalAperture.scale.set(0.009 * headScale, 0.014 * headScale, 0.005 * headScale);
    this.nasalAperture.position.z = 0.064;
    this.occiput.scale.set(0.035 * headScale, 0.032 * headScale, 0.02 * headScale);
    this.eyeSockets.forEach((socket) => {
      socket.scale.set(0.013 * headScale, 0.016 * headScale, 0.011 * headScale);
      socket.position.z = 0.0505;
    });
    this.nasalCavity.scale.set(headScale, headScale, headScale);
    this.nasalSeptum.scale.set(0.0015 * headScale, 0.012 * headScale, 0.002 * headScale);
    this.mouthVoid.scale.set(0.022 * headScale, 0.006 * headScale, 0.004 * headScale);
    this.teeth.forEach((tooth) => {
      tooth.scale.setScalar(headScale);
    });

    const crestAmount = THREE.MathUtils.clamp((1.04 - craniumScale) * 1.6, 0, 1);
    this.crest.scale.set(0.005 * headScale, (0.012 + crestAmount * 0.033) * headScale, 0.024 * headScale);
    this.crest.visible = crestAmount > 0.12;
    const bunAmount = THREE.MathUtils.clamp((cur.brow - 0.9) * 1.4, 0, 1);
    this.bun.scale.set((0.008 + bunAmount * 0.02) * headScale, (0.008 + bunAmount * 0.022) * headScale, (0.005 + bunAmount * 0.012) * headScale);
    this.bun.visible = bunAmount > 0.16;
    this.faceMark.material.opacity = props.paint * 0.6 * (0.4 + 0.6 * Math.abs(Math.sin(time * 0.2)));

    // Fur is a cultural layer, not skin: only the cold chapters wear it.
    this.furGroup.scale.setScalar(h);
    this.furGroup.visible = false;
    this.furMaterial.opacity = 0.25 + this.currentFur * 0.7;
    this.furPeltMaterial.opacity = 0.12 + this.currentFur * 0.7;
    this.furPelts.forEach((pelt) => {
      pelt.visible = this.currentFur > 0.55;
    });

    this.chopperGroup.visible = props.chopper > 0.04;
    this.chopperGroup.scale.setScalar(Math.max(0.001, props.chopper));
    this.ochreGroup.visible = false;
    this.ochreGroup.scale.setScalar(Math.max(0.001, props.paint));

    this.contactShadow.scale.set(h * 0.42, h * 0.26, 1);
    this.contactShadow.position.y = 0.007;
    this.contactShadow.material.opacity = 0.28;

    this.root.updateMatrixWorld(true);
  }
}
