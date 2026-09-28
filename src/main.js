import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as CANNON from "cannon-es";
import "./style.css";

const $ = (id) => document.getElementById(id);
const canvas = $("sceneCanvas"),
  viewport = $("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#eef0ec");
const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 500);
camera.position.set(5.5, 4.2, 7.5);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.07;
orbit.target.set(0, 1, 0);
orbit.maxDistance = 120;
const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(0.75);
scene.add(transform.getHelper());
transform.addEventListener("dragging-changed", (e) => {
  orbit.enabled = !e.value;
});
transform.addEventListener("objectChange", syncInspector);

scene.add(new THREE.HemisphereLight(0xf5f8ff, 0x879083, 2.0));
const key = new THREE.DirectionalLight(0xfff4df, 3.2);
key.position.set(5, 9, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0xddeaff, 1.25);
fill.position.set(-5, 4, -4);
scene.add(fill);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: "#e6e8e3", roughness: 0.92 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.015;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 80, "#aab5aa", "#d2d7d0");
grid.position.y = 0;
grid.material.opacity = 0.55;
grid.material.transparent = true;
scene.add(grid);
const floor = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
  position: new CANNON.Vec3(0, 0, 0),
});
floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.allowSleep = true;
world.broadphase = new CANNON.SAPBroadphase(world);
world.addBody(floor);

let objects = [],
  selected = null,
  tool = "select",
  collidersVisible = false,
  testMode = false,
  dragging = null,
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  dragOffset = new THREE.Vector3(),
  loadToken = 0,
  toastTimer;
const raycaster = new THREE.Raycaster(),
  pointer = new THREE.Vector2(),
  planeHit = new THREE.Vector3();
const resize = () => {
  const r = viewport.getBoundingClientRect();
  if (!r.width || !r.height) return;
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  renderer.setSize(r.width, r.height, false);
};
new ResizeObserver(resize).observe(viewport);
resize();

