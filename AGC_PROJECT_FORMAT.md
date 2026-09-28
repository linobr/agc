# AGC project format, version 1

`.agc` files are UTF-8 JSON with `format: "agc-project"` and `version: 1`.
Unknown versions are rejected with a readable message; no automatic migration is
attempted. Additional fields are ignored and are not exported again. Maximum
settings size is 2 MiB, with at most 500 objects and one model/scan.

## Fields

| Field | Meaning |
| --- | --- |
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
  "version": 1,
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

No browser autosave in v1. localStorage would hold settings but not a robust
backup of scans up to 250 MiB. IndexedDB could store scans, but needs quota and
failure handling, replacement transactions and an explicit recovery workflow.
That is a separate increment; manual export remains the durable backup. No new
dependencies or uploads are introduced.
