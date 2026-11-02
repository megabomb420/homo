# ASSETS & LICENSES

The source code of HOMO is licensed under the MIT License (see `LICENSE`).
The following assets keep their own licenses.

## Anatomical skeleton

`src/assets/skeleton-rig.glb` is a segmented, decimated derivative of the **Z-Anatomy** model set:

- **Z-Anatomy — The libre 3D atlas of anatomy**, by Gauthier Kervyn, Marcin Zielinski and contributors.  
  https://www.z-anatomy.com/  
  License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Derived from **BodyParts3D**, The Database Center for Life Science, by Kousaku Okubo.  
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html  
  License: [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/)

The skeleton was isolated from the Z-Anatomy Blender template, split into head, neck, chest, arm and leg meshes around joint pivots, reduced from approximately 499,000 to 127,000 triangles, and exported as `skeleton-rig.glb` for this project. That derivative is distributed under **CC BY-SA 4.0**. Attribution is also shown in the site's Field Notes panel and in the repository README.

## Sky

“Kloppenheim 06 Pure Sky” from [Poly Haven](https://polyhaven.com/a/kloppenheim_06_puresky), CC0.

## Ground maps

Normal and roughness maps from “Red Mud Stones” by [Poly Haven](https://polyhaven.com/a/red_mud_stones), CC0.

## Libraries

- [Three.js](https://threejs.org) — MIT
- [postprocessing](https://github.com/pmndrs/postprocessing) — Zlib
- [Lenis](https://github.com/darkroomengineering/lenis) — MIT
- [Vite](https://vite.dev) — MIT
- [GSAP](https://gsap.com) — GreenSock Standard “No Charge” License
- Fonts via Fontsource: Instrument Serif, Manrope, IBM Plex Mono (SIL Open Font License)
