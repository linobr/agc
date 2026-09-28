# AGC project format, version 5 (v1/v2/v3/v4 compatible)

`.agc` files are UTF-8 JSON with `format: "agc-project"` and `version: 5`.
Versions 1–4 are migrated in memory and exported as v5. Version 1 receives
the walk defaults below; v1/v2 receive an empty gameplay array. Versions 1–3
receive Original mode, an empty cleanup recipe, and Studio presentation defaults. Version 4
retains its crop, auto flag, offset, mode and lighting, adding the v5 defaults below.
Other versions are rejected with a readable message. Additional fields are ignored and are not exported again. Maximum
settings size is 2 MiB, with at most 500 objects and one model/scan.

## Fields

| Field | Meaning |
| --- | --- |
| `gameplay[]` | Up to 100 declarative gameplay objects, separate from physical scene objects |
| `objects[]` | Ordered scene objects, including the scan and test primitives |
| `objects[].id`, `name`, `kind` | Unique string ID, display name, `model` or `primitive` |
| `objects[].transform` | Edited position, rotation and scale |
| `objects[].initial` | Transform-reset baseline; preserved independently of the current transform |
| `objects[].bodyType` | `static` or `dynamic` |
| `objects[].collider` | `box` or `compound`; derived bounds are rebuilt from geometry |
| `objects[].source` | Models only: `fileName` (basename), `byteLength`, `sha256` (lowercase hex or null) |
| `objects[].color` | Primitives only: sRGB `#rrggbb`; geometry is the MVP's unit box |
| `editor.selectedId` | Selected object ID, or null |
| `editor.tool` | `select`, `translate`, `rotate`, `scale` |
| `editor.collidersVisible` | Global collider-overlay visibility |
| `walk.slope` | Maximum walkable slope in degrees, finite number 0–50; default 40 |
| `walk.stepHeight` | Maximum initiated step rise in metres, finite number 0–0.4; default 0.2; zero disables |
| `walk.minArea` | Minimum connected region area in m², finite number 0–10; default 0.1 (not per-triangle area) |
| `walk.spawnMode` | `auto` or `manual`; default `auto` |
| `walk.spawn` | World-space player foot position `[x,y,z]`, or null in auto mode; default null |
| `editor.camera` | `position`, orbit `target`, `near` and `far` clipping planes |

Transforms contain `position: [x,y,z]`, `quaternion: [x,y,z,w]` and
`scale: [x,y,z]`. Rotation uses normalized quaternions, independent of inspector
degrees. Numeric values must be finite, vector components at most 1,000,000 in
absolute value, and scale magnitude between 0.01 and 10,000. Transformed geometry
also passes the MVP's 10,000-unit dimension limit before the current scene is
replaced. Runtime physics bodies, velocities and grab state are not serialized.
Export during a test uses the edited start, and load enters editor mode.

A minimal empty project:

```json
{
  "format": "agc-project",
  "version": 5,
  "presentation": { "lighting": "studio", "exposure": 1.05, "background": "light" },
  "gameplay": [],
  "walk": { "slope": 40, "stepHeight": 0.2, "minArea": 0.1, "spawnMode": "auto", "spawn": null },
  "objects": [],
  "editor": {
    "selectedId": null,
    "tool": "select",
    "collidersVisible": false,
    "camera": {
      "position": [5.5, 4.2, 7.5],
      "target": [0, 1, 0],
      "near": 0.02,
      "far": 500
    }
  }
}
```

## Walk state, validation and migration

Version-2 through version-5 files require the complete `walk` object; invalid numeric types, missing
fields, out-of-range values or malformed spawn vectors are rejected before the
current scene is replaced. Coordinates must be finite and each component within
±1,000,000. Manual mode requires a non-null position. Extra walk fields are ignored
and removed on export. Editor camera values saved during Walk Test refer to the
pre-test view, not the chase camera. Player movement and respawn do not overwrite
the saved spawn.

Auto mode saves the latest computed spawn, but recomputes it deterministically
from geometry/settings on opening or recalculation. Manual mode preserves its
world coordinates exactly and revalidates them against the current scan. A
geometrically invalid manual spawn does not reject the whole project: the editor
opens, shows the reason and prevents Walk Test until the position is corrected
or **Auto Spawn / Reset** is used. Transforming the scan does not move a manual
world-space spawn with it. Importing a different scan resets the spawn to auto
while retaining the current thresholds.

