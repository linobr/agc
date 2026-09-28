import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { analyzeWalk, WalkPlayer } from '../src/walk.js';
import { floorMesh, scanEntries, stepScene, benchmarkScene } from './walk-fixtures.js';
import { roomFile } from './fixture.js';
import { readFile } from 'node:fs/promises';

test('separate islands and stacked floors form regions; largest usable region wins', () => {
  const d=analyzeWalk(scanEntries(floorMesh(2,2,12),floorMesh(8,8),floorMesh(2,2,0,3)));
  expect(d.regions).toHaveLength(3);
  expect(d.activeRegion.area).toBeCloseTo(64);
  expect(d.activeRegion.triangleCount).toBe(2);
  expect(d.activeRegion.center.toArray()).toEqual([0,0,0]);
  expect(d.activeRegion.minHeight).toBeCloseTo(0);
  expect(d.activeRegion.maxHeight).toBeCloseTo(0);
  expect(d.validateSpawn(d.spawn).valid).toBe(true);
  expect(d.spawn.x).toBeLessThan(4);
});

test('tiny tessellation stays connected; near seams join; duplicates and isolated fragments filter', () => {
  const floor=floorMesh(8,8,0,0,0,80,80);
  floor.geometry.attributes.normal.array.fill(0); // Imported shading normals are irrelevant.
  const d=analyzeWalk(scanEntries(floor,floorMesh(.1,.1,10)));
  expect(d.candidates).toHaveLength(12800);
  expect(d.regions).toHaveLength(1);
  expect(d.filteredRegions).toBe(1);
  const duplicate=floorMesh(8,8); duplicate.position.y=.0001;
  const dd=analyzeWalk(scanEntries(floorMesh(8,8),duplicate));
  expect(dd.duplicates).toBe(2); expect(dd.regions[0].area).toBeCloseTo(64);
  const seam=analyzeWalk(scanEntries(floorMesh(4,4,-2.005),floorMesh(4,4,2.005)));
  expect(seam.regions).toHaveLength(1);
  const gap=analyzeWalk(scanEntries(floorMesh(4,4,-2.05),floorMesh(4,4,2.05)));
  expect(gap.regions).toHaveLength(2);
});

test('slope limit excludes steep floor but preserves collision triangles', () => {
  const ramp=floorMesh(); ramp.rotation.z=Math.PI/3;
  // Apply world-space tilt to the geometry (Euler X/Z alone does not give this slope).
  ramp.rotation.set(0,0,0); ramp.geometry.rotateX(-Math.PI/2).rotateZ(Math.PI/3);
  const d=analyzeWalk(scanEntries(ramp),{slope:40});
  expect(d.candidates).toHaveLength(0); expect(d.triangles).toHaveLength(2);
  expect(d.spawn).toBeNull();
});

test('bounded step lift climbs a low threshold; tall obstacles and disabled steps block', () => {
  for (const [height,stepHeight,passes] of [[.15,.2,true],[.35,.2,false],[.15,0,false]]) {
    const data=analyzeWalk(stepScene(height),{stepHeight}); data.spawn=new THREE.Vector3(-2,.04,0);
    const p=new WalkPlayer(data); for(let i=0;i<120;i++) p.step(1/120);
    let maxRise=0;
    for(let i=0;i<180;i++) { const y=p.position.y; p.step(1/120,1,0); maxRise=Math.max(maxRise,p.position.y-y); }
    expect(p.grounded).toBe(true);
    if (passes) { expect(p.position.x).toBeGreaterThan(1); expect(p.position.y).toBeCloseTo(height,2); }
    else { expect(p.position.x).toBeLessThan(-.25); expect(p.position.y).toBeCloseTo(0,2); }
    expect(maxRise).toBeLessThanOrEqual(1.5/120+.0001);
  }
});

