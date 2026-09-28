import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {analyzeScan,deriveScan,DEFAULT_CLEANUP,activateScan} from '../src/scan-cleanup.js';
import {optimizeVisual,buildCollisionProxy,proxyForEntry} from '../src/scan-optimize.js';
import {analyzeWalk,WalkPlayer} from '../src/walk.js';
import {parseProject} from '../src/project.js';
import {scanFile} from './fixture.js';
import {readFile} from 'node:fs/promises';
function dense() {
  const root=new THREE.Group(),g=new THREE.PlaneGeometry(8,8,80,80);g.rotateX(-Math.PI/2);
  root.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial()));return root;
}
const config=()=>structuredClone(DEFAULT_CLEANUP);
test('Optimized reduces Cleaned triangles and preserves original attributes and material groups',async()=>{
  const root=dense(),source=root.children[0].geometry,bytes=Array.from(source.attributes.position.array),uv=Array.from(source.attributes.uv.array);
  const a=await analyzeScan(root),c=config();c.auto=true;c.mode='cleaned';
  const d=await deriveScan(a,c),o=await optimizeVisual(a,d,{target:500,error:.001});
  expect(o.triangles).toBeLessThan(d.triangles);expect(o.triangles).toBeGreaterThan(0);expect(o.error).toBeLessThanOrEqual(.001);
  activateScan(a,d,'optimized',o);expect(root.children[0].geometry).toBe(o.geometries[0]);
  activateScan(a,d,'original',o);expect(root.children[0].geometry).toBe(source);
  expect(Array.from(source.attributes.position.array)).toEqual(bytes);expect(Array.from(source.attributes.uv.array)).toEqual(uv);
  expect(d.triangles).toBe(12800);
});
test('Collision Proxy is smaller, separate, valid for WalkPlayer and rejects excessive scaled error',async()=>{
  const root=dense(),a=await analyzeScan(root),c=config();c.proxy.target=500;
  const proxy=await buildCollisionProxy(a,null,c.proxy);expect(proxy.triangles).toBeLessThan(a.triangles);
  const entry={root,kind:'model',scan:{cleanup:c,proxies:{original:proxy}}};
  const data=analyzeWalk([entry]);expect(data.triangles.length).toBe(proxy.triangles);expect(data.autoSpawn).not.toBeNull();
  data.spawn=data.autoSpawn;const player=new WalkPlayer(data);for(let i=0;i<120;i++)player.step(1/120,0,0);expect(player.grounded).toBe(true);
  expect(root.children[0].geometry.index.count/3).toBe(12800);
  proxy.error=.01;root.scale.setScalar(4);expect(proxyForEntry(entry)).toBeNull();
});
test('successive Keep and Remove crops compose; collision contains only the remaining section',async()=>{
  const root=dense(),a=await analyzeScan(root),c=config();
  c.crop={operation:'keep',min:[-4,-1,-4],max:[3,1,4]};c.crops=[{operation:'remove',min:[-4,-1,-4],max:[0,1,4]}];c.mode='cleaned';c.proxy.target=100;
  const d=await deriveScan(a,c);expect(d.bounds.min[0]).toBeGreaterThanOrEqual(0);expect(d.bounds.max[0]).toBeLessThanOrEqual(3);
  const proxy=await buildCollisionProxy(a,d,c.proxy),entry={root,kind:'model',scan:{cleanup:c,proxies:{cleaned:proxy}}};
  activateScan(a,d,'cleaned');const w=analyzeWalk([entry]);expect(w.triangles.every(t=>[t.a,t.b,t.c].every(v=>v.x>=0 && v.x<=3))).toBe(true);
});
const base={format:'agc-project',version:1,objects:[],editor:{selectedId:null,tool:'select',collidersVisible:false,camera:{position:[5,4,7],target:[0,1,0],near:.02,far:500}}};
test('v1-v4 migrate to v5; invalid optimization and proxy parameters are rejected',()=>{
  for(const version of [1,2,3,4]) {
    const p={...parseProject(JSON.stringify(base)),version};const migrated=parseProject(JSON.stringify(p));expect(migrated.version).toBe(5);
  }
  const p=parseProject(JSON.stringify(base));p.objects=[{id:'scan',name:'scan',kind:'model',bodyType:'static',collider:'box',source:{fileName:'scan.glb',byteLength:100,sha256:null},transform:{position:[0,0,0],scale:[1,1,1],quaternion:[0,0,0,1]},initial:{position:[0,0,0],scale:[1,1,1],quaternion:[0,0,0,1]},cleanup:config()}];
  for(const patch of [{optimization:{target:0,error:.001}},{optimization:{target:100,error:1}},{proxy:{enabled:true,target:100,error:-1}},{crops:Array.from({length:32},()=>({operation:'keep',min:[0,0,0],max:[1,1,1]}))}]) {
    const q=structuredClone(p);Object.assign(q.objects[0].cleanup,patch);expect(()=>parseProject(JSON.stringify(q))).toThrow();
  }
  const v4=structuredClone(p);v4.version=4;v4.objects[0].cleanup.crop={operation:'remove',min:[0,0,0],max:[1,1,1]};delete v4.objects[0].cleanup.crops;delete v4.objects[0].cleanup.optimization;delete v4.objects[0].cleanup.proxy;
  const migrated=parseProject(JSON.stringify(v4));expect(migrated.objects[0].cleanup.crop.operation).toBe('remove');expect(migrated.objects[0].cleanup.crops).toEqual([]);
});
function denseFile() {
  const g=new THREE.PlaneGeometry(8,8,40,40);g.rotateX(-Math.PI/2);
  return scanFile(Array.from(g.attributes.position.array),Array.from(g.index.array));
}
async function save(page) {
  const event=page.waitForEvent('download');await page.locator('#exportBtn').click();const path=test.info().outputPath('optimized.agc');await(await event).saveAs(path);return JSON.parse(await readFile(path,'utf8'));
}
test('crop preview is transient, repeated crop + Undo restore exact recipes, v5 reopens optimized parameters and proxy',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#fileInput').setInputFiles(denseFile());await expect(page.locator('#scanPanel')).toBeVisible();
  await page.locator('#cropStart').click();await page.locator('#cropSize0').fill('6');await page.locator('#cropPreview').click();await expect(page.locator('#cleanupStatus')).toContainText('Preview only');
  expect((await save(page)).objects[0].cleanup.crop).toBeNull();expect(await page.evaluate(()=>agcDebug.objects[0].root.visible)).toBe(true);
  await page.locator('#cropKeep').click();await expect(page.locator('#cleanupStatus')).toContainText('Applied');const first=await save(page);
  await page.locator('#cropCenter0').fill('-2');await page.locator('#cropSize0').fill('2');await page.locator('#cropRemove').click();await expect(page.locator('#scanComparison')).toContainText('Crop steps: 2');
  const second=await save(page);expect(second.objects[0].cleanup.crops).toHaveLength(1);
  await page.locator('#cleanupUndo').click();await expect(page.locator('#scanComparison')).toContainText('Crop steps: 1');expect((await save(page)).objects[0].cleanup).toEqual(first.objects[0].cleanup);
  await page.locator('#scanPanel summary').click();await page.locator('#optimizationTarget').fill('500');await page.locator('#optimizeApply').click();await expect(page.locator('#scanMode')).toHaveValue('optimized');
  await page.locator('#proxyTarget').fill('500');await page.locator('#proxyApply').click();await expect(page.locator('#proxyStatus')).toContainText('Walk uses this proxy');
  await page.locator('#showProxy').check();await expect(page.locator('#walkStatus')).toContainText('Collision Proxy');
  const saved=await save(page);expect(saved.version).toBe(5);expect(saved.objects[0].cleanup.optimization.target).toBe(500);expect(saved.objects[0].cleanup.proxy.target).toBe(500);
  await page.reload();await page.locator('#projectInput').setInputFiles({name:'optimized.agc',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.locator('#projectScanInput').setInputFiles(denseFile());await expect(page.locator('#projectStatus')).toContainText('Project opened');
  expect((await save(page)).objects[0].cleanup).toEqual(saved.objects[0].cleanup);await expect(page.locator('#scanMode')).toHaveValue('optimized');
  await page.locator('#cleanupReset').click();await expect(page.locator('#scanMode')).toHaveValue('original');await expect(page.locator('#scanComparison')).toContainText('Crop steps: 0');
  expect(await page.evaluate(()=>agcDebug.objects[0].root.children[0].geometry.index.count/3)).toBe(3200);expect(errors).toEqual([]);
});
