# AGC project format, version 3 (v1/v2 compatible)

`.agc` files are UTF-8 JSON with `format: "agc-project"` and `version: 3`.
Versions 1 and 2 are migrated in memory and exported as v3. Version 1 receives
the walk defaults below; both older versions receive an empty gameplay array.
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
  "version": 3,
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

Version-2 and version-3 files require the complete `walk` object; invalid numeric types, missing
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
unchanged. Older editors cannot read v3 files; keep old project copies if you need to return
to either the v1.0.0 or v1.1.0-walkability source release.

Region membership, region IDs, active region, triangle copies, spatial buckets,
performance measurements and debug visibility are derived/session data and are
not stored. Opening a project recalculates these, so no large mesh payloads or
private scan data are introduced into `.agc`.

## Gameplay definitions (v3)

`gameplay` is required in v3 and is an array of at most 100 objects. v1/v2 imports
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