Version 1 had no persistent walk settings. Migration adds slope 40°, step height
0.2 m, minimum region area 0.1 m², auto spawn and null coordinates before analysis.
Existing transforms, object IDs, scan references, camera and reset baselines are
unchanged. Older editors cannot read v5 files; keep old project copies to return to the
v1.3.0-cleanup (project v4) or earlier source releases.

Region membership, region IDs, active region, triangle copies, spatial buckets,
performance measurements and debug visibility are derived/session data and are
not stored. Opening a project recalculates these, so no large mesh payloads or
private scan data are introduced into `.agc`.

## Gameplay definitions (v3)

`gameplay` is required in v3/v4/v5 and is an array of at most 100 objects. v1/v2 imports
get `gameplay: []` (older unknown gameplay fields are not treated as v3 data).
IDs must be non-empty strings of at most 100 characters and unique across both
scene `objects` and `gameplay`. All gameplay object, rule and action field sets
are strict: unknown fields such as `code`, `script`, `collected`, `elapsed` or
`won` are rejected. No fields are interpreted as executable code.

| Field | Definition |
| --- | --- |
| `id`, `name` | ID as above; non-blank display name, at most 100 characters |
| `type` | `trigger`, `goal`, or `collectible` |
| `position` | Center in world coordinates `[x,y,z]`, finite numbers within ±1,000,000 |
| `size` | Full axis-aligned extents `[x,y,z]`, each finite and within 0.1–100 |
| `enabled` | Boolean authored initial activation, restored on every restart |
| `rules` | Ordered array of at most eight rules; required, empty for goals |
| `requireAll` | Required boolean for goals only; other object types must omit it |

Each rule contains exactly `event` and `action`. Trigger events are `enter` and
`leave`; collectible events are `collected`. Goals use their built-in contact win
condition and cannot carry custom rules that might contradict `requireAll`.

| Action fields | Meaning |
| --- | --- |
| `{ "type": "showMessage", "text": "…" }` | Non-blank literal text, 1–500 characters |
| `{ "type": "activate", "targetId": "…" }` | Activate a referenced gameplay object |
| `{ "type": "deactivate", "targetId": "…" }` | Deactivate a referenced gameplay object |
| `{ "type": "completeObjective", "objective": "…" }` | Complete a non-blank label of 1–100 characters, once per run |
| `{ "type": "finishGame" }` | Finish immediately; independent of built-in goal prerequisites |

Every target ID must exist in `gameplay`, not merely in the scan/primitive list.
Deleting a target in the editor also removes rules referencing it. Target
references are validated before any current scene replacement. Structural errors
leave the current scene intact, just like invalid scan metadata or walk settings.

Example entry:

```json
{
  "id": "welcome-trigger",
  "name": "Welcome",
  "type": "trigger",
  "position": [0, 1, 0],
  "size": [2, 2, 2],
  "enabled": true,
  "rules": [
    { "event": "enter", "action": { "type": "showMessage", "text": "Find the token, then reach the green goal." } }
  ]
}
```

Runtime contact state, collected IDs, enabled overrides, completed objectives,
elapsed time and win state never enter the file. Saving during a test serializes
the original definitions. Opening always enters the editor with authored initial
visibility. Restart, manual respawn and automatic fall respawn reset the whole
run. Initially disabled items still count toward an all-collectibles goal.

Contact events are gathered once per fixed step before actions are applied.
Actions never dispatch another event. Thus even cyclic ID references cannot
create an action recursion/loop; activating an occupied trigger requires a later
physical exit/re-entry to fire enter. Goals are checked after all pickups/actions,
so the last collectible may unlock an already occupied goal. A finish action
stops further actions and freezes the run. Strings are rendered with text APIs,
never HTML interpretation.

## Local scan reference

The original GLB is selected explicitly when reopening. No filesystem paths,
object URLs, mesh data or textures are written into the project. Source filenames
must be basenames ending in `.glb`. The GLB must contain its resources; external
buffer/image references are rejected, so opening a project cannot trigger remote
asset fetches through those references.

The existing importer permits up to 250 MiB. Base64 embedding would turn that
into about 333 MiB before JSON and additional in-memory string copies. No original
GLB buffer is retained after import. A small reference file preserves that memory
model and avoids a ZIP dependency or a custom binary container. Users must keep
the unmodified GLB and `.agc` together; the UI makes this requirement explicit.

