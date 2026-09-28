# AGC — Automatic Game Creator

AGC is a local-first browser editor for turning a 3D scan into an object you can inspect, position and try in a small physics scene. Import a GLB, align it, inspect detected floor candidates and try walking through it. The separate rigid-body Physics Test and project Save/Open remain available.

Public app: **https://linobr.github.io/agc/**. `main` contains the editor, Save/Open Project and the scan Walk Test MVP.

The original Walk Test MVP is preserved as [GitHub release v1.0.0](https://github.com/linobr/agc/releases/tag/v1.0.0), pinned to `6594030`. The walkability increment is preserved as [v1.1.0-walkability](https://github.com/linobr/agc/releases/tag/v1.1.0-walkability), pinned to `b9af19e`. These releases are source recovery points; Pages follows `main`.

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

## Make a small game without code

1. Import and align a scan. Check its walkable region and spawn with **Walk Test**.
2. In **Gameplay**, use **Add Trigger**, **Add Goal** and **Add Collectible**. They appear near the current spawn (or the world origin before a valid spawn exists).
3. Select a gameplay object from the dropdown or by clicking it in the scene. Edit its name, world-space position and XYZ size in the Gameplay inspector. Trigger boxes are blue, goals green and collectibles gold; the selected outline is orange. **Delete gameplay object** also removes rules targeting that object, with a notice.
4. On a trigger, **Add rule**, select **Player enters zone** or **Player leaves zone**, then an action. Collectibles offer **Collectible collected**. A message is plain text; activation actions choose another gameplay object; objective actions take a label. Multiple rules run in their displayed order, up to eight per object.
5. Goals finish the game on contact. Enable **Require all collectibles** to lock the goal until every defined collectible is collected. This includes initially inactive collectibles: add an activation rule if you intend to use them. Gold items disappear when collected. A locked goal has an orange outline during play.
6. Click **Game Test**. Movement, slope/step handling and spawn validation are shared with Walk Test. The HUD shows collected/total, completed objective labels, elapsed seconds and rule messages. On success the game freezes and displays time/count plus **Restart game** and **Back to Editor**.
7. **Restart**, **Respawn**, **R**, or an automatic fall respawn restores every item, activation flag, objective and timer. **Esc** returns to the editor. Save Project to keep the authored configuration; no runtime progress is exported.

The separate **Walk Test** remains a movement/collision diagnostic without gameplay events; **Test scene** remains the original rigid-body test. Gameplay editing is locked while any test is running. Gameplay objects are separate, non-solid, axis-aligned volumes; changing them does not rebuild or modify scan collision. Position is the volume center and size is its full XYZ extent. A player-sized bounding box determines contact, so a trigger can fire near a volume edge and a collectible can be reached through a very thin wall; there is no line-of-sight test.

Allowed actions are **Show message**, **Activate object**, **Deactivate object**, **Mark objective complete**, and **Finish game**. Targets are gameplay objects only, not scan/physics meshes. Objective completion is an idempotent set of labels shown in the HUD; it is not an additional goal prerequisite. A Finish game rule is an independent win path and can intentionally bypass a goal's collectible requirement.

### Rule safety and deterministic behavior

At most 100 gameplay objects and eight rules per object. Names/objective labels are limited to 100 characters, messages to 500; sizes are 0.1–100 m per axis. Projects validate known types, field sets, unique IDs and existing target references before replacing the current scene. Executable/unknown gameplay fields and persisted runtime fields are rejected. Messages/names are rendered as text. There is no JavaScript action, expression parser, `eval`, network action or timer action.

Each fixed physics step first snapshots contacts/active flags and gathers enter, leave and collected events. It then executes matching actions in object/rule order, then checks goals. Actions do not emit events, so activation references (even self-references) cannot recursively execute. Activating a trigger while the player is already inside does not create an enter event: leave and re-enter to fire it. A player starting inside an active zone counts as entering on the first step. Pickups fire once per run, and reactivating a collected item does not uncollect it. A final pickup while already inside an active goal unlocks that goal immediately. Time measures wall-clock seconds since restart, including time while the tab is hidden, and freezes on success.

This is a game-authoring MVP: no arbitrary scripting, object rotation for trigger volumes, nested objectives, moving platforms, inventory, enemies, scoring system or standalone game export. Invalid geometric spawn still blocks Game Test. The existing scan limits apply.

## Save and reopen a project

**Save Project** downloads `scene.agc`, a versioned JSON settings file. Keep the
original GLB alongside it: the scan is **not embedded**. **Open Project** reads
these settings, then **Choose original GLB** asks for the same filename and byte
size. On HTTPS/localhost a stored SHA-256 checksum also verifies the content.
Opening replaces the scene only after validation; a failed load or **Cancel
opening** keeps the current scene. Empty and primitive-only projects open directly.

Transforms, object names, primitive colors, body behavior, collider shape and
visibility, reset transforms, selection, active tool and camera are restored.
Project v3 stores slope limit, step height, minimum region area, spawn mode/coordinates
and gameplay definitions/rules. Version-1 and version-2 projects migrate to v3.
Collected items, completed objectives, enabled overrides, time and win state are
never saved; opening always restores the authored starting state.
Export during a physics test saves the edited starting transforms, not a transient
simulation position. Opening always returns to editor mode. As in the original
MVP, starting a physics test sets the transform-reset baseline to the edited start.

There is no autosave. Export again after edits; keep both `.agc` and the GLB as
your backup. See [the v3 format specification (with v1/v2 migration)](AGC_PROJECT_FORMAT.md) for limits,
validation and the decision against embedding large scans.

## Prototype limits

This is an editor MVP, not a game engine. It handles one GLB at a time and uses Three.js rendering plus Cannon.js rigid-body boxes. The separate Physics Test retains its box/segment approximations. Walk Test uses static scan triangles; inspect its dedicated overlay. GLB material and texture data are preserved by the loader. Source and optimized assets can be compared later; this MVP does not silently downscale the source. WebGL speed depends on the user's GPU and scan complexity.

The user's Scaniverse palm is a local-only test file and is not included in this repository. Do not commit private uploads, derived assets, credentials, browser recordings or runtime data.

Next recommended development step: a game validation/readiness panel (unreachable or inactive items, missing win condition), followed by a standalone playable export. Cancellable scan analysis in a worker and real-device scan tests remain performance priorities.

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

## Walk Test: regions, steps and spawn

Import and project opening analyze the scene once. Slope, step-height and region-area input changes recalculate when committed (blur/Enter); no scan analysis runs per frame. Move/Rotate/Scale and added objects invalidate the derived data; click **Recalculate walk surfaces** afterwards. Original GLB geometry and the separate Cannon Physics Test remain unchanged.

**WASD / arrows** move along world X/Z (W = −Z, D = +X), **R / Respawn** resets, **Esc / Back to Editor** restores the editor camera. One scene unit is assumed to be one metre; align Y up and scale the scan before analysis. The fixed chase camera does not collide with walls. There is no jump.

### Connected regions and slope

World-space geometric normals, not noisy imported shading normals, determine walkability. **Slope Limit** defaults to **40°**, configurable **0–50°**. Steeper triangles remain colliders and cannot provide grounded support or be climbed by the rounded player feet. Reversed winding is not generally repaired.

Shared edges are joined using union/find and a 1 mm coordinate key. Unmatched boundary edges can also join when both endpoints are within **3 cm**, their vertical difference is at most **2 cm**, and neighboring normals differ by at most **45°**. A vertex touch does not connect islands. Vertically separated floors stay separate. This endpoint-based method does not solve arbitrary T-junctions or unmatched subdivisions.

Very small triangles can contribute to a large floor: the old per-triangle area filter has been replaced by **Minimum region area**, default **0.1 m²**. Smaller isolated components are omitted from walkability, while their collision remains. Triangles with the same three vertices after 1 mm quantization are deduplicated in derived data; if duplicate winding disagrees, the more upward orientation wins. Nearby arbitrary overlapping surfaces are not merged. Area is therefore still an estimate.

Each region has summed area, triangle count, area-weighted center and minimum/maximum height. The inspector displays region count, active region, area and height range using a fixed number of elements. Auto Spawn prefers the largest region with a valid spawn, trying up to 512 distributed candidates across at most 16 regions. A smaller region can win if larger ones have no tested usable spawn. Regions are geometric components, not a navigation mesh or a guarantee of reachability.

### Spawn editing and validation

The blue marker is visible in the editor under **Show Spawn / Player**. **Place Spawn** lets you click a rendered surface; alternatively edit **Spawn X/Y/Z** in world coordinates. **Auto Spawn / Reset** returns to the automatically chosen position. Invalid positions are shown red and blocked at Walk Test start with a reason. Manual spawn coordinates stay fixed when the scan is transformed, so recalculate and reposition them if necessary.

Validation checks all five player spheres and extra respawn headroom, a walkable region beneath the center, and at least four of five support probes. Outer probes allow height changes consistent with the slope limit; one missing outer probe tolerates a small hole. Center support is mandatory. Auto candidates include a slope-dependent foot clearance. These checks do not fill holes or repair geometry; large gaps and obstacles still collide or cause falls. All saved positions are revalidated against the reopened scan.

### Step-up and collision strategy

The existing kinematic controller remains: a 1.8 m tall, 0.6 m wide player approximated by five overlapping spheres, double-sided static triangle collision, a 2 m spatial hash, 120 Hz fixed steps and four penetration passes. All scene objects are frozen in Walk Test. No body per triangle, no sampling that silently drops colliders, and no source-mesh reduction are used. The separate Physics Test retains selectable bounding/segmented boxes.

**Step Height** defaults to **0.20 m**, bounded to **0–0.40 m**; zero disables it. A grounded, moving player probes 0.38 m ahead for the nearest walkable surface. A rise must be more than 2.5 cm and no higher than Step Height. The raised capsule and landing require clearance. The player then lifts at no more than **1.5 m/s**, with collision checks each 1/120 s step; horizontal motion stays at **3 m/s**. It never snaps across the step. Reversing/stopping, lost clearance or a 0.6 s timeout cancels the lift. Airborne players cannot initiate it. Steep faces and raised platform edges cannot provide an accidental lift from rounded-foot collision.

This works for small, sufficiently wide thresholds and steps, not arbitrary stair reconstruction. Tight treads, low ceilings, jagged risers and conflicting geometry can still block movement. Collision is discrete rather than a full swept capsule: severe penetrations, narrow corners and thin features remain limitations.

### Performance limits and measurement

Hard limits remain **100,000 input triangles**, **500,000 triangle–cell references**, **4,000 triangles per cell**; region seam matching additionally stops at **2,000,000 comparisons**. Exceeding a budget reports a readable error and preserves the editor. Render/decode costs of the original scan remain; these tests do not establish real-scan or mobile-GPU performance. Analysis is synchronous and may briefly block the main thread; a worker is the next performance step.

Run the reproducible synthetic-grid benchmark with `node scripts/benchmark-walk.js`. It measures extraction/walkability, region construction and collider indexing separately, plus total analysis including spawn search. Three runs per size, median per phase, no CI timing threshold. The Playwright suite also checks 10k/50k/100k cases for valid results and bounded structures. Benchmark measurements for this increment are recorded in [AGC_PROGRESS.md](AGC_PROGRESS.md).

**Show Walkable**, **Show Collision** and **Show Spawn / Player** toggle the derived overlays. The old **Colliders** button still shows Physics Test bounds. Regions, collision structures, overlays and player state are not serialized; they are rebuilt from the original scan. Project v3 persists walk settings, spawn and gameplay definitions, with migration from v1/v2.

Known difficult inputs: inverted winding, unsupported animated/instanced meshes, large holes, sub-millimetre noise, steep or rough slopes, thin ledges, vegetation, overlapping/non-manifold geometry, wrong scale and enclosed spaces without headroom. The heuristics deliberately prefer rejecting an uncertain start over claiming a repaired scan.

Production smoke check (preview server must already run):

```sh
node scripts/verify-production.js http://127.0.0.1:4189/agc/
node scripts/verify-production.js https://linobr.github.io/agc/
```

It verifies HTTP 200, JS/CSS responses, editor startup, synthetic scan import, walking, ground contact, respawn and return to the editor without a production debug API.

No-code gameplay production smoke (real keyboard, no debug API):

```sh
node scripts/verify-gameplay.js http://127.0.0.1:4189/agc/
node scripts/verify-gameplay.js https://linobr.github.io/agc/
```

It authors a trigger, gated goal and collectible through the inspector, plays through pickup/win, restarts, saves/reopens v3, and returns to an editable scene using only a generated local scan.
