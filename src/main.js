import "./style.css";

import * as THREE from "three";
import Lenis from "lenis";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { STAGES } from "./data.js";
import { Hominid } from "./hominid.js";
import { World } from "./world.js";
import { Soundscape } from "./audio.js";
import { clamp, smootherstep } from "./noise.js";

const STAGE_COUNT = STAGES.length;
const LAST_STAGE = STAGE_COUNT - 1;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;
const isSmallScreen = window.matchMedia("(max-width: 700px)").matches;

const body = document.body;
const loaderEl = document.getElementById("loader");
const loaderBar = document.getElementById("loader-bar");
const loaderPct = document.getElementById("loader-pct");
const loaderStatus = document.getElementById("loader-status");
const panelsEl = document.getElementById("panels");
const railEl = document.getElementById("rail");
const ticksEl = document.getElementById("time-ticks");
const timeValue = document.getElementById("time-value");
const chapterCount = document.getElementById("chapter-count");
const topProgress = document.getElementById("top-progress-fill");
const timeProgress = document.getElementById("time-progress");
const scrollHint = document.getElementById("scroll-hint");
const soundButton = document.getElementById("sound-toggle");
const soundLabel = document.getElementById("sound-label");
const infoButton = document.getElementById("info-toggle");
const infoModal = document.getElementById("info-modal");
const fallback = document.getElementById("fallback");

const pointer = { x: 0, y: 0 };
const pointerSmooth = { x: 0, y: 0 };
const cursor = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  ringX: window.innerWidth / 2,
  ringY: window.innerHeight / 2,
  dotX: window.innerWidth / 2,
  dotY: window.innerHeight / 2,
  seen: false,
};
const cursorRing = document.querySelector(".cursor-ring");
const cursorDot = document.querySelector(".cursor-dot");

const figureKeys = Object.keys(STAGES[0].figure).filter((key) => key !== "skin");
const poseKeys = Object.keys(STAGES[0].pose);
const propKeys = Object.keys(STAGES[0].props);
const targetFigure = {};
const targetPose = {};
const targetProps = {};
const mixedSkin = new THREE.Color();
const colorA = new THREE.Color();
const colorB = new THREE.Color();

let renderer;
let scene;
let camera;
let composer;
let bloomPass;
let world;
let hominid;
let lenis = null;
let soundscape = null;

let maxScroll = 0;
let scrollProgress = 0;
let stageFloat = 0;
let activeStage = -1;
let lastSoundStage = -1;

let isReady = false;
let isLoading = true;
let loadDisplay = 0;
let introStart = -1;
let introT = 0;

let lastFrame = 0;
const timer = new THREE.Timer();

const cameraPosition = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const tempPositionA = new THREE.Vector3();
const tempPositionB = new THREE.Vector3();
const tempLookA = new THREE.Vector3();
const tempLookB = new THREE.Vector3();