SHA-256 uses browser Web Crypto when available (HTTPS/localhost). Without it,
`sha256` is null and only filename/size can be checked; the opening UI discloses
that weaker verification. A file with the same name and size is not proof of
identical content. Projects that already have a checksum require Web Crypto to
open; the app does not silently skip that check. Renamed scans must be restored
to their original filename before opening.

## Autosave decision

No browser autosave. localStorage would hold settings but not a robust
backup of scans up to 250 MiB. IndexedDB could store scans, but needs quota and
failure handling, replacement transactions and an explicit recovery workflow.
That is a separate increment; manual export remains the durable backup. No new
dependencies or uploads are introduced.

## Version 4: reversible scan cleanup

The v4 baseline recipe (migrated to the expanded v5 schema below):

```json
{
  "algorithm": 1,
  "mode": "original",
  "auto": false,
  "crop": null,
  "offset": [0, 0, 0]
}
```

- `algorithm` must equal 1, fixing the recipe semantics. `mode` is `original` or `cleaned`.
- `auto` is a boolean enabling conservative island/outlier filtering and repair of missing/invalid/opposing normals.
- `crop` is null or `{ "operation": "keep", "min": [-1,-1,-1], "max": [1,1,1] }`.
  Operation is `keep` or `remove`. These bounds are in original scan-root coordinates,
  before derived grounding. All coordinates must be finite numbers within ±1,000,000,
  and every maximum must be strictly greater than its minimum. This is the initial crop; v5 adds further crop steps.
- `offset` is a finite three-number translation in scan-root coordinates, applied after filtering.
  Auto Clean derives it from the active root pose to center world X/Z and place the lower bound on world Y=0.
  The root's editable transform and transform-reset baseline remain independent.
- Root `presentation` requires `lighting` (`studio`, `neutral`, `original`), `exposure`
  (finite number 0.2–3), and `background` (`light`, `dark`). Original lighting means the previous editor rig.

No triangle lists, textures, geometry buffers or local paths are saved. Opening verifies the
original GLB and deterministically rebuilds derived geometry before replacing the current scene.
Original mode still retains the recipe for comparison; Reset Cleanup clears it. Unsupported
recipes, numeric strings, invalid bounds and unknown modes are rejected. The previous scene
is retained if rebuilding fails. Walkability, spawn validation and collider bounds are rebuilt
from the selected geometry; gameplay definitions remain intact. The 600,000-triangle cleanup
budget is separate from the unchanged 100,000-triangle walk budget.


## Version 5: optimization, sequential crops and collision proxies

Every v5 model requires the following complete `cleanup` object (algorithm 1 continues to
identify the existing Auto Clean/filter semantics; new fields extend that recipe):

```json
{
  "algorithm": 1,
  "mode": "original",
  "auto": false,
  "crop": null,
  "crops": [],
  "offset": [0, 0, 0],
  "optimization": { "target": 200000, "error": 0.001 },
  "proxy": { "enabled": true, "target": 20000, "error": 0.01 }
}
```

- `mode`: `original`, `cleaned` or `optimized`. Optimized always derives from Cleaned.
- `crop`: initial crop, retained for v4 compatibility. `crops`: up to 31 additional
  `{operation,min,max}` boxes, validated exactly like the first. Each step filters the
  preceding result. Keep retains entire triangles inside; Remove excludes intersections.
- `optimization.target`: integer 100–600000 triangles; `error`: finite relative error
  0.0001–0.005. Desired target is not guaranteed; seams, borders and error budget take priority.
- `proxy.enabled`: boolean; `target`: integer 100–50000; `error`: finite absolute error
  0.001–0.02 in scan-root units. The proxy is derived from Original for Original mode and
  from Cleaned for both other modes. It is optional, position-only, with preserved borders.
- Only proxy geometry within the existing Walk triangle budget and an estimated world-space
  error ≤0.025 is selected. Otherwise the visual geometry is used, with unchanged Walk guards.

Legacy v1–v4 migration fills `crops`, `optimization` and `proxy` defaults. For v4, the initial
crop and all previous cleanup/lighting settings remain intact. Unknown modes, invalid numeric
types/ranges and excessive crop steps are rejected before replacing the current scene.
`presentation`, objects, transforms, gameplay and walk settings retain their existing schema.
No optimized buffers or proxy triangles are serialized. Reopening uses the pinned simplifier
and original GLB to rebuild them; Original remains byte-for-byte separate on disk. Source
metadata/checksum requirements are unchanged. Preview, proxy debug visibility and the bounded
20-step undo stack are session-only; all applied crop operations are persisted.
