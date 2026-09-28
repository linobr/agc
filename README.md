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
Project v5 stores slope limit, step height, minimum region area, spawn mode/coordinates,
gameplay definitions/rules and scan cleanup recipes. Versions 1–4 migrate to v5.
Collected items, completed objectives, enabled overrides, time and win state are
never saved; opening always restores the authored starting state.
Export during a physics test saves the edited starting transforms, not a transient
simulation position. Opening always returns to editor mode. As in the original
MVP, starting a physics test sets the transform-reset baseline to the edited start.

There is no autosave. Export again after edits; keep both `.agc` and the GLB as
your backup. See [the v5 format specification (with v1/v2/v3/v4 migration)](AGC_PROJECT_FORMAT.md) for limits,
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

**Show Walkable**, **Show Collision** and **Show Spawn / Player** toggle the derived overlays. The old **Colliders** button still shows Physics Test bounds. Regions, collision structures, overlays and player state are not serialized; they are rebuilt from the original scan. Project v5 persists walk settings, spawn, gameplay definitions and cleanup, with migration from v1/v2/v3/v4.

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

It authors a trigger, gated goal and collectible through the inspector, plays through pickup/win, restarts, saves/reopens v5, and returns to an editable scene using only a generated local scan.

## Reversible scan cleanup (project v5)

Import a GLB locally, then use **SCAN QUALITY** in the inspector. The compact analysis
shows triangles, meshes, approximate dimensions/bounds, connected components, isolated
small parts and normal issues. **Good / Needs cleanup / Poor scan quality** are geometry
heuristics, not a visual quality certificate: holes, textures, recognizable objects and
all forms of frayed edges cannot be evaluated automatically. Coordinates assume metres.

**Auto Clean Scan** derives a separate geometry copy. It welds exact positions for component
analysis within each mesh (including UV/normal seams), preserves the largest surface-area
component, removes only separated parts below 0.5% of its area and 10% of its diagonal,
and removes distant fragments beyond three main diagonals if below 2% of the main area.
A 1%-diagonal separation margin protects nearby details. Overlapping component bounds
are retained conservatively. Missing, invalid or substantially opposing normals are
recomputed using the source indexing/seams (smooth where vertices are shared, flat where
unshared). The derived scan is centered horizontally and grounded; its offset is displayed.
Auto Clean does not perform destructive edits, GLB export or decimation.

**Crop workflow:** click **Crop Scan**, move the blue box with Center X/Y/Z and resize it
with Size X/Y/Z. Orbit the viewport to inspect all sides. **Keep Inside** retains only
triangles whose three vertices are inside; **Remove Inside** removes triangles touching
the box. This can exclude a table, monitor or border even when connected to the main scan.
Each application adds another crop step, measured against original scan-root coordinates.
Up to 32 steps can be combined. Choose the preview operation and **Preview Crop** to inspect
the prospective retained geometry as a cyan wireframe. This is transient: applying Keep/Remove
commits a step; Cancel Preview, saving or starting a test restores the applied scene first.
**Undo Last Step** restores the previous cleanup/optimization/proxy recipe (20 session steps).
View switches do not consume undo. **Reset Crop** clears all crop steps; Crops do not cap cut surfaces or split triangles at
box boundaries; coarse meshes may lose large boundary faces. Empty results are rejected.

Switch **Original / Cleaned / Optimized** at any time to compare triangles, removed automatic
components, bounds and dimensions. **Reset Cleanup** clears the recipe and restores source
geometry, normals and bounds exactly. Editable transforms remain independent. The original
GLB is always unchanged and must be retained separately for Save/Open. Project v5 stores
only recipes, optimization/proxy parameters and lighting; v1/v2/v3/v4 migrate.