/* ----------------------------------------------------------------------- */
/* Interface                                                               */
/* ----------------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildInterface() {
  const track = document.createElement("div");
  track.className = "scroll-track";
  track.id = "scroll-track";
  track.setAttribute("aria-hidden", "true");
  for (let i = 0; i < STAGE_COUNT; i += 1) {
    const section = document.createElement("section");
    section.className = "scroll-section";
    section.dataset.stage = String(i);
    track.appendChild(section);
  }
  body.insertBefore(track, document.getElementById("ui"));

  panelsEl.innerHTML = STAGES.map((stage, index) => {
    const side = index % 2 === 0 ? "left" : "right";
    const lines = stage.headline.split("\n");
    const title = lines
      .map(
        (line, lineIndex) =>
          `<span class="title-line"><span class="title-line-inner" style="--line:${lineIndex}">${escapeHtml(line)}</span></span>`,
      )
      .join("");
    const stats = stage.stats
      .map(
        ([label, value]) => `
          <div class="stat">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>`,
      )
      .join("");
    return `
      <article class="chapter-panel" data-stage="${index}" data-side="${side}" aria-hidden="true">
        <div class="panel-inner">
          <div class="panel-meta reveal" style="--i:0">
            <span class="chapter-index">${stage.index}</span>
            <span class="meta-rule"></span>
            <span>${escapeHtml(stage.epoch)}</span>
            <span class="meta-rule"></span>
            <span class="meta-site">${escapeHtml(stage.site)}</span>
          </div>
          <h1 class="chapter-title">${title}</h1>
          <div class="chapter-taxon reveal" style="--i:1">
            <em>${escapeHtml(stage.species)}</em>
            <span class="taxon-sep"></span>
            <span>${escapeHtml(stage.common)}</span>
          </div>
          <p class="chapter-copy reveal" style="--i:2">${escapeHtml(stage.body)}</p>
          <blockquote class="chapter-quote reveal" style="--i:3">${escapeHtml(stage.quote)}</blockquote>
          <dl class="chapter-stats reveal" style="--i:4">${stats}</dl>
          ${index === STAGE_COUNT - 1 ? `<button class="restart-button reveal" style="--i:5" type="button" data-goto="0"><span>RETURN TO THE FIRST STEP</span><i aria-hidden="true">↺</i></button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  railEl.innerHTML = STAGES.map(
    (stage, index) => `
      <button class="rail-button" type="button" data-goto="${index}" aria-label="${escapeHtml(stage.epoch)} — ${escapeHtml(stage.species)}">
        <span class="rail-label">${escapeHtml(stage.common)}</span>
        <span class="rail-index">${stage.index}</span>
        <span class="rail-mark"></span>
      </button>
    `,
  ).join("");

  ticksEl.innerHTML = STAGES.map(() => "<span></span>").join("");
}

function setActiveStage(index) {
  if (index === activeStage) return;
  const previous = activeStage;
  activeStage = index;
  const stage = STAGES[index];

  panelsEl.querySelectorAll(".chapter-panel").forEach((panel) => {
    const panelIndex = Number(panel.dataset.stage);
    const active = panelIndex === index;
    panel.classList.toggle("is-active", active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });

  railEl.querySelectorAll(".rail-button").forEach((button) => {
    const active = Number(button.dataset.goto) === index;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "chapter");
    else button.removeAttribute("aria-current");
  });

  ticksEl.querySelectorAll("span").forEach((tick, tickIndex) => {
    tick.classList.toggle("is-active", tickIndex === index);
  });

  document.documentElement.style.setProperty("--accent", stage.accent);
  timeValue.textContent = stage.year === "0" ? "NOW" : `${stage.year} YEARS AGO`;
  chapterCount.textContent = `${String(index + 1).padStart(2, "0")} / ${String(STAGE_COUNT).padStart(2, "0")}`;
  document.title = `HOMO — ${stage.species}`;
  body.dataset.stage = String(index);

  if (soundscape && index !== lastSoundStage) {
    lastSoundStage = index;
    soundscape.setStage(index, stage.env.fire, stage.env.snow);
  }

  if (previous === -1 && index === 0) {
    // The opening title should arrive just after the loader, not before it.
    scrollHint.classList.remove("is-hidden");
  }
}

function updateScrollUI() {
  topProgress.style.transform = `scaleX(${scrollProgress})`;
  timeProgress.style.transform = `scaleX(${scrollProgress})`;
  scrollHint.classList.toggle("is-hidden", scrollProgress > 0.012);
}

function scrollToStage(index) {
  measureScroll();
  const progress = index / LAST_STAGE;
  const top = progress * maxScroll;
  if (lenis) {
    lenis.scrollTo(top, {
      duration: 1.9,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  } else {
    window.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  }
}

function openInfo() {
  infoModal.classList.add("is-open");
  infoModal.setAttribute("aria-hidden", "false");
  body.classList.add("modal-open");
  if (lenis) lenis.stop();
  setTimeout(() => infoModal.querySelector(".info-close").focus(), 80);
}

function closeInfo() {
  if (!infoModal.classList.contains("is-open")) return;
  infoModal.classList.remove("is-open");
  infoModal.setAttribute("aria-hidden", "true");
  body.classList.remove("modal-open");
  if (lenis && !isLoading) lenis.start();
  infoButton.focus();
}

function trapModalFocus(event) {
  if (event.key !== "Tab" || !infoModal.classList.contains("is-open")) return;
  const focusable = infoModal.querySelectorAll(
    'button, a[href], [tabindex]:not([tabindex="-1"])',
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function wireInterface() {
  document.addEventListener("click", (event) => {
    const goto = event.target.closest("[data-goto]");
    if (goto) {
      event.preventDefault();
      scrollToStage(Number(goto.dataset.goto));
      return;
    }
    if (event.target.closest("[data-close-info]")) {
      event.preventDefault();
      closeInfo();
    }
  });

  infoButton.addEventListener("click", openInfo);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInfo();
    trapModalFocus(event);
  });

  soundButton.addEventListener("click", async () => {
    if (!soundscape) return;
    const on = await soundscape.toggle();
    soundButton.classList.toggle("is-on", on);
    soundButton.setAttribute("aria-pressed", String(on));
    soundLabel.textContent = on ? "SOUND ON" : "SOUND OFF";
    if (on && activeStage >= 0) {
      const stage = STAGES[activeStage];
      soundscape.setStage(activeStage, stage.env.fire, stage.env.snow);
    }
  });

  if (finePointer) {
    window.addEventListener("pointermove", (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
      cursor.x = event.clientX;
      cursor.y = event.clientY;
      if (!cursor.seen) {
        cursor.seen = true;
        cursor.ringX = cursor.x;
        cursor.ringY = cursor.y;
        cursor.dotX = cursor.x;
        cursor.dotY = cursor.y;
        body.classList.add("has-cursor");
      }
      const interactive = event.target.closest("button, a, [data-goto]");
      cursorRing?.classList.toggle("is-hover", Boolean(interactive));
      cursorDot?.classList.toggle("is-hover", Boolean(interactive));
    });

    window.addEventListener("pointerdown", () => {
      cursorRing?.classList.add("is-down");
    });
    window.addEventListener("pointerup", () => {
      cursorRing?.classList.remove("is-down");
    });
    document.documentElement.addEventListener("mouseleave", () => {
      body.classList.remove("has-cursor");
      cursor.seen = false;
    });
  }

  document.getElementById("fallback-close")?.addEventListener("click", () => {
    fallback.hidden = true;
    body.classList.add("is-loaded");
    body.style.overflow = "";
    setActiveStage(0);
  });

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 150));
}

/* ----------------------------------------------------------------------- */
/* Three.js                                                               */
/* ----------------------------------------------------------------------- */

