# HOMO

### Four million years, seven chapters, one skeletal reconstruction.

An interactive, scroll-driven journey through the human family — from the Laetoli footprints to the person reading this sentence. Built with Three.js, a full anatomical skeleton, hand-written shaders and a cinematic post-processing pipeline.

**[Live demo → megabomb420.github.io/homo](https://megabomb420.github.io/homo/)**

![HOMO — an interactive origin story](docs/preview.jpg)

<img src="docs/preview-mobile.jpg" width="280" alt="HOMO on a narrow screen" />

## The idea

Most evolution timelines are straight lines. Ours is not. **HOMO** treats the fossil record as a braided river: seven species, each one a presence rather than a diagram. The central figure is one anatomical specimen, rescaled, leaned and relit as you scroll. The body grows taller, the posture shifts, and the silhouette moves from a low, heavy stance to an upright one.

The landscape changes with it: a Pliocene dusk, a Pleistocene campfire, an ice-age whiteout, a painted cave, a dawn with the ancestors still standing in the fog.

## Chapters

| # | Species | Deep time | Place |
|---|---------|-----------|-------|
| 01 | *Australopithecus afarensis* | 3.6 million years ago | Laetoli, Tanzania |
| 02 | *Homo habilis* | 2.1 million years ago | Olduvai Gorge, Tanzania |
| 03 | *Homo erectus* | 1.6 million years ago | Koobi Fora, Kenya |
| 04 | *Homo heidelbergensis* | 600,000 years ago | Schöningen, Germany |
| 05 | *Homo neanderthalensis* | 250,000 years ago | Shanidar Cave, Iraq |
| 06 | *Homo sapiens* | 70,000 years ago | Sulawesi, Indonesia |
| 07 | *Homo sapiens* | now | everywhere |

## Controls

- **Scroll** to travel through deep time.
- **Move the pointer** to shift the air and parallax.
- Use the **chapter rail** on the right, or the **bottom time bar**.
- **Sound** is off by default. The toggle starts a generated wind / drone / fire soundscape.
- **Field notes** explains the project, the science and the craft.
- On the last chapter, **return to the first step**.

## Craft notes

- **Anatomical specimen**: a full human skeleton from BodyParts3D / Z-Anatomy, split into a joint hierarchy in Blender, reduced from ~499k to ~127k triangles, and driven through seven scales and postures.
- **Idle performance**: head glances with a counter-rotating neck, breathing chest, shoulder sway, elbow drift and small wrist movements — and on desktop it follows the pointer. Never a frozen statue.
- **Cinematic camera**: scroll-driven dolly moves, shallow depth of field focused on the specimen, and a slower pull-back for the final chapter.
- **Film pipeline**: AgX tone mapping, bloom, depth of field, chromatic aberration, SMAA, vignette and animated grain via `postprocessing`.
- **Photographic atmosphere**: a CC0 equirectangular sky panorama feeds a custom cloud/detail shader; PBR normal and roughness maps add scale to the ground.
- **Generative detail**: GPU-instanced grass with wind, instanced stones, smoke, embers, snow, stars, fireflies and cave dust.
- **Light**: a warm-cold lighting rig, flickering fire, long directional shadows and a dedicated cave ambience.
- **No image or audio assets for the narrative**: the cave handprints, footprints and bone surface detail are generated in Canvas; the soundscape is synthesised with Web Audio.
- `prefers-reduced-motion` and touch/small-screen layouts are supported.

## Run it

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

### Build a single file

```bash
npm run build
```

The result is a self-contained `dist/index.html` — fonts, shaders, the skeleton model, sky and PBR maps all inlined. It can be opened directly from disk or dropped on any static host.

## Science note

This is a poetic reconstruction, not a peer-reviewed diagram. Dates and cranial capacities are rounded and debated. "Earliest known" is doing a lot of work in the copy. The skeleton is an anatomical modern-human reference, scaled and leaned for each species; it is an image of a hypothesis, not a forensic portrait.

## Assets & credits

- **Skeleton**: [Z-Anatomy](https://www.z-anatomy.com/), derived from [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), CC BY-SA 4.0 / CC BY-SA 2.1 Japan. Decimated derivative released under CC BY-SA 4.0. See [ASSETS.md](ASSETS.md).
- **Sky**: “Kloppenheim 06 Pure Sky” from Poly Haven, CC0.
- **Ground maps**: “Red Mud Stones” normal/roughness maps from Poly Haven, CC0.
- **Post-processing**: [postprocessing](https://github.com/pmndrs/postprocessing) by pmndrs.
- **Framework**: [Three.js](https://threejs.org), [Vite](https://vite.dev), [Lenis](https://github.com/darkroomengineering/lenis).

## License

Code: MIT — see [LICENSE](LICENSE). Assets: see [ASSETS.md](ASSETS.md); the skeleton derivative is CC BY-SA 4.0.
