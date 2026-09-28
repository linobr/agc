import { test, expect } from "@playwright/test";
import path from "node:path";
const palm = "/tmp/agc-private-test/Scaniverse 2026-09-26 133931.glb";
test("import scan, edit transform and verify collider alignment", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /bring a scan/i }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/agc-start.png" });
  await page.locator("#fileInput").setInputFiles(palm);
  await expect(page.locator("#emptyState")).toBeHidden({ timeout: 60000 });
  await expect(page.locator("#meshStats")).toContainText("meshes");
  await expect(page.locator("#collisionDimensions")).not.toHaveText(
    "No collider yet",
  );
  await expect(page.locator("#objectName")).toHaveValue(
    "Scaniverse 2026-09-26 133931",
  );
  await page.locator('[data-vector="rotation"][data-axis="y"]').fill("32");
  await page.locator('[data-vector="rotation"][data-axis="y"]').press("Tab");
  await page.locator('[data-vector="scale"][data-axis="x"]').fill("1.4");
  await page.locator('[data-vector="scale"][data-axis="x"]').press("Tab");
  await page.locator("#colliderToggle").click();
  await expect(page.locator("#colliderToggle")).toHaveClass(/on/);
  await page.screenshot({ path: "artifacts/agc-scan-collider.png" });
  // Object bounds and visible collision helper must agree after editing transforms.
  const alignment = await page.evaluate(() => {
    const e = window.agcDebug.selected,
      t = new window.agcDebug.THREE.Vector3(),
      q = new window.agcDebug.THREE.Quaternion();
    e.root.getWorldScale(t);
    e.root.getWorldQuaternion(q);
    const expected = e.localCollider.size.clone().multiply(t);
    return {
      overlayPos: e.overlay.position.toArray(),
      meshCenter: e.root.localToWorld(e.localCollider.center.clone()).toArray(),
      overlayScale: e.overlay.scale.toArray(),
      expected: expected.toArray(),
      angle: e.overlay.quaternion.angleTo(q),
    };
  });
  for (let i = 0; i < 3; i++) {
    expect(alignment.overlayPos[i]).toBeCloseTo(alignment.meshCenter[i], 3);
    expect(alignment.overlayScale[i]).toBeCloseTo(alignment.expected[i], 3);
  }
  expect(alignment.angle).toBeLessThan(0.001);
  expect(await page.locator("#objectCount").textContent()).toBe("1");
  await page.screenshot({ path: "artifacts/agc-scan-collider.png" });
  expect(errors).toEqual([]);
});
test("generated physics body falls, can be grabbed and dropped, and reset restores edited start", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#addBoxBtn").click();
  await page.locator('[data-vector="position"][data-axis="x"]').fill("3");
  await page.locator('[data-vector="position"][data-axis="x"]').press("Tab");
  await page.locator('[data-vector="position"][data-axis="y"]').fill("3");
  await page.locator('[data-vector="position"][data-axis="y"]').press("Tab");
  await page.locator('[data-body="dynamic"]').click();
  await page.locator("#focusBtn").click();
  await page.locator("#colliderToggle").click();
  await page.locator("#testBtn").click();
  await expect(page.locator("#testBanner")).toBeVisible();
  const y0 = await page.evaluate(
    () => window.agcDebug.objects.at(-1).body.position.y,
  );
  await page.waitForTimeout(1400);
  const y1 = await page.evaluate(
    () => window.agcDebug.objects.at(-1).body.position.y,
  );
  expect(y1).toBeLessThan(y0 - 0.04);
  await page.locator("#focusBtn").click();
  await page.screenshot({ path: "artifacts/agc-physics.png" });
  const p = await page.evaluate(() => {
    const e = window.agcDebug.objects.at(-1);
    const v = e.root.position.clone().project(window.agcDebug.camera);
    const r = document.querySelector("#sceneCanvas").getBoundingClientRect();
    return {
      x: r.left + ((v.x + 1) * r.width) / 2,
      y: r.top + ((1 - v.y) * r.height) / 2,
    };
  });
  const before = await page.evaluate(
    () => window.agcDebug.objects.at(-1).body.position.x,
  );
  expect(p.y).toBeLessThan(820);
  const hit = await page.evaluate(({ x, y }) => window.agcDebug.pick(x, y), p);
  expect(hit.length).toBeGreaterThan(0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 80, p.y, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => !!window.agcDebug.dragging)).toBe(false);
  await page.waitForTimeout(120);
  const after = await page.evaluate(
    () => window.agcDebug.objects.at(-1).body.position.x,
  );
  expect(Math.abs(after - before)).toBeGreaterThan(0.2);
  await page.locator("#resetTestBanner").click();
  await expect(page.locator("#testBanner")).toBeHidden();
  const reset = await page.evaluate(() =>
    window.agcDebug.objects.at(-1).root.position.toArray(),
  );
  expect(reset[0]).toBeCloseTo(3, 1);
  expect(reset[1]).toBeCloseTo(3, 1);
  await page.screenshot({ path: "artifacts/agc-reset.png" });
  expect(errors).toEqual([]);
});
test("repeated GLB import replaces the prior scan and malformed file reports a clear error", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles(palm);
  await expect(page.locator("#objectCount")).toHaveText("1", {
    timeout: 60000,
  });
  await page.waitForTimeout(150);
  const first = await page.evaluate(() => ({
    ...window.agcDebug.renderer.info.memory,
  }));
  await page.locator("#fileInput").setInputFiles(palm);
  await expect(page.locator("#objectCount")).toHaveText("1", {
    timeout: 60000,
  });
  await page.waitForTimeout(150);
  const second = await page.evaluate(() => ({
    ...window.agcDebug.renderer.info.memory,
  }));
  expect(second.geometries).toBe(first.geometries);
  expect(second.textures).toBe(first.textures);
  await page
    .locator("#fileInput")
    .setInputFiles({
      name: "bad.glb",
      mimeType: "model/gltf-binary",
      buffer: Buffer.from("not glb"),
    });
  await expect(page.locator("#toast")).toContainText("decode failed", {
    timeout: 15000,
  });
  await expect(page.locator("#objectCount")).toHaveText("1");
});