function setupThree() {
  const canvas = document.getElementById("scene");
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = true;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6a533d, 0.034);

  camera = new THREE.PerspectiveCamera(
    STAGES[0].camera.fov,
    window.innerWidth / window.innerHeight,
    0.08,
    140,
  );
  camera.position.set(...STAGES[0].camera.position);
  camera.position.x += 1.4;
  camera.position.y += 2.8;
  camera.position.z += 7.5;
  camera.lookAt(new THREE.Vector3(...STAGES[0].camera.target));

  cameraPosition.copy(camera.position);
  cameraLook.set(...STAGES[0].camera.target);

  world = new World(scene, renderer);
  hominid = new Hominid(scene);
  soundscape = new Soundscape();

  const renderPass = new RenderPass(scene, camera);
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    isSmallScreen ? 0.26 : 0.34,
    0.7,
    0.82,
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  timer.connect(document);
  measureScroll();
  updateCamera(0, 0.016, 0, true);
  renderer.setAnimationLoop(animate);

  const start = performance.now();
  let readyTimerStarted = false;
  const markReady = () => {
    if (readyTimerStarted) return;
    readyTimerStarted = true;
    const minimum = 1300;
    const wait = Math.max(0, minimum - (performance.now() - start));
    window.setTimeout(() => {
      isReady = true;
    }, wait);
  };

  // Fonts are the only hard dependency. Shader compilation can finish in the
  // background: waiting for it on software renderers can take far too long.
  document.fonts.ready.then(markReady).catch(markReady);
  window.setTimeout(markReady, 2200);
}

function measureScroll() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 1.8));
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  }
  if (bloomPass) bloomPass.setSize(width, height);
  measureScroll();
}

/* ----------------------------------------------------------------------- */
/* Scroll, camera and morphs                                               */
/* ----------------------------------------------------------------------- */

function updateScroll() {
  if (maxScroll <= 1) measureScroll();
  const y = window.scrollY || window.pageYOffset || 0;
  scrollProgress = clamp(y / maxScroll, 0, 1);
  stageFloat = scrollProgress * LAST_STAGE;
  const nextActive = clamp(Math.round(stageFloat), 0, LAST_STAGE);
  if (nextActive !== activeStage && !isLoading) setActiveStage(nextActive);
  updateScrollUI();
}

