# AGC — Automatic Game Creator

AGC is a local-first browser editor for turning a 3D scan into an object you can inspect, position and try in a small physics scene. The first prototype focuses on a single reliable loop: import a GLB, align it, inspect a simple collider, start a physics test, grab and drop objects, then restore the edited starting scene.

Public app: **https://linobr.github.io/agc/**. `main` contains the tested MVP, Save/Open Project (`6b145dd`) and GitHub Pages setup (`67e84f6`). Pages deployment was successfully tested.

`main` is the current working, checked source. Use temporary feature branches for concrete work; mark important stable recovery points with Git tags / GitHub Releases. Never include secrets, runtime data or private user assets in Git or releases.

## Run locally

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open `/agc/` on the dev server. The Vite build uses `/agc/` as its base path for the existing GitHub Pages deployment. `npm run build` verifies the static output; no upload endpoint or AI service is used. Imported files remain in the browser tab and are never sent to a server.

## Controls

- **Import GLB** or drop a `.glb` into the viewport.
- Use Move / Rotate / Scale to edit the selected object's transform. Focus recenters the camera; Ground rests its bounds on the floor; Reset restores its import transform.
- Choose Static or Physics, then **Test scene**. In test mode, click an object and drag it; release to let it fall. **Reset test** restores the exact edited transforms.
- Show collider overlays to inspect the current simplified bounds. Colliders are deliberately coarse boxes; they are not a repaired scan surface or a walkable-surface guarantee.
- The included primitives make repeatable physics checks possible without the private scan.

## Save and reopen a project

**Save Project** downloads `scene.agc`, a versioned JSON settings file. Keep the
original GLB alongside it: the scan is **not embedded**. **Open Project** reads
these settings, then **Choose original GLB** asks for the same filename and byte
size. On HTTPS/localhost a stored SHA-256 checksum also verifies the content.
Opening replaces the scene only after validation; a failed load or **Cancel
opening** keeps the current scene. Empty and primitive-only projects open directly.

Transforms, object names, primitive colors, body behavior, collider shape and
visibility, reset transforms, selection, active tool and camera are restored.
Export during a physics test saves the edited starting transforms, not a transient
simulation position. Opening always returns to editor mode. As in the original
MVP, starting a physics test sets the transform-reset baseline to the edited start.

There is no autosave. Export again after edits; keep both `.agc` and the GLB as
your backup. See [the v1 format specification](AGC_PROJECT_FORMAT.md) for limits,
validation and the decision against embedding large scans.

## Prototype limits

This is an editor MVP, not a game engine. It handles one GLB at a time and uses Three.js rendering plus Cannon.js rigid-body boxes. Complex scan collision is approximated by bounds, including static scans; use the overlay to judge the approximation. GLB material and texture data are preserved by the loader. Source and optimized assets can be compared later; this MVP does not silently downscale the source. WebGL speed depends on the user's GPU and scan complexity.

The user's Scaniverse palm is a local-only test file and is not included in this repository. Do not commit private uploads, derived assets, credentials, browser recordings or runtime data.

Next recommended development step: walkable scan surfaces and better scan-dependent colliders.

## Checks

```sh
npm test
npm run build
npm audit --audit-level=moderate
```

Playwright tests cover the local editor flow with generated GLBs and primitives. They do not imply mobile-GPU performance or support for every malformed GLB.

## Prototype preview

The checked-in captures show the local-only start screen, the palm scan with its coarse collider, and the primitive physics test:

| Start                                 | Scan + collider                                              | Physics test                               |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| ![AGC start](artifacts/agc-start.png) | ![Imported scan and bounds](artifacts/agc-scan-collider.png) | ![Physics test](artifacts/agc-physics.png) |

The private source GLB is intentionally absent. See [AGC_PROGRESS.md](AGC_PROGRESS.md) for the current main baseline, test evidence and limits.
