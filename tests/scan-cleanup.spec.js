import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { analyzeScan, deriveScan, activateScan, groundOffset, DEFAULT_CLEANUP, SCAN_LIMIT } from '../src/scan-cleanup.js';
import { analyzeWalk } from '../src/walk.js';
import { parseProject } from '../src/project.js';
import { scanFile } from './fixture.js';
import { readFile } from 'node:fs/promises';
function fixture() {
  const root=new THREE.Group();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8,2,2),new THREE.MeshStandardMaterial());
  floor.rotation.x=-Math.PI/2; floor.position.set(3,2,4); root.add(floor);
  const island=new THREE.Mesh(new THREE.BoxGeometry(.02,.02,.02),floor.material); island.position.set(12,5,12); root.add(island);
  return root;
}
const clean=()=>({...structuredClone(DEFAULT_CLEANUP),auto:true,mode:'cleaned'});
test('analysis detects a tiny isolated mesh component and inflated bounds',async()=>{
  const a=await analyzeScan(fixture()); expect(a.components).toHaveLength(2); expect(a.tiny).toBe(1); expect(a.status).not.toBe('Good');
});
test('auto cleanup removes tiny island while preserving all main-component triangles',async()=>{
  const a=await analyzeScan(fixture()), d=await deriveScan(a,clean());
  expect(d.removedComponents).toBe(1); expect(d.triangles).toBe(8); expect(d.geometries[0].index.count).toBe(24); expect(d.geometries[1].attributes.position.count).toBe(0);
});
test('crop removes outside geometry and compacts bounds; empty crop is rejected',async()=>{
  const a=await analyzeScan(fixture());
  const d=await deriveScan(a,{...clean(),auto:false,crop:{operation:'keep',min:[-1,1,-1],max:[7,3,8]}});
  expect(d.triangles).toBe(8); expect(d.bounds.max[0]).toBe(7);
  await expect(deriveScan(a,{...clean(),crop:{operation:'keep',min:[100,100,100],max:[101,101,101]}})).rejects.toThrow('entire scan');
});
test('Original switch restores source identity and exact buffers after cleanup',async()=>{
  const root=fixture(),a=await analyzeScan(root),source=root.children[1].geometry,positions=Array.from(source.attributes.position.array);
  const d=await deriveScan(a,clean()); activateScan(a,d,'cleaned'); expect(root.children[1].geometry).not.toBe(source);
  activateScan(a,d,'original'); expect(root.children[1].geometry).toBe(source); expect(Array.from(source.attributes.position.array)).toEqual(positions);
});
test('normal repair produces finite unit normals without mutating original',async()=>{
  const root=fixture(); root.children[0].geometry.deleteAttribute('normal');
  const a=await analyzeScan(root),d=await deriveScan(a,clean()); expect(a.missingNormals).toBe(1);
  const n=d.geometries[0].attributes.normal;
  for(let i=0;i<n.count;i++) expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1);
  expect(root.children[0].geometry.attributes.normal).toBeUndefined();
});
test('auto ground and center account for root translation rotation and scale',async()=>{
  const root=fixture(); root.position.set(8,4,9); root.rotation.y=.7; root.scale.setScalar(2);
  const a=await analyzeScan(root),c=clean(),d=await deriveScan(a,c); c.offset=groundOffset(root,d.bounds);
  const grounded=await deriveScan(a,c); activateScan(a,grounded,'cleaned'); root.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(root), center=b.getCenter(new THREE.Vector3());
  expect(b.min.y).toBeCloseTo(0,5); expect(center.x).toBeCloseTo(0,5); expect(center.z).toBeCloseTo(0,5);
});
test('Cleaned walk collision and walk surfaces use only active geometry',async()=>{
  const root=fixture(),a=await analyzeScan(root),original=analyzeWalk([{root,kind:'model'}],{minArea:0});
  const d=await deriveScan(a,clean()); activateScan(a,d,'cleaned');
  const walk=analyzeWalk([{root,kind:'model'}],{minArea:0});
  expect(walk.triangles.length).toBe(8); expect(walk.triangles.length).toBeLessThan(original.triangles.length);
  expect(walk.candidates.every(t=>[t.a,t.b,t.c].every(v=>v.x<=7))).toBe(true);
});
test('position welding detects islands within one non-indexed mesh across normal seams',async()=>{
  const root=new THREE.Group(),main=new THREE.BoxGeometry(4,4,4).toNonIndexed(),small=new THREE.BoxGeometry(.01,.01,.01).toNonIndexed();small.translate(10,10,10);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...main.attributes.position.array,...small.attributes.position.array],3));root.add(new THREE.Mesh(g));
  const a=await analyzeScan(root);expect(a.components.length).toBe(2);expect(a.tiny).toBe(1);expect((await deriveScan(a,clean())).triangles).toBe(12);
});
const legacy={format:'agc-project',version:1,objects:[],editor:{selectedId:null,tool:'select',collidersVisible:false,camera:{position:[5,4,7],target:[0,1,0],near:.02,far:500}}};
test('v1 v2 v3 projects migrate to v4 and presentation values are validated',()=>{
  for(const version of [1,2,3]) {
    const p={...legacy,version,walk:{slope:40,stepHeight:.2,minArea:.1,spawnMode:'auto',spawn:null},gameplay:[]};
    const parsed=parseProject(JSON.stringify(p));expect(parsed.version).toBe(4);expect(parsed.presentation.lighting).toBe('studio');
  }
  const p=parseProject(JSON.stringify(legacy));p.presentation.exposure=10;expect(()=>parseProject(JSON.stringify(p))).toThrow('presentation');
});
test('save/open preserves cleanup, crop, mode and lighting; reset restores Original and colliders',async({page})=>{
  await page.goto('/'); await page.locator('#fileInput').setInputFiles(scanFile()); await expect(page.locator('#scanPanel')).toBeVisible();
  await page.locator('#addTrigger').click();
  await page.locator('#autoClean').click();await expect(page.locator('#cleanupStatus')).toContainText('Applied');
  await page.locator('#cropStart').click();await page.locator('#cropSize0').fill('0.8');
  await page.locator('#cropKeep').click();await expect(page.locator('#cleanupStatus')).toContainText('entire scan');
  // Box surfaces: removing a thin volume at the top removes the top and touching sides.
  await page.locator('#cropSize0').fill('2');await page.locator('#cropSize1').fill('0.1');await page.locator('#cropCenter1').fill('2');await page.locator('#cropSize2').fill('2');
  await page.locator('#cropRemove').click();await expect(page.locator('#cleanupStatus')).toContainText('Applied');
  await page.locator('#lightingMode').selectOption('neutral'); await page.locator('#backgroundMode').selectOption('dark');
  const download=page.waitForEvent('download');await page.locator('#exportBtn').click();const path=test.info().outputPath('cleanup.agc');await(await download).saveAs(path);
  const p=JSON.parse(await readFile(path,'utf8'));expect(p.version).toBe(4);expect(p.gameplay).toHaveLength(1);expect(p.objects[0].cleanup.crop.operation).toBe('remove');expect(p.presentation.lighting).toBe('neutral');
  await page.reload();await page.locator('#projectInput').setInputFiles(path);await page.locator('#projectScanInput').setInputFiles(scanFile());await expect(page.locator('#projectStatus')).toContainText('Project opened');
  await expect(page.locator('#scanMode')).toHaveValue('cleaned');await expect(page.locator('#lightingMode')).toHaveValue('neutral');
  const result=await page.evaluate(()=>({triangles:agcDebug.walk.data.triangles.length,geometry:agcDebug.objects[0].triangleCount,height:agcDebug.objects[0].localCollider.size.y}));
  expect(result.triangles).toBe(2);expect(result.height).toBe(0);
  await page.locator('#cleanupReset').click();await expect(page.locator('#scanMode')).toHaveValue('original');
  expect(await page.evaluate(()=>agcDebug.objects[0].localCollider.size.y)).toBe(2);
  expect(await page.evaluate(()=>agcDebug.walk.data.triangles.length)).toBe(12);
  await expect(page.locator('#gameCount')).toHaveText('1/100');
  for(const invalid of [{...p.objects[0].cleanup,offset:[0,null,0]},{...p.objects[0].cleanup,algorithm:2},{...p.objects[0].cleanup,mode:'optimized'},{...p.objects[0].cleanup,crop:{operation:'keep',min:[1,1,1],max:[0,0,0]}}]) {
    const bad=structuredClone(p);bad.objects[0].cleanup=invalid;expect(()=>parseProject(JSON.stringify(bad))).toThrow('cleanup');
  }
});
test('analysis limits are explicit and cleanup is refused without dropping triangles',async()=>{
  const root=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array((SCAN_LIMIT+1)*9),3));root.add(new THREE.Mesh(g));
  const a=await analyzeScan(root);expect(a.limited).toBe(true);await expect(deriveScan(a,clean())).rejects.toThrow('Cleanup limit');
  await expect(deriveScan(a,{...clean(),auto:false,offset:[1,0,0]})).rejects.toThrow('Cleanup limit');
});