function notify(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
function setTool(next) {
  tool = next;
  document
    .querySelectorAll(".rail-tool[data-tool]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === next));
  transform.setMode(
    next === "translate" ? "translate" : next === "rotate" ? "rotate" : "scale",
  );
  transform.enabled = !!selected && !testMode && next !== "select";
  renderer.domElement.style.cursor =
    next === "select" ? "default" : "crosshair";
}
function cleanNode(node) {
  node.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
    }
  });
}
function updateStats() {
  $("objectCount").textContent = objects.length;
  $("meshStats").textContent =
    `${objects.reduce((n, o) => n + o.meshes, 0)} meshes`;
  $("projectName").textContent =
    objects.length === 1
      ? objects[0].name
      : objects.length
        ? `${objects.length} objects`
        : "Untitled scene";
  $("emptyState").style.display = objects.length ? "none" : "block";
  renderObjectList();
}
function boundsFor(root) {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  if (b.isEmpty()) throw new Error("The GLB contains no visible mesh.");
  const size = b.getSize(new THREE.Vector3());
  if (
    ![size.x, size.y, size.z].every(Number.isFinite) ||
    Math.max(size.x, size.y, size.z) > 10000
  )
    throw new Error(
      "Model dimensions are invalid or outside the supported range.",
    );
  return { box: b, size, center: b.getCenter(new THREE.Vector3()) };
}
function localBoundsFor(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(),
    box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes.position) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const relative = inv.clone().multiply(o.matrixWorld);
    box.union(o.geometry.boundingBox.clone().applyMatrix4(relative));
  });
  if (box.isEmpty()) throw new Error("The GLB contains no visible mesh.");
  return {
    box,
    size: box.getSize(new THREE.Vector3()),
    center: box.getCenter(new THREE.Vector3()),
  };
}
function addEntry(root, name, kind = "model") {
  const box = boundsFor(root);
  root.position.sub(box.center);
  root.position.y += box.size.y / 2;
  root.updateMatrixWorld(true);
  const entry = {
    id: crypto.randomUUID(),
    root,
    name,
    kind,
    bodyType: "static",
    collider: "box",
    meshes: 0,
    triangleCount: 0,
    initial: {
      position: root.position.clone(),
      quaternion: root.quaternion.clone(),
      scale: root.scale.clone(),
    },
    body: null,
    overlay: null,
  };
  root.traverse((o) => {
    if (o.isMesh) {
      entry.meshes++;
      entry.triangleCount += o.geometry.index
        ? o.geometry.index.count / 3
        : (o.geometry.attributes.position?.count || 0) / 3;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(root);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({
      color: "#d17d48",
      transparent: true,
      opacity: 0.95,
    }),
  );
  edges.visible = false;
  edges.renderOrder = 5;
  scene.add(edges);
  entry.overlay = edges;
  objects.push(entry);
  select(entry);
  updateStats();
  focus(entry);
  refreshCollider(entry);
  syncInspector();
}
function removeEntry(entry) {
  if (!entry) return;
  if (entry.body) world.removeBody(entry.body);
  scene.remove(entry.root, entry.overlay);
  cleanNode(entry.root);
  entry.overlay.geometry.dispose();
  entry.overlay.material.dispose();
  objects = objects.filter((o) => o !== entry);
  if (selected === entry) {
    selected = null;
    transform.detach();
    select(null);
  }
  updateStats();
}
function importFile(file) {
  if (!file) return;
  if (
    !file.name.toLowerCase().endsWith(".glb") &&
    file.type !== "model/gltf-binary"
  ) {
    notify("Unsupported file. Choose a binary .glb model.");
    return;
  }
  if (file.size > 250 * 1024 * 1024) {
    notify("This prototype supports GLB files up to 250 MB.");
    return;
  }
  const token = ++loadToken;
  $("loadingOverlay").hidden = false;
  $("loadProgress").textContent = `Reading ${file.name}`;
  $("progressBar").style.width = "16%";
  const reader = new FileReader();
  reader.onprogress = (e) => {
    if (e.lengthComputable && token === loadToken) {
      const pct = Math.round(20 + (e.loaded / e.total) * 45);
      $("progressBar").style.width = `${pct}%`;
      $("loadProgress").textContent =
        `Reading model · ${Math.round(e.loaded / 1048576)} / ${Math.ceil(e.total / 1048576)} MB`;
    }
  };
  reader.onerror = () => {
    if (token === loadToken) {
      $("loadingOverlay").hidden = true;
      notify("The file could not be read. Try another GLB.");
    }
  };
  reader.onload = () => {
    if (token !== loadToken) return;
    $("progressBar").style.width = "72%";
    $("loadProgress").textContent = "Decoding mesh and materials…";
    try {
      new GLTFLoader().parse(
        reader.result,
        "",
        (gltf) => {
          if (token !== loadToken) {
            cleanNode(gltf.scene);
            return;
          }
          try {
            boundsFor(gltf.scene);
            for (const old of [...objects].filter((o) => o.kind === "model"))
              removeEntry(old);
            addEntry(gltf.scene, file.name.replace(/\.glb$/i, ""));
            $("loadingOverlay").hidden = true;
            $("progressBar").style.width = "0%";
            notify(`Imported ${file.name} · ${objects.at(-1).meshes} meshes`);
          } catch (e) {
            cleanNode(gltf.scene);
            $("loadingOverlay").hidden = true;
            notify(`Could not use this model: ${e.message}`);
          }
        },
        (err) => {
          if (token === loadToken) {
            $("loadingOverlay").hidden = true;
            $("progressBar").style.width = "0%";
            notify(
              `GLB decode failed: ${err?.message || "file may be incomplete or invalid"}`,
            );
          }
        },
      );
    } catch (err) {
      $("loadingOverlay").hidden = true;
      $("progressBar").style.width = "0%";
      notify(
        `GLB decode failed: ${err?.message || "file may be incomplete or invalid"}`,
      );
    }
  };
  reader.readAsArrayBuffer(file);
}
function addPrimitive() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random() * 0.12 + 0.34, 0.27, 0.63),
      roughness: 0.48,
      metalness: 0.05,
    }),
  );
  root.add(mesh);
  addEntry(
    root,
    `Test box ${objects.filter((o) => o.kind === "primitive").length + 1}`,
    "primitive",
  );
  notify("Test box added. Select Physics to try it.");
}
function select(entry) {
  selected = entry;
  transform.detach();
  $("noSelection").hidden = !!entry;
  $("objectProperties").hidden = !entry;
  $("transformPanel").hidden = !entry;
  $("focusBtn").disabled = !entry;
  $("groundBtn").disabled = !entry;
  $("resetTransformBtn").disabled = !entry;
  $("selectionLabel").textContent = entry ? entry.name : "No object selected";
  $("inspectorTitle").textContent = entry ? entry.name : "Scene";
  $("objectName").value = entry?.name || "";
  $("objectType").textContent = entry
    ? entry.kind === "primitive"
      ? "PRIMITIVE"
      : "GLB MODEL"
    : "EMPTY";
  document
    .querySelectorAll("[data-body]")
    .forEach((b) =>
      b.classList.toggle(
        "selected",
        b.dataset.body === (entry?.bodyType || "static"),
      ),
    );
  $("colliderShape").value = entry?.collider || "box";
  if (entry) setCollider(entry.collider);
  if (entry && !testMode && tool !== "select") {
    transform.attach(entry.root);
    transform.enabled = true;
  }
  syncInspector();
  renderObjectList();
}
function renderObjectList() {
  const list = $("objectList");
  list.replaceChildren();
  for (const o of objects) {
    const b = document.createElement("button");
    b.className = `object-chip${o === selected ? " selected" : ""}`;
    b.innerHTML = `<span class="object-icon">${o.kind === "primitive" ? "◇" : "▧"}</span><span></span><em>${o.bodyType === "dynamic" ? "PHYSICS" : "STATIC"}</em>`;
    b.children[1].textContent = o.name;
    b.onclick = () => select(o);
    list.append(b);
  }
}
function focus(entry = selected) {
  if (!entry) return;
  const b = boundsFor(entry.root),
    size = Math.max(...b.size.toArray());
  orbit.target.copy(b.center);
  const d = Math.max(size * 1.9, 2.8);
  camera.position.copy(b.center).add(new THREE.Vector3(d * 0.75, d * 0.55, d));
  camera.near = Math.max(0.01, d / 500);
  camera.far = Math.max(500, d * 30);
  camera.updateProjectionMatrix();
  orbit.update();
}
function refreshCollider(entry) {
  if (!entry) return;
  const b = localBoundsFor(entry.root),
    worldCenter = entry.root.localToWorld(b.center.clone()),
    worldScale = entry.root.getWorldScale(new THREE.Vector3());
  entry.overlay.position.copy(worldCenter);
  entry.overlay.quaternion.copy(
    entry.root.getWorldQuaternion(new THREE.Quaternion()),
  );
  entry.overlay.scale.set(
    b.size.x * worldScale.x,
    b.size.y * worldScale.y,
    b.size.z * worldScale.z,
  );
  entry.overlay.visible = collidersVisible;
  entry.localCollider = { size: b.size.clone(), center: b.center.clone() };
  const s = b.size
    .clone()
    .multiply(
      new THREE.Vector3(
        Math.abs(worldScale.x),
        Math.abs(worldScale.y),
        Math.abs(worldScale.z),
      ),
    );
  $("collisionDimensions").textContent =
    `${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)} units`;
}
function syncInspector() {
  if (!selected) return;
  selected.root.updateMatrixWorld(true);
  const p = selected.root.position,
    r = selected.root.rotation,
    s = selected.root.scale;
  for (const input of document.querySelectorAll("[data-vector]")) {
    const v =
      input.dataset.vector === "position"
        ? p
        : input.dataset.vector === "scale"
          ? s
          : r;
    const n =
      input.dataset.vector === "rotation"
        ? THREE.MathUtils.radToDeg(v[input.dataset.axis])
        : v[input.dataset.axis];
    if (document.activeElement !== input) input.value = Number(n.toFixed(2));
  }
  refreshCollider(selected);
}
function applyInput(input) {
  if (!selected || testMode) return;
  const key = input.dataset.axis,
    kind = input.dataset.vector,
    n = Number(input.value);
  if (!Number.isFinite(n)) return;
  const v =
    kind === "position"
      ? selected.root.position
      : kind === "scale"
        ? selected.root.scale
        : selected.root.rotation;
  v[key] = kind === "rotation" ? THREE.MathUtils.degToRad(n) : n;
  if (kind === "scale" && Math.abs(n) < 0.01) v[key] = Math.sign(n || 1) * 0.01;
  selected.root.updateMatrixWorld(true);
  syncInspector();
}
function setBodyType(type) {
  if (!selected || testMode) return;
  selected.bodyType = type;
  document
    .querySelectorAll("[data-body]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.body === type));
  $("objectList")
    .querySelectorAll(".object-chip")
    .forEach((b, i) => {
      if (objects[i] === selected)
        b.lastElementChild.textContent =
          type === "dynamic" ? "PHYSICS" : "STATIC";
    });
  $("objectType").textContent =
    selected.kind === "primitive" ? "PRIMITIVE" : "GLB MODEL";
}
function setCollider(name) {
  if (!selected) return;
  selected.collider = name;
  $("colliderNote").textContent =
    name === "compound"
      ? "Segmented bounds reduce some empty space; still an approximation."
      : "Fast box approximation. Scan detail is visual only.";
}
function groundSelected() {
  if (!selected) return;
  const b = boundsFor(selected.root);
  selected.root.position.y -= b.box.min.y;
  selected.root.updateMatrixWorld(true);
  syncInspector();
}
function resetTransform() {
  if (!selected) return;
  selected.root.position.copy(selected.initial.position);
  selected.root.quaternion.copy(selected.initial.quaternion);
  selected.root.scale.copy(selected.initial.scale);
  selected.root.updateMatrixWorld(true);
  syncInspector();
}

function makeBody(entry) {
  const b = localBoundsFor(entry.root),
    position = entry.root.position,
    shapeType = entry.collider,
    scale = entry.root.scale;
  const body = new CANNON.Body({
    mass: entry.bodyType === "dynamic" ? 1 : 0,
    type:
      entry.bodyType === "dynamic" ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    material: new CANNON.Material({ friction: 0.58, restitution: 0.08 }),
  });
  body.quaternion.set(
    entry.root.quaternion.x,
    entry.root.quaternion.y,
    entry.root.quaternion.z,
    entry.root.quaternion.w,
  );
  const s = b.size
      .clone()
      .multiply(
        new THREE.Vector3(
          Math.abs(scale.x),
          Math.abs(scale.y),
          Math.abs(scale.z),
        ),
      ),
    c = b.center.clone().multiply(scale).applyQuaternion(entry.root.quaternion);
  if (shapeType === "compound" && entry.kind === "model" && s.y > 0.3) {
    const segment = s.y / 3;
    for (let i = 0; i < 3; i++)
      body.addShape(
        new CANNON.Box(
          new CANNON.Vec3(
            Math.max(s.x * 0.42, 0.03),
            Math.max(segment * 0.48, 0.03),
            Math.max(s.z * 0.42, 0.03),
          ),
        ),
        new CANNON.Vec3(c.x, c.y - s.y / 2 + segment * (i + 0.5), c.z),
      );
  } else
    body.addShape(
      new CANNON.Box(
        new CANNON.Vec3(
          Math.max(s.x / 2, 0.025),
          Math.max(s.y / 2, 0.025),
          Math.max(s.z / 2, 0.025),
        ),
      ),
      new CANNON.Vec3(c.x, c.y, c.z),
    );
  return body;
}
function startTest() {
  if (testMode) return;
  testMode = true;
  for (const entry of objects) {
    entry.body = makeBody(entry);
    world.addBody(entry.body);
    entry.root.visible = true;
    entry.initial = {
      position: entry.root.position.clone(),
      quaternion: entry.root.quaternion.clone(),
      scale: entry.root.scale.clone(),
    };
  }
  transform.detach();
  transform.enabled = false;
  orbit.enabled = true;
  $("toast").classList.remove("show");
  $("testBtn").textContent = "■ Stop test";
  $("testBanner").hidden = false;
  $("sceneStatus").textContent = "PHYSICS TEST";
  $("testBanner").style.display = "flex";
  $("resetTestBanner").onclick = resetTest;
}
function resetTest() {
  if (!testMode) return;
  for (const e of objects) {
    if (e.body) world.removeBody(e.body);
    e.body = null;
    e.root.position.copy(e.initial.position);
    e.root.quaternion.copy(e.initial.quaternion);
    e.root.scale.copy(e.initial.scale);
    e.root.visible = true;
    e.root.updateMatrixWorld(true);
    refreshCollider(e);
  }
  if (dragging) {
    dragging = null;
  }
  testMode = false;
  $("testBtn").innerHTML = '<span class="play-icon">▶</span> Test scene';
  $("testBanner").hidden = true;
  $("testBanner").style.display = "none";
  $("sceneStatus").textContent = "EDITOR MODE";
  transform.enabled = !!selected && tool !== "select";
  if (selected && tool !== "select") transform.attach(selected.root);
  orbit.enabled = true;
  syncInspector();
}
function canvasPointer(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
}
function onPointerDown(e) {
  if (e.button !== 0) return;
  canvasPointer(e);
  if (testMode) {
    const hits = raycaster.intersectObjects(
      objects.map((o) => o.root),
      true,
    );
    const entry = objects.find((o) =>
      hits.some(
        (h) => o.root === h.object || o.root.getObjectById(h.object.id),
      ),
    );
    if (entry?.body && entry.body.mass > 0) {
      dragging = entry;
      entry.body.type = CANNON.Body.KINEMATIC;
      entry.body.mass = 0;
      entry.body.updateMassProperties();
      dragPlane.constant = -entry.body.position.y;
      raycaster.ray.intersectPlane(dragPlane, planeHit);
      dragOffset
        .set(
          entry.body.position.x,
          entry.body.position.y,
          entry.body.position.z,
        )
        .sub(planeHit);
      orbit.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    return;
  }
  if (tool === "select") {
    const hits = raycaster.intersectObjects(
      objects.map((o) => o.root),
      true,
    );
    const hit = hits[0];
    select(
      hit
        ? objects.find((o) => {
            let n = hit.object;
            while (n && n !== o.root) n = n.parent;
            return n === o.root;
          })
        : null,
    );
    return;
  }
  if (!transform.dragging) {
    const hits = raycaster.intersectObjects(
      objects.map((o) => o.root),
      true,
    );
    if (hits.length) {
      const hit = hits[0];
      const entry = objects.find((o) => {
        let n = hit.object;
        while (n && n !== o.root) n = n.parent;
        return n === o.root;
      });
      select(entry);
      if (entry) {
        transform.setMode(tool);
        transform.attach(entry.root);
      }
    }
  }
}
function onPointerMove(e) {
  if (!dragging) return;
  canvasPointer(e);
  if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
    const p = planeHit.add(dragOffset);
    dragging.body.position.set(p.x, Math.max(0.3, p.y), p.z);
    dragging.body.velocity.setZero();
    dragging.body.angularVelocity.setZero();
  }
}
function onPointerUp() {
  if (!dragging) return;
  dragging.body.type = CANNON.Body.DYNAMIC;
  dragging.body.mass = 1;
  dragging.body.updateMassProperties();
  dragging.body.wakeUp();
  dragging = null;
  orbit.enabled = true;
}
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
function loop() {
  requestAnimationFrame(loop);
  orbit.update();
  if (testMode) {
    world.step(1 / 60, Math.min(clock.getDelta(), 0.05), 3);
    for (const e of objects) {
      if (!e.body || e.body.type === CANNON.Body.STATIC) continue;
      e.root.position.set(
        e.body.position.x,
        e.body.position.y,
        e.body.position.z,
      );
      e.root.quaternion.set(
        e.body.quaternion.x,
        e.body.quaternion.y,
        e.body.quaternion.z,
        e.body.quaternion.w,
      );
      e.root.updateMatrixWorld(true);
      refreshCollider(e);
    }
  }
  renderer.render(scene, camera);
}
const clock = new THREE.Clock();
loop();

document
  .querySelectorAll(".rail-tool[data-tool]")
  .forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
document
  .querySelectorAll("[data-vector]")
  .forEach((i) => i.addEventListener("change", () => applyInput(i)));
document
  .querySelectorAll("[data-body]")
  .forEach((b) =>
    b.addEventListener("click", () => setBodyType(b.dataset.body)),
  );
$("colliderShape").addEventListener("change", (e) =>
  setCollider(e.target.value),
);
$("objectName").addEventListener("change", (e) => {
  if (!selected) return;
  selected.name = e.target.value.trim() || "Untitled object";
  $("selectionLabel").textContent = selected.name;
  $("inspectorTitle").textContent = selected.name;
  updateStats();
});
$("fileInput").addEventListener("change", (e) => {
  importFile(e.target.files?.[0]);
  e.target.value = "";
});
for (const id of ["fileButton", "importEmptyBtn"])
  $(id).addEventListener("click", () => $("fileInput").click());
$("addBoxBtn").addEventListener("click", addPrimitive);
$("addPrimitiveBottom").addEventListener("click", addPrimitive);
$("focusBtn").addEventListener("click", () => focus());
$("groundBtn").addEventListener("click", groundSelected);
$("resetTransformBtn").addEventListener("click", resetTransform);
$("transformResetSmall").addEventListener("click", resetTransform);
$("colliderToggle").addEventListener("click", (e) => {
  collidersVisible = !collidersVisible;
  e.currentTarget.classList.toggle("on", collidersVisible);
  for (const o of objects) refreshCollider(o);
});
$("showColliderBtn").addEventListener("click", () =>
  $("colliderToggle").click(),
);
$("testBtn").addEventListener("click", () =>
  testMode ? resetTest() : startTest(),
);
$("resetTestBanner").addEventListener("click", resetTest);
$("uniformScale").addEventListener("click", () => {
  if (!selected) return;
  const n = selected.root.scale.x;
  selected.root.scale.setScalar(n);
  syncInspector();
});
$("helpBtn").addEventListener("click", () => ($("helpDialog").hidden = false));
$("closeHelp").addEventListener("click", () => ($("helpDialog").hidden = true));
$("helpDialog").addEventListener("click", (e) => {
  if (e.target === $("helpDialog")) $("helpDialog").hidden = true;
});
$("exportBtn").addEventListener("click", () =>
  notify("Scene export is planned for a later prototype."),
);
viewport.addEventListener("dragenter", (e) => {
  e.preventDefault();
  $("dropOverlay").classList.add("show");
});
viewport.addEventListener("dragover", (e) => e.preventDefault());
viewport.addEventListener("dragleave", (e) => {
  if (!viewport.contains(e.relatedTarget))
    $("dropOverlay").classList.remove("show");
});
viewport.addEventListener("drop", (e) => {
  e.preventDefault();
  $("dropOverlay").classList.remove("show");
  importFile(e.dataTransfer.files?.[0]);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && testMode) resetTest();
  if (e.key.toLowerCase() === "f" && selected) focus();
});
if (import.meta.env.DEV)
  window.agcDebug = {
    get objects() {
      return objects;
    },
    get testMode() {
      return testMode;
    },
    get selected() {
      return selected;
    },
    get dragging() {
      return dragging;
    },
    addPrimitive,
    importFile,
    resetTest,
    renderer,
    world,
    camera,
    THREE,
    localBoundsFor,
    pick(x, y) {
      const r = canvas.getBoundingClientRect();
      pointer.set(
        ((x - r.left) / r.width) * 2 - 1,
        -((y - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster
        .intersectObjects(
          objects.map((o) => o.root),
          true,
        )
        .map((h) => ({
          name: h.object.parent?.name || h.object.name,
          distance: h.distance,
          point: h.point.toArray(),
        }));
    },
  };