test('step-up refuses low headroom and cannot ascend while airborne', () => {
  const entries=stepScene(.15);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(4,.1,6)); roof.position.set(0,1.85,0); entries[0].root.add(roof);
  const data=analyzeWalk(entries,{stepHeight:.2}); data.spawn=new THREE.Vector3(-2,0.001,0);
  const p=new WalkPlayer(data); p.position.copy(data.spawn); p.velocity.set(0,0,0);
  for(let i=0;i<200;i++) p.step(1/120,1,0);
  expect(p.position.x).toBeLessThan(0);
  expect(p.position.y).toBeLessThan(.05);
  expect(p.climb).toBeNull();
  const airData=analyzeWalk(stepScene(.15)); airData.spawn=new THREE.Vector3(-.38,.4,0);
  const airborne=new WalkPlayer(airData); airborne.position.copy(airData.spawn);
  airborne.step(1/120,1,0); expect(airborne.climb).toBeNull();
});

test('10k, 50k and 100k synthetic triangles retain one region with measured bounded structures', () => {
  test.setTimeout(120000);
  for(const count of [10000,50000,100000]) {
    const d=analyzeWalk(benchmarkScene(count));
    expect(d.triangles).toHaveLength(count); expect(d.regions).toHaveLength(1);
    expect(d.references).toBeLessThanOrEqual(500000);
    for(const ms of Object.values(d.timings)) expect(Number.isFinite(ms) && ms>=0).toBe(true);
    console.log(JSON.stringify({triangles:count,...d.timings,references:d.references}));
  }
});

async function save(page) {
  const downloading=page.waitForEvent('download'); await page.locator('#exportBtn').click();
  const download=await downloading; const path=test.info().outputPath('walk.agc'); await download.saveAs(path);
  return JSON.parse(await readFile(path,'utf8'));
}
async function open(page,p) {
  await page.locator('#projectInput').setInputFiles({name:'walk.agc',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await page.locator('#projectScanInput').setInputFiles(roomFile());
  await expect(page.locator('#projectStatus')).toContainText('Project opened');
}
async function spawn(page,x,y,z) {
  for(const [id,n] of [['spawnX',x],['spawnY',y],['spawnZ',z]]) { await page.locator(`#${id}`).fill(String(n)); await page.locator(`#${id}`).press('Tab'); }
}

test('manual spawn is used and invalid spawn blocks; v2 persists settings and v1 migrates', async ({page}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await page.locator('#fileInput').setInputFiles(roomFile());
  await expect(page.locator('#walkRegions')).toContainText('Regions: 1');
  await page.locator('#walkSlope').fill('35'); await page.locator('#walkSlope').press('Tab');
  await page.locator('#walkStep').fill('0.3'); await page.locator('#walkStep').press('Tab');
  await spawn(page,-3,.04,-2);
  await expect(page.locator('#spawnStatus')).toContainText('Manual: Spawn valid');
  const saved=await save(page);
  expect(saved.version).toBe(3);
  expect(saved.walk).toMatchObject({slope:35,stepHeight:.3,spawnMode:'manual',spawn:[-3,.04,-2]});
  await page.locator('#walkBtn').click();
  await expect(page.locator('#walkTelemetry')).toContainText('grounded');
  expect(await page.evaluate(()=>window.agcDebug.walk.player.position.x)).toBeCloseTo(-3);
  const during=await save(page); expect(during.walk).toEqual(saved.walk); expect(during.editor.camera).toEqual(saved.editor.camera);
  await page.locator('#walkBtn').click();
  await page.reload(); await open(page,saved);
  expect((await save(page)).walk).toEqual(saved.walk);
  await expect(page.locator('#walkStep')).toHaveValue('0.3');
  await spawn(page,0,.04,0); // wall center
  await expect(page.locator('#spawnStatus')).toContainText('cannot start');
  await page.locator('#walkBtn').click(); await expect(page.locator('#sceneStatus')).toHaveText('EDITOR MODE');
  await spawn(page,100,.04,100); // no floor
  await page.locator('#walkBtn').click(); await expect(page.locator('#sceneStatus')).toHaveText('EDITOR MODE');
  await page.locator('#spawnAuto').click(); await expect(page.locator('#spawnStatus')).toContainText('Auto: Spawn valid');
  await page.locator('#walkBtn').click(); await expect(page.locator('#sceneStatus')).toHaveText('WALK TEST');
  await page.locator('#walkBtn').click();
  const legacy={...saved,version:1}; delete legacy.walk;
  await open(page,legacy);
  const migrated=await save(page);
  expect(migrated.version).toBe(3); expect(migrated.walk).toMatchObject({slope:40,stepHeight:.2,minArea:.1,spawnMode:'auto'});
  expect(migrated.objects).toEqual(saved.objects);
  expect(errors).toEqual([]);
});

test('walkable ramp can be ascended; steep ramp remains a blocking collider', () => {
  for(const height of [1.5,5]) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-3,0,0,3,3,height,3,0,0,-3,3,height,3,3,height,-3],3));
    const data=analyzeWalk(scanEntries(floorMesh(6,6,-3),new THREE.Mesh(geometry)));
    data.spawn=new THREE.Vector3(-2,.04,0); const p=new WalkPlayer(data);
    for(let i=0;i<120;i++) p.step(1/120);
    for(let i=0;i<180;i++) p.step(1/120,1,0);
    if(height===1.5) { expect(p.position.x).toBeGreaterThan(2); expect(p.position.y).toBeGreaterThan(1); }
    else { expect(p.position.x).toBeLessThan(0); expect(p.position.y).toBeLessThan(.02); }
  }
  const ramp=floorMesh(); ramp.rotation.set(0,0,0); ramp.geometry.rotateX(-Math.PI/2).rotateZ(39*Math.PI/180);
  const data=analyzeWalk(scanEntries(ramp));
  expect(data.spawn).not.toBeNull(); expect(data.validateSpawn(data.spawn).valid).toBe(true);
});

