import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { scanFile } from "./fixture.js";

async function exportProject(page) {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save Project" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("scene.agc");
  const savedPath = test.info().outputPath("scene.agc");
  await download.saveAs(savedPath);
  return JSON.parse(await readFile(savedPath, "utf8"));
}
async function openProject(page, project) {
  await page.locator("#projectInput").setInputFiles({
    name: "scene.agc", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
}
async function edit(page, vector, axis, value) {
  const input = page.locator(`[data-vector="${vector}"][data-axis="${axis}"]`);
  await input.fill(String(value));
  await input.press("Tab");
}

test("export and reopen a complete editor scene with scan, transforms, colliders and reset state", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles(scanFile());
  await expect(page.locator("#objectCount")).toHaveText("1");
  await page.locator("#objectName").fill("My scan");
  await page.locator("#objectName").press("Tab");
  for (const [vector, values] of Object.entries({ position: [2, 4, -1], rotation: [15, 32, -20], scale: [1.4, 0.8, 2] }))
    for (const [index, axis] of ["x", "y", "z"].entries()) await edit(page, vector, axis, values[index]);
  await page.locator("#colliderShape").selectOption("compound");
  await page.locator('[data-body="dynamic"]').click();
  await page.locator("#colliderToggle").click();
  await page.locator("#addBoxBtn").click();
  await edit(page, "position", "x", -3);
  await page.locator(".object-chip").first().click();
  await page.locator('[data-tool="rotate"]').click();
  const saved = await exportProject(page);
  expect(saved.format).toBe("agc-project");
  expect(saved.version).toBe(2);
  expect(saved.objects).toHaveLength(2);
  expect(saved.objects[0].source).toEqual({ fileName: "generated-scan.glb", byteLength: scanFile().buffer.length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(JSON.stringify(saved)).not.toMatch(/(?:\/home\/|C:\\|blob:|data:)/);
  await expect(page.locator("#projectStatus")).toContainText("Keep the original GLB");
  await page.reload();
  await openProject(page, saved);
  await expect(page.locator("#chooseProjectScan")).toBeVisible();
  await expect(page.locator("#projectStatus")).toContainText("scan is not embedded");
  await page.locator("#projectScanInput").setInputFiles(scanFile());
  await expect(page.locator("#projectStatus")).toContainText("Project opened");
  await expect(page.locator("#objectName")).toHaveValue("My scan");
  await expect(page.locator("#colliderShape")).toHaveValue("compound");
  await expect(page.locator('[data-body="dynamic"]')).toHaveClass(/selected/);
  await expect(page.locator("#colliderToggle")).toHaveClass(/on/);
  for (const [vector, values] of Object.entries({ position: [2, 4, -1], rotation: [15, 32, -20], scale: [1.4, 0.8, 2] }))
    for (const [index, axis] of ["x", "y", "z"].entries())
      await expect(page.locator(`[data-vector="${vector}"][data-axis="${axis}"]`)).toHaveValue(String(values[index]));
  const reopened = await exportProject(page);
  expect(reopened.objects).toEqual(saved.objects);
  expect(reopened.editor.selectedId).toBe(saved.editor.selectedId);
  expect(reopened.editor.tool).toBe("rotate");
  for (const key of ["position", "target"])
    reopened.editor.camera[key].forEach((n, i) => expect(n).toBeCloseTo(saved.editor.camera[key][i], 6));
  const overlay = await page.evaluate(() => {
    const e = window.agcDebug.selected;
    return { actual: e.overlay.position.toArray(), expected: e.root.localToWorld(e.localCollider.center.clone()).toArray(), visible: e.overlay.visible };
  });
  expect(overlay.actual).toEqual(overlay.expected);
  expect(overlay.visible).toBe(true);
  await page.locator("#testBtn").click();
  expect(await page.evaluate(() => window.agcDebug.selected.body.shapes.length)).toBe(3);
  await page.waitForTimeout(250);
  const duringPhysics = await exportProject(page);
  expect(duringPhysics.objects[0].transform).toEqual(saved.objects[0].transform);
  await page.locator("#resetTestBanner").click();
  await expect(page.locator('[data-vector="position"][data-axis="y"]')).toHaveValue("4");
  // Reload to check the original transform reset independently of the physics snapshot.
  await openProject(page, saved);
  await page.locator("#projectScanInput").setInputFiles(scanFile());
  await expect(page.locator("#projectStatus")).toContainText("Project opened");
  await page.locator("#resetTransformBtn").click();
  const reset = await exportProject(page);
  expect(reset.objects[0].transform).toEqual(saved.objects[0].initial);
  expect(errors).toEqual([]);
});

test("primitive and empty projects open without a scan; malformed projects preserve current scene", async ({ page }) => {
  await page.goto("/");
  const empty = await exportProject(page);
  await page.locator("#addBoxBtn").click();
  await edit(page, "position", "y", 3);
  const original = await exportProject(page);
  const invalid = [
    ["not json", "not valid JSON"],
    [JSON.stringify({ ...original, version: 99 }), "Unsupported AGC project version"],
    [JSON.stringify({ ...original, objects: [{}] }), "object IDs"],
    [JSON.stringify({ ...original, editor: { ...original.editor, selectedId: "missing" } }), "selected object"],
    [JSON.stringify({ ...original, objects: [{ ...original.objects[0], transform: { ...original.objects[0].transform, scale: [0, 1, 1] } }] }), "scale"],
    [JSON.stringify({ ...original, objects: [{ ...original.objects[0], collider: "mesh" }] }), "collider shape"],
  ];
  for (const [text, error] of invalid) {
    await page.locator("#projectInput").setInputFiles({ name: "bad.agc", mimeType: "application/json", buffer: Buffer.from(text) });
    await expect(page.locator("#projectStatus")).toContainText(error);
    expect((await exportProject(page)).objects).toEqual(original.objects);
  }
  await openProject(page, empty);
  await expect(page.locator("#objectCount")).toHaveText("0");
  await openProject(page, original);
  await expect(page.locator("#objectCount")).toHaveText("1");
  await expect(page.locator("#chooseProjectScan")).toBeHidden();
  expect((await exportProject(page)).objects).toEqual(original.objects);
});

test("wrong, modified or corrupt scans leave existing scene intact; opening can be cancelled", async ({ page }) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles(scanFile());
  await expect(page.locator("#objectCount")).toHaveText("1");
  const saved = await exportProject(page);
  await page.reload();
  await page.locator("#addBoxBtn").click();
  await openProject(page, saved);
  await page.locator("#projectScanInput").setInputFiles({ ...scanFile(), name: "wrong.glb" });
  await expect(page.locator("#projectStatus")).toContainText("Choose generated-scan.glb");
  const changed = scanFile();
  changed.buffer[changed.buffer.length - 1] ^= 1;
  await page.locator("#projectScanInput").setInputFiles(changed);
  await expect(page.locator("#projectStatus")).toContainText("checksum does not match");
  await expect(page.locator("#objectName")).toHaveValue("Test box 1");
  await page.locator("#cancelProject").click();
  await expect(page.locator("#chooseProjectScan")).toBeHidden();
  const corrupt = structuredClone(saved);
  corrupt.objects[0].source.sha256 = null;
  await openProject(page, corrupt);
  await page.locator("#projectScanInput").setInputFiles({ ...scanFile(), buffer: Buffer.alloc(scanFile().buffer.length) });
  await expect(page.locator("#projectStatus")).toContainText("complete binary GLB");
  await expect(page.locator("#objectName")).toHaveValue("Test box 1");
  await page.locator("#projectScanInput").setInputFiles(scanFile());
  await expect(page.locator("#projectStatus")).toContainText("Project opened");
  await expect(page.locator("#objectName")).toHaveValue("generated-scan");
});

test("metadata-only projects remain usable without Web Crypto and show the verification limit", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, "subtle", { value: undefined }));
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles(scanFile());
  await expect(page.locator("#objectCount")).toHaveText("1");
  const saved = await exportProject(page);
  expect(saved.objects[0].source.sha256).toBeNull();
  await openProject(page, saved);
  await expect(page.locator("#projectStatus")).toContainText("has no checksum");
  await page.locator("#projectScanInput").setInputFiles(scanFile());
  await expect(page.locator("#projectStatus")).toContainText("Project opened");
  saved.objects[0].source.sha256 = "a".repeat(64);
  await openProject(page, saved);
  await page.locator("#projectScanInput").setInputFiles(scanFile());
  await expect(page.locator("#projectStatus")).toContainText("requires HTTPS or localhost");
});

test("oversized settings and invalid transformed geometry are rejected before replacing the scene", async ({ page }) => {
  await page.goto("/");
  await page.locator("#addBoxBtn").click();
  const saved = await exportProject(page);
  await page.locator("#projectInput").setInputFiles({ name: "large.agc", mimeType: "application/json", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.locator("#projectStatus")).toContainText("2 MB");
  const oversized = structuredClone(saved);
  oversized.objects[0].transform.scale = [10000, 10000, 10000];
  oversized.objects[0].transform.quaternion = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
  await openProject(page, oversized);
  await expect(page.locator("#projectStatus")).toContainText("dimensions are invalid");
  expect((await exportProject(page)).objects).toEqual(saved.objects);
});