function blendTargets() {
  const index = Math.min(Math.floor(stageFloat), LAST_STAGE - 1);
  const frac = stageFloat - index;
  const t = smootherstep(0.07, 0.93, frac);
  const a = STAGES[index];
  const b = STAGES[Math.min(index + 1, LAST_STAGE)];

  for (const key of figureKeys) {
    targetFigure[key] = THREE.MathUtils.lerp(a.figure[key], b.figure[key], t);
  }
  for (const key of poseKeys) {
    targetPose[key] = THREE.MathUtils.lerp(a.pose[key], b.pose[key], t);
  }
  for (const key of propKeys) {
    targetProps[key] = THREE.MathUtils.lerp(a.props[key], b.props[key], t);
  }
  colorA.set(a.figure.skin);
  colorB.set(b.figure.skin);
  mixedSkin.copy(colorA).lerp(colorB, t);
  targetFigure.skin = mixedSkin;
  targetFigure.height = THREE.MathUtils.lerp(a.figure.height, b.figure.height, t);
}

function updateCamera(time, delta, progress, snap = false) {
  const index = Math.min(Math.floor(progress), LAST_STAGE - 1);
  const frac = progress - index;
  const t = smootherstep(0.07, 0.93, frac);
  const a = STAGES[index];
  const b = STAGES[Math.min(index + 1, LAST_STAGE)];

  tempPositionA.set(...a.camera.position);
  tempPositionB.set(...b.camera.position);
  desiredPosition.lerpVectors(tempPositionA, tempPositionB, t);

  tempLookA.set(...a.camera.target);
  tempLookB.set(...b.camera.target);
  desiredLook.lerpVectors(tempLookA, tempLookB, t);

  const intro = 1 - introT;
  desiredPosition.x += intro * 1.1;
  desiredPosition.y += intro * 2.4;
  desiredPosition.z += intro * 6.2;

  // On phones the chapter copy lives at the bottom of the screen. Pull the
  // closer shots back a little and aim below the skeleton so its skull and
  // shoulders sit above the text rather than behind it.
  if (camera.aspect < 0.85) {
    const portraitZoom = progress > 2.35 ? 1.22 : 1.05;
    desiredPosition.sub(desiredLook).multiplyScalar(portraitZoom).add(desiredLook);
    desiredPosition.y += 0.08;
    desiredLook.y -= 0.4;
  }

  const shouldHidePointer = reducedMotion || isLoading;
  const px = shouldHidePointer ? 0 : pointerSmooth.x;
  const py = shouldHidePointer ? 0 : pointerSmooth.y;
  desiredPosition.x += px * 0.2;
  desiredPosition.y += py * 0.08;
  desiredLook.x += px * 0.075;
  desiredLook.y += py * 0.045;

  // A slow breathing camera keeps long holds alive without feeling handheld.
  const drift = reducedMotion ? 0.2 : 1;
  desiredPosition.x += Math.sin(time * 0.16) * 0.055 * drift;
  desiredPosition.y += Math.sin(time * 0.23 + 1.1) * 0.018 * drift;
  desiredLook.y += Math.sin(time * 0.19 + 0.4) * 0.008 * drift;

  if (snap) {
    cameraPosition.copy(desiredPosition);
    cameraLook.copy(desiredLook);
  } else {
    const posLambda = intro > 0.01 ? 1.25 : 2.8;
    cameraPosition.x = THREE.MathUtils.damp(cameraPosition.x, desiredPosition.x, posLambda, delta);
    cameraPosition.y = THREE.MathUtils.damp(cameraPosition.y, desiredPosition.y, posLambda, delta);
    cameraPosition.z = THREE.MathUtils.damp(cameraPosition.z, desiredPosition.z, posLambda, delta);
    cameraLook.x = THREE.MathUtils.damp(cameraLook.x, desiredLook.x, 3.3, delta);
    cameraLook.y = THREE.MathUtils.damp(cameraLook.y, desiredLook.y, 3.3, delta);
    cameraLook.z = THREE.MathUtils.damp(cameraLook.z, desiredLook.z, 3.3, delta);
  }

  camera.position.copy(cameraPosition);
  camera.lookAt(cameraLook);

  const portraitBoost = camera.aspect < 0.9 ? 5 : camera.aspect < 1.35 ? 3.5 : 0;
  const targetFov = THREE.MathUtils.lerp(a.camera.fov, b.camera.fov, t) + portraitBoost + intro * 4;
  camera.fov = snap ? targetFov : THREE.MathUtils.damp(camera.fov, targetFov, 4.5, delta);
  camera.updateProjectionMatrix();
}

