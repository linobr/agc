# AGC — Automatic Game Creator

AGC is a local-first browser editor for turning a 3D scan into an object you can inspect, position and try in a small physics scene. Import a GLB, align it, inspect detected floor candidates and try walking through it. The separate rigid-body Physics Test and project Save/Open remain available.

Public app: **https://linobr.github.io/agc/**. `main` contains the editor, Save/Open Project and the scan Walk Test MVP.

`main` is the current working, checked source. Keep completed, checked work on `main`. Never include secrets, runtime data or private user assets in Git or releases.

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

This is an editor MVP, not a game engine. It handles one GLB at a time and uses Three.js rendering plus Cannon.js rigid-body boxes. The separate Physics Test retains its box/segment approximations. Walk Test uses static scan triangles; inspect its dedicated overlay. GLB material and texture data are preserved by the loader. Source and optimized assets can be compared later; this MVP does not silently downscale the source. WebGL speed depends on the user's GPU and scan complexity.

The user's Scaniverse palm is a local-only test file and is not included in this repository. Do not commit private uploads, derived assets, credentials, browser recordings or runtime data.

Next recommended development step: connected floor patches and a user-adjustable spawn, followed by scan collision preprocessing in a worker and representative device benchmarks.

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

## Walk Test MVP

Import automatically analyzes the scene once. After Move/Rotate/Scale, adding objects or changing thresholds, click **Recalculate walk surfaces**. **Walk Test** starts only when a spawn was found. **WASD / arrows** move along world X/Z (W = −Z, D = +X), **R / Respawn** resets, **Esc / Back to Editor** restores the editor camera. Gravity is enabled; jump and automatic stair stepping are intentionally absent. A fixed chase camera follows the player. Assume one scene unit equals one metre; align Y up and scale the scan before analysis.

Detection uses geometric triangle winding/normals in world space, default maximum slope **40°** and minimum triangle area **0.005 m²**, configurable in the panel. Counts and summed candidate area are shown (overlaps count twice). These are candidate triangles, not connected floor regions or a navigation mesh. Heights remain separate, including stacked floors. Spawn selection tries the lowest 512 candidates, using five downward support probes and full player/headroom clearance. It can reject usable scenes; it is not a proof of safety or reachability. A missing spawn or exceeded budget keeps the editor usable with a status message.

**Collision decision:** Walk Test uses a separate kinematic controller, approximating a 1.8 m tall, 0.6 m wide capsule with five overlapping spheres against static, double-sided triangles. All scene geometry, including primitives and objects marked Physics, is frozen for this mode. A 2 m spatial hash limits nearby triangle checks; fixed 120 Hz steps, four penetration passes, gravity and normal projection provide ground contact and wall sliding. No Cannon body/shape per triangle is created. This avoids relying on Cannon's restricted trimesh shape-pair support and preserves openings that whole-scan boxes would fill. The existing Cannon Physics Test keeps its original selectable box/segment colliders. The GLB is never modified or simplified.

Hard analysis budgets: **100,000 triangles**, **500,000 triangle–cell references**, **4,000 triangles per cell**. Unsupported animated/instanced meshes and exceeded budgets fail visibly, without silently skipping collision triangles. Geometry is traversed once per analysis; only bounded world-space triangles and debug buffers are derived. There is no per-frame scan analysis. Large original assets still incur their normal rendering/GLB decode cost. Dense scans may require a smaller separately prepared section. This is a bounded MVP, not a demonstrated large-scan solution.

Separate toggles control candidate surfaces, actual Walk collider wireframes, and spawn/player markers. Existing **Colliders** remains the Physics Test bounds overlay. Walk settings, derived geometry, spawn and player state are transient; project v1 stays unchanged and opening a project recalculates with the current session thresholds.

Known difficult inputs: reversed triangle winding, dense micro-triangles below the area threshold, holes, stairs, steep/rough slopes, thin ledges, vegetation, overlapping or non-manifold surfaces, inaccurate scale and enclosed rooms without clearance. Collision is discrete rather than swept; severe penetrations and tight corners can still cause jitter. The chase camera does not collide with walls. No real private scan or target-device performance claim is implied by the synthetic tests.

Production smoke check (preview server must already run):

```sh
node scripts/verify-production.js http://127.0.0.1:4189/agc/
node scripts/verify-production.js https://linobr.github.io/agc/
```

It verifies HTTP 200, JS/CSS responses, editor startup, synthetic scan import, walking, ground contact, respawn and return to the editor without a production debug API.
