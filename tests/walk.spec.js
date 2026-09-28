import { test, expect } from '@playwright/test';
import { roomFile, scanFile } from './fixture.js';

test('scan walk: supported spawn, gravity, movement, wall, respawn and editor', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles(roomFile());
  await expect(page.locator('#walkStatus')).toContainText('2 walkable candidates');
  await expect(page.locator('#walkStatus')).toContainText('Spawn found');
  await page.locator('#walkSurfaces').check();
  await page.locator('#walkColliders').check();
  await page.locator('#walkBtn').click();
  await expect(page.locator('#sceneStatus')).toHaveText('WALK TEST');
  await expect(page.locator('#walkTelemetry')).toContainText('grounded');
  const start=await page.evaluate(()=>window.agcDebug.walk.player.position.toArray());
  expect(start[1]).toBeCloseTo(0,2); // import normalization grounds the scan, not an artificial plane
  await page.keyboard.down('d');
  await expect.poll(async()=>page.evaluate(()=>window.agcDebug.walk.player.position.x)).toBeGreaterThan(start[0]+0.5);
  await expect.poll(async()=>page.evaluate(()=>window.agcDebug.walk.player.position.x), {timeout:30000}).toBeGreaterThan(-0.4);
  // Deterministic sustained pressure uses the same controller step as production.
  await page.evaluate(()=>{ for(let i=0;i<600;i++) window.agcDebug.walk.player.step(1/120,1,0); });
  await page.keyboard.up('d');
  const blocked=await page.evaluate(()=>window.agcDebug.walk.player.position.toArray());
  expect(blocked[0]).toBeLessThan(-0.28);
  expect(blocked[0]).toBeGreaterThan(-0.4);
  expect(blocked[1]).toBeCloseTo(start[1],2);
  await page.locator('#walkRespawn').click();
  await expect(page.locator('#walkTelemetry')).toContainText('grounded');
  const reset=await page.evaluate(()=>window.agcDebug.walk.player.position.toArray());
  expect(reset[0]).toBeCloseTo(start[0],2);
  await page.screenshot({path:test.info().outputPath('walk.png')});
  await page.keyboard.press('Escape');
  await expect(page.locator('#sceneStatus')).toHaveText('EDITOR MODE');
  const y=page.locator('[data-vector="position"][data-axis="y"]');
  await y.fill('4'); await y.press('Tab');
  await expect(page.locator('#walkStatus')).toContainText('Scene changed');
  await page.locator('#walkBtn').click();
  await expect(page.locator('#sceneStatus')).toHaveText('EDITOR MODE');
  await page.locator('#walkRebuild').click();
  await page.locator('#walkBtn').click();
  await expect(page.locator('#walkTelemetry')).toContainText('grounded');
  expect(await page.evaluate(()=>window.agcDebug.walk.player.position.y)).toBeCloseTo(6,2);
  await page.locator('#walkBtn').click();
  await page.locator('#addBoxBtn').click();
  await expect(page.locator('#objectCount')).toHaveText('2');
  expect(errors).toEqual([]);
});

test('no support or headroom refuses walk without breaking editor; thresholds invalidate analysis', async ({page})=>{
  await page.goto('/');
  await page.locator('#walkBtn').click();
  await expect(page.locator('#sceneStatus')).toHaveText('EDITOR MODE');
  await page.locator('#fileInput').setInputFiles(scanFile([-2,0,0,2,0,0,2,3,0],[0,1,2]));
  await expect(page.locator('#walkStatus')).toContainText('No safe spawn');
  await page.locator('#walkBtn').click();
  await expect(page.locator('#sceneStatus')).toHaveText('EDITOR MODE');
  await page.locator('#fileInput').setInputFiles(roomFile());
  await page.locator('#walkSlope').fill('80'); await page.locator('#walkSlope').press('Tab');
  await page.locator('#walkRebuild').click();
  await expect(page.locator('#walkStatus')).toContainText('Use slope 0–50');
});

test('analysis rejects unsafe headroom and complexity; slopes and area are configurable', async () => {
  const THREE = await import('three');
  const { analyzeWalk } = await import('../src/walk.js');
  const root = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8,8));
  floor.rotation.x=-Math.PI/2; root.add(floor);
  const ceiling=floor.clone(); ceiling.position.y=1; ceiling.rotation.x=Math.PI/2; root.add(ceiling);
  const entries=[{root,kind:'model'}];
  expect(analyzeWalk(entries).spawn).toBeNull();
  root.remove(ceiling);
  expect(analyzeWalk(entries).spawn).not.toBeNull();
  floor.rotation.x=-Math.PI/2+Math.PI/6;
  expect(analyzeWalk(entries,{slope:20}).candidates).toHaveLength(0);
  expect(analyzeWalk(entries,{slope:40}).candidates).toHaveLength(2);
  expect(analyzeWalk(entries,{minArea:100}).candidates).toHaveLength(0);
  floor.geometry=new THREE.PlaneGeometry(8,8,225,225);
  expect(()=>analyzeWalk(entries)).toThrow('100,000 triangles');
});