test('derived geometry preserves UVs/material groups and detects opposing normals',async()=>{
  const root=new THREE.Group(),g=new THREE.BoxGeometry(4,4,4);
  const normals=g.attributes.normal; for(let i=0;i<normals.array.length;i++) normals.array[i]*=-1;
  root.add(new THREE.Mesh(g,Array.from({length:6},()=>new THREE.MeshStandardMaterial())));
  const a=await analyzeScan(root),d=await deriveScan(a,clean());
  expect(a.inconsistentNormals).toBe(12);expect(d.geometries[0].groups).toEqual(g.groups);
  const triangleUVs=geometry=>Array.from(geometry.index.array,id=>[geometry.attributes.uv.getX(id),geometry.attributes.uv.getY(id)]);
  expect(triangleUVs(d.geometries[0])).toEqual(triangleUVs(g));
  for(let i=0;i<normals.count;i++) expect(new THREE.Vector3().fromBufferAttribute(d.geometries[0].attributes.normal,i).dot(new THREE.Vector3().fromBufferAttribute(normals,i))).toBeCloseTo(-1);
});
test('Remove Inside removes crossing triangles even when all vertices are outside',async()=>{
  const root=new THREE.Group(),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-5,0,-5,5,0,-5,0,0,5, 10,0,10,11,0,10,10,0,11],3));root.add(new THREE.Mesh(g));
  const a=await analyzeScan(root),d=await deriveScan(a,{...clean(),auto:false,crop:{operation:'remove',min:[-.1,-.1,-.1],max:[.1,.1,.1]}});
  expect(d.triangles).toBe(1);expect(d.bounds.min[0]).toBe(10);expect(d.removedComponents).toBe(1);
});
