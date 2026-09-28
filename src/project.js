// AGC v1 stores editor state and a reference to the original local GLB.
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_GLB_BYTES = 250 * 1024 * 1024;
export const fileName = (name) => name.split(/[\\/]/).at(-1);
export async function scanMetadata(file, bytes) {
  const digest = globalThis.crypto?.subtle
    ? await crypto.subtle.digest("SHA-256", bytes)
    : null;
  return {
    fileName: fileName(file.name),
    byteLength: file.size,
    sha256: digest
      ? Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
      : null,
  };
}
function requireValue(condition, field) {
  if (!condition) throw new Error(`Invalid AGC project: ${field}.`);
}
function vector(value, length, field) {
  requireValue(Array.isArray(value) && value.length === length &&
    value.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e6), field);
}
function pose(value, field) {
  requireValue(value && typeof value === "object", field);
  vector(value.position, 3, `${field} position`);
  vector(value.quaternion, 4, `${field} rotation`);
  requireValue(Math.abs(Math.hypot(...value.quaternion) - 1) < 0.001, `${field} rotation must be normalized`);
  vector(value.scale, 3, `${field} scale`);
  requireValue(value.scale.every((n) => Math.abs(n) >= 0.01 && Math.abs(n) <= 10000), `${field} scale is outside the supported range`);
}
export function parseProject(text) {
  let p;
  try { p = JSON.parse(text); }
  catch { throw new Error("Invalid AGC project: the file is not valid JSON."); }
  requireValue(p?.format === "agc-project", "expected format agc-project");
  if (p.version !== 1) throw new Error(`Unsupported AGC project version: ${String(p.version)}. This editor supports version 1.`);
  requireValue(Array.isArray(p.objects) && p.objects.length <= 500, "objects must be an array with at most 500 entries");
  const ids = new Set();
  let models = 0;
  for (const o of p.objects) {
    requireValue(o && typeof o.id === "string" && o.id.length <= 100 && !ids.has(o.id), "object IDs must be unique strings");
    ids.add(o.id);
    requireValue(typeof o.name === "string" && o.name.length <= 500, "object name");
    requireValue(["model", "primitive"].includes(o.kind), "object kind");
    requireValue(["static", "dynamic"].includes(o.bodyType), "body type");
    requireValue(["box", "compound"].includes(o.collider), "collider shape");
    pose(o.transform, "object transform");
    pose(o.initial, "reset transform");
    if (o.kind === "model") {
      models++;
      const s = o.source;
      requireValue(s && typeof s.fileName === "string" && s.fileName.length <= 255 &&
        /^[^\\/:]+\.glb$/i.test(s.fileName), "scan filename must be a GLB basename, without a path");
      requireValue(Number.isInteger(s.byteLength) && s.byteLength > 0 && s.byteLength <= MAX_GLB_BYTES, "scan size");
      requireValue(s.sha256 === null || /^[a-f0-9]{64}$/.test(s.sha256), "scan checksum");
    } else requireValue(/^#[a-f0-9]{6}$/i.test(o.color), "primitive color");
  }
  requireValue(models <= 1, "only one scan is supported");
  const e = p.editor;
  requireValue(e && typeof e.collidersVisible === "boolean", "collider visibility");
  requireValue(["select", "translate", "rotate", "scale"].includes(e.tool), "editor tool");
  requireValue(e.selectedId === null || ids.has(e.selectedId), "selected object");
  requireValue(e.camera && typeof e.camera === "object", "camera");
  vector(e.camera.position, 3, "camera position");
  vector(e.camera.target, 3, "camera target");
  requireValue(Number.isFinite(e.camera.near) && Number.isFinite(e.camera.far) &&
    e.camera.near > 0 && e.camera.far > e.camera.near && e.camera.far <= 1e9, "camera clipping planes");
  return p;
}
export function serializePose(root) {
  return { position: root.position.toArray(), quaternion: root.quaternion.toArray(), scale: root.scale.toArray() };
}
export function restorePose(root, pose) {
  root.position.fromArray(pose.position);
  root.quaternion.fromArray(pose.quaternion);
  root.scale.fromArray(pose.scale);
  root.updateMatrixWorld(true);
}