Studio uses neutral hemisphere, key and fill lighting with sRGB output and ACES tone
mapping. Neutral reduces directional contrast; Original restores the previous editor light
rig. Exposure and light/dark backgrounds are saved. Lighting cannot remove baked shadows,
recover missing textures, repair holes or reversed triangle winding, or turn damaged photogrammetry into a finished asset.
**Optimized** is an optional simplification of Cleaned, generated on demand. A pinned, small
`meshoptimizer@1.3.0` dependency supplies its standalone WASM simplifier (no runtime network
resource). The default target is 200k triangles with a 0.1% estimated relative error limit;
50k/100k/200k presets and a numeric target are available. UVs, normals and vertex colors
participate in the error metric; material groups and open borders are preserved. Surviving
vertex attributes are copied, never written back to source. The target may not be reached:
quality, seams and topology take precedence. This is lossy, not a visual quality guarantee;
inspect thin details and texture distortion before using a coarser error setting.
See [Meshoptimizer simplifier documentation](https://github.com/zeux/meshoptimizer/tree/master/js#simplifier).

Geometry switches and cleanup rebuild walk collision triangles, surface regions and spawn
validation without deleting gameplay objects/rules/goals/collectibles. Physics Test still
uses its documented box/compound approximations, now based on active compacted geometry;
it is not a triangle-accurate collider and can bridge empty space. Walk Test and Walkability
use a separate **Collision Proxy** when available. The default proxy target is 20k triangles
with estimated absolute error at most 0.01 scan units. The proxy ignores visual UV/material
seams, welds only exactly matching positions, and preserves open borders; it does not fill
holes, prune components or sample away arbitrary triangles. Original mode has its own proxy;
Cleaned/Optimized share a proxy derived from Cleaned, so visual simplification settings do
not affect collision. Show Collision Proxy displays it in magenta in the editor. The existing
Show Collision overlay displays the triangles actually used by Walk Test.

Proxies are used only below 100k triangles and an estimated world-space error of 0.025 units;
later scale edits can invalidate this guard. Otherwise Walk falls back to visual geometry
and retains all existing triangle, region, spatial and spawn guards. A proxy can still be
unusable for walking (dense cells, narrow surfaces, no headroom), even below the triangle
budget. Lower its target, crop, or author a collision mesh externally. Small scans below the
proxy target use visual triangles directly. Proxy generation never alters the visual mesh. Cleanup supports static meshes up to 600k triangles; above that,
counts/bounds remain available but connectivity and cleanup are explicitly disabled.
Analysis runs at import/open and cleanup on user action, never per frame. Long geometry
passes yield periodically and report status, though decoding, normals and buffer allocation
may still briefly block on large files. Quality-analysis components remain per mesh; the
position-only proxy can weld exact coincident positions across meshes. Cached visual variants
and proxies require additional RAM while preserving the original for reversible comparison.

Local visual verification: `node scripts/verify-scan.js http://127.0.0.1:4189/agc/ /absolute/path/to/scan.glb`
uses a running production preview and stores ignored screenshots/metrics in `artifacts/scan-verification`.
The optional private scan is accepted only on localhost; live verification uses generated
fixtures. Never add private GLBs, screenshots or traces to Git.


Optimized/proxy production check (generated scan for live; private file allowed only locally):

```sh
node scripts/verify-optimized.js http://127.0.0.1:4189/agc/
node scripts/verify-optimized.js http://127.0.0.1:4189/agc/ /absolute/path/to/scan.glb
node scripts/verify-optimized.js https://linobr.github.io/agc/
```

The comparison displays all four triangle counts, active mode, achieved vs requested target,
estimated errors and generation timings. Cached variants are reused on view switches;
recipe changes regenerate affected data and revalidate walkability/spawn. Crop preview and
undo history are intentionally session-only; saved crop steps and optimization/proxy settings
are rebuilt from the separately retained original GLB when opening a v5 project.


Representative local scan check (448,567 triangles): default Optimized produced 199,999
triangles without a pronounced degradation in the inspected overview/detail screenshots.
The default proxy produced 19,939 triangles but hit the existing per-cell Walk density guard.
For this scan, proxy target 5,000 with error 0.02 produced 7,195 triangles (7,101 after Walk's
duplicate filtering), with valid spawn and grounded Walk Test. The base proxy defaults remain 20k/0.01; automatic tuning can now select this coarser
collision setting when it validates successfully. Its estimated error was 0.01983 scan units; the target
was intentionally not forced. Neither variant repairs the scan's holes, frayed leaves or
baked texture defects. Local screenshots/metrics stay in the ignored verification folder.

Visual and collision targets are independent. For unusually low visual targets, lower the
proxy target too if needed; a strict collision error budget may still retain more triangles.

### Automatic proxy tuning, presets and health

New imports enable **Auto Tune Proxy** above the current proxy target. Optimization, applied
cleanup and crop changes also tune when the checkbox is enabled. At most six target/error
pairs are tried: 1k/0.005, 3k/0.01, 5k/0.02, 10k/0.01, 20k/0.005 and current manual values
(duplicates skipped). No new attempt starts after 30 seconds; a running geometry pass can
finish later. Each trial observes the 600k source budget, 100k collision budget, world-error,
spatial-density and region guards. All scene collision objects participate. Current slope,
step height and region area apply, and a manual spawn must remain valid. Among successful
trials the smallest **actual** triangle count wins; equal counts favor lower estimated error.
This is a bounded search, not proof of a global optimum or complete gameplay traversal.
Trials do not change the visual scan or gameplay objects. If none passes, previous collision
data stays active and status explains the block or usable fallback. Use crop/alignment/scale
or manual collision authoring when appropriate. Manual **Rebuild Proxy** disables automatic
tuning; re-enable the checkbox explicitly. Explicit tuning remains available. Opening a
project rebuilds saved parameters without retuning, preserving the chosen result.

Presets apply only on **Apply Preset Defaults**, never merely on recommendation:

| Preset | Visual target | Proxy target / error (scan units) | Slope | Step (m) | Min region (m²) |
| --- | ---: | --- | ---: | ---: | ---: |
| Object | 100k | 5k / 0.005 | 35° | 0.15 | 0.05 |
| Room | 200k | 20k / 0.01 | 40° | 0.20 | 0.20 |
| Outdoor | 200k | 20k / 0.02 | 45° | 0.30 | 0.50 |
| Vegetation | 200k | 5k / 0.02 | 40° | 0.20 | 0.10 |

Presets never crop, remove islands or move geometry; every value remains editable. Existing
cleanup recipes remain intact. Recommendation uses maximum original scan dimension (>30:
Outdoor, >6: Room), then density (>100k triangles: Vegetation, otherwise Object). It assumes
scan units are metres and is **not semantic recognition**; a dense object can be misclassified.
The health summary reports active render complexity (low ≤50k, medium ≤200k, high >200k),
actual selected collision geometry, walk/spawn state and a next action. `valid` means a proxy
with validated spawn, `fallback` means validated visual/previous collision data, and `blocked`
means walking is unvalidated or unavailable. Changing spawn/transform can invalidate it.

**Performance HUD** is optional in Walk/Game Test and session-only. It shows measured frame
interval/FPS using a 0.1-weight exponential moving average, refreshed twice per second;
measurement resets outside test mode, when toggled or on visibility changes. Frame time is
wall-clock interval, not isolated CPU/GPU work. Render triangles are the renderer's actual
previous-frame triangle count, including visible helpers/gameplay; proxy triangles count
selected proxy buffers before Walk duplicate filtering. These are different measurements.
Software GPU/headless measurements are not a hardware performance guarantee. No profiling,
analysis or proxy generation runs per frame.

Production verification (private path accepted only with localhost URL):

```sh
node scripts/verify-intelligence.js http://127.0.0.1:4189/agc/ /absolute/path/to/scan.glb
node scripts/verify-intelligence.js https://linobr.github.io/agc/
```