function updateCursor(delta) {
  if (!cursor.seen) return;
  const follow = 1 - Math.exp(-11 * delta);
  cursor.ringX += (cursor.x - cursor.ringX) * follow;
  cursor.ringY += (cursor.y - cursor.ringY) * follow;
  cursor.dotX = cursor.x;
  cursor.dotY = cursor.y;
  if (cursorRing) {
    cursorRing.style.transform = `translate3d(${cursor.ringX}px, ${cursor.ringY}px, 0) translate(-50%, -50%)`;
  }
  if (cursorDot) {
    cursorDot.style.transform = `translate3d(${cursor.dotX}px, ${cursor.dotY}px, 0) translate(-50%, -50%)`;
  }
}

function updateLoader(delta) {
  const speed = isReady ? 70 : 26;
  const target = isReady ? 100 : 86;
  loadDisplay = Math.min(target, loadDisplay + delta * speed);
  const pct = Math.min(100, Math.round(loadDisplay));
  if (loaderBar) loaderBar.style.width = `${pct}%`;
  if (loaderPct) loaderPct.textContent = String(pct).padStart(2, "0");
  if (loaderStatus) {
    if (pct < 26) loaderStatus.textContent = "ASSEMBLING SPECIMENS";
    else if (pct < 52) loaderStatus.textContent = "RECONSTRUCTING ANATOMY";
    else if (pct < 78) loaderStatus.textContent = "LIGHTING THE CAMPFIRE";
    else if (pct < 99) loaderStatus.textContent = "DUSTING OFF THE FOSSILS";
    else loaderStatus.textContent = "THE ARCHIVE IS OPEN";
  }
  if (isReady && loadDisplay > 99.4 && isLoading) finishLoading();
}

function finishLoading() {
  isLoading = false;
  loadDisplay = 100;
  if (loaderBar) loaderBar.style.width = "100%";
  if (loaderPct) loaderPct.textContent = "100";
  body.classList.remove("is-loading");
  body.classList.add("is-loaded");
  body.style.overflow = "";
  if (lenis) lenis.start();
  measureScroll();
  introStart = timer.getElapsed();
  activeStage = -1;
  setActiveStage(0);
  lastFrame = timer.getElapsed();
  setTimeout(() => loaderEl?.setAttribute("aria-hidden", "true"), 1300);
}

function animate() {
  timer.update();
  const rawDelta = timer.getDelta();
  const delta = Math.min(rawDelta, 0.05);
  const time = timer.getElapsed();

  if (introStart >= 0) {
    const target = clamp((time - introStart) / 3.6, 0, 1);
    introT = reducedMotion ? 1 : THREE.MathUtils.damp(introT, target, 2.4, delta);
  }

  pointerSmooth.x = THREE.MathUtils.damp(pointerSmooth.x, pointer.x, 3.2, delta);
  pointerSmooth.y = THREE.MathUtils.damp(pointerSmooth.y, pointer.y, 3.2, delta);

  if (lenis) lenis.raf(performance.now());
  if (!isLoading) updateScroll();

  if (world && hominid) {
    blendTargets();
    world.update(stageFloat, time, delta, pointerSmooth);
    hominid.update(time, delta, {
      figure: targetFigure,
      pose: targetPose,
      props: targetProps,
    }, clamp(Math.round(stageFloat), 0, LAST_STAGE));

    if (!isLoading) {
      const angle = Math.atan2(
        camera.position.x - hominid.root.position.x,
        camera.position.z - hominid.root.position.z,
      );
      hominid.root.rotation.y = THREE.MathUtils.damp(
        hominid.root.rotation.y,
        clamp(angle * 0.34, -0.34, 0.34),
        1.2,
        delta,
      );
    }
  }

  updateCursor(delta);
  if (isLoading) updateLoader(delta);

  updateCamera(time, delta, stageFloat, false);

  if (composer) composer.render();
  else if (renderer && scene && camera) renderer.render(scene, camera);

  lastFrame = time;
}

/* ----------------------------------------------------------------------- */
/* Boot                                                                    */
/* ----------------------------------------------------------------------- */

async function boot() {
  buildInterface();
  wireInterface();

  if (!reducedMotion) {
    lenis = new Lenis({
      duration: 1.15,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    lenis.stop();
  }

  body.style.overflow = "hidden";
  measureScroll();

  try {
    setupThree();
  } catch (error) {
    console.error("HOMO could not start WebGL:", error);
    fallback.hidden = false;
    if (loaderEl) loaderEl.style.display = "none";
    body.classList.remove("is-loading");
    body.style.overflow = "";
    return;
  }

  window.setTimeout(() => {
    if (!isReady) {
      // A slow shader compile should never strand the visitor behind the loader.
      isReady = true;
    }
  }, 7000);
}

boot();