test('v2 rejects malformed walk state instead of losing the current project', async () => {
  const { parseProject }=await import('../src/project.js');
  const base={format:'agc-project',version:1,objects:[],editor:{selectedId:null,tool:'select',collidersVisible:false,camera:{position:[5,4,7],target:[0,1,0],near:.02,far:500}}};
  const migrated=parseProject(JSON.stringify(base));
  expect(migrated.version).toBe(3);
  for(const invalid of [{stepHeight:-.1},{stepHeight:.5},{slope:70},{spawnMode:'manual',spawn:null},{spawn:[1,2]},{minArea:-1}]) {
    expect(()=>parseProject(JSON.stringify({...migrated,walk:{...migrated.walk,...invalid}}))).toThrow('Invalid AGC project');
  }
});


test('Place Spawn mode picks a surface without editing the scan and Escape exits the mode', async ({page}) => {
  await page.goto('/'); await page.locator('#fileInput').setInputFiles(roomFile());
  await expect(page.locator('#walkStatus')).toContainText('Spawn found');
  await page.locator('#spawnPlace').click(); await expect(page.locator('#spawnPlace')).toHaveAttribute('aria-pressed','true');
  const point=await page.evaluate(()=>{
    // Import/focus changes the camera before the next (potentially slow) GPU frame.
    // Project from its current world matrix, not the preceding render's inverse.
    window.agcDebug.camera.updateMatrixWorld(true);
    const v=new window.agcDebug.THREE.Vector3(3,0,3).project(window.agcDebug.camera);
    const rect=document.querySelector('#sceneCanvas').getBoundingClientRect();
    return {x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2};
  });
  await page.mouse.click(point.x,point.y);
  await expect(page.locator('#spawnStatus')).toContainText('Manual: Spawn valid');
  expect(Number(await page.locator('#spawnX').inputValue())).toBeCloseTo(3,1);
  expect(Number(await page.locator('#spawnZ').inputValue())).toBeCloseTo(3,1);
  await page.locator('#spawnPlace').click(); await page.keyboard.press('Escape');
  await expect(page.locator('#spawnPlace')).toHaveAttribute('aria-pressed','false');
});
