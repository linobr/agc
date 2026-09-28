import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {analyzeScan,DEFAULT_CLEANUP,validateCleanup} from '../src/scan-cleanup.js';
import {tuneProxy,presetSettings,PRESETS,scanHealth,FrameMeter} from '../src/scan-intelligence.js';
import {buildCollisionProxy,disposeProxy} from '../src/scan-optimize.js';
import {scanFile} from './fixture.js';
import {readFile} from 'node:fs/promises';
const walk={slope:40,minArea:.1,stepHeight:.2,spawnMode:'auto',spawn:null};
function plane(vertical=false) {const g=new THREE.PlaneGeometry(8,8,40,40);if(!vertical)g.rotateX(-Math.PI/2);return g;}
async function entry(vertical=false) {
  const root=new THREE.Group();root.add(new THREE.Mesh(plane(vertical),new THREE.MeshStandardMaterial()));
  return {root,kind:'model',triangleCount:3200,scan:{analysis:await analyzeScan(root),cleanup:structuredClone(DEFAULT_CLEANUP),proxies:{}}};
}
test('auto tuning selects smallest actual valid proxy and preserves source and active settings',async()=>{
  const e=await entry(),g=e.root.children[0].geometry,bytes=Array.from(g.attributes.position.array),original=structuredClone(e.scan.cleanup);
  const result=await tuneProxy(e,[e],walk);expect(result.status).toBe('valid');expect(result.proxy.triangles).toBeLessThan(3200);
  expect(result.attempts.length).toBeLessThanOrEqual(6);expect(result.proxy.triangles).toBe(Math.min(...result.attempts.filter(a=>a.valid).map(a=>a.triangles)));
  expect(e.scan.cleanup).toEqual(original);expect(Array.from(g.attributes.position.array)).toEqual(bytes);disposeProxy(result.proxy);
});
test('unsuitable walls and invalid manual spawns stop after bounded trials without accepting proxy',async()=>{
  for(const vertical of [true,false]) {
    const e=await entry(vertical),result=await tuneProxy(e,[e],vertical ? walk : {...walk,spawnMode:'manual',spawn:[100,100,100]});
    expect(result.status).toBe('blocked');expect(result.proxy).toBeUndefined();expect(result.attempts.length).toBeLessThanOrEqual(6);expect(result.attempts.length).toBeGreaterThan(0);
  }
});
test('presets are editable defaults; optional v5 settings validate and old v5 defaults remain conservative',()=>{
  for(const [name,p] of Object.entries(PRESETS)) {
    const {config,walk:settings}=presetSettings(DEFAULT_CLEANUP,name);
    expect(config.optimization.target).toBe(p.target);expect(config.proxy.target).toBe(p.proxyTarget);expect(config.proxy.error).toBe(p.error);
    expect(settings).toEqual({slope:p.slope,stepHeight:p.stepHeight,minArea:p.minArea});expect(config.crop).toBeNull();
    config.proxy.target=1234;expect(validateCleanup(config).proxy.target).toBe(1234);
  }
  const old=structuredClone(DEFAULT_CLEANUP);delete old.preset;delete old.autoTune;expect(validateCleanup(old).autoTune).toBe(false);
  expect(()=>validateCleanup({...old,preset:'Magic'})).toThrow();expect(()=>validateCleanup({...old,autoTune:'yes'})).toThrow();
});
test('health distinguishes blocked spawn, valid proxy and visual fallback',async()=>{
  const e=await entry();expect(scanHealth(e,{ready:true,spawn:true}).status).toBe('fallback');
  e.scan.proxies.original=await buildCollisionProxy(e.scan.analysis,null,{enabled:true,target:1000,error:.01});
  expect(scanHealth(e,{ready:true,spawn:true}).status).toBe('valid');expect(scanHealth(e,{ready:true,spawn:false}).status).toBe('blocked');
  expect(scanHealth(e).recommended).toBe('Room');disposeProxy(e.scan.proxies.original);
});
test('frame meter uses real frame intervals, smoothing and reset',()=>{
  const meter=new FrameMeter();meter.sample(0);expect(meter.sample(20)).toEqual({ms:20,fps:50});
  expect(meter.sample(120).ms).toBeCloseTo(28);expect(meter.sample(3120).ms).toBeCloseTo(325.2);meter.reset();expect(meter.sample(500).ms).toBe(0);
});
test('manual controls, preset save/open and optional Walk performance HUD',async({page})=>{
  const g=plane(),file=scanFile(Array.from(g.attributes.position.array),Array.from(g.index.array));
  await page.goto('/');await page.locator('#fileInput').setInputFiles(file);await expect(page.locator('#loadingOverlay')).toBeHidden();
  await page.locator('#scanPreset').selectOption('Outdoor');await page.locator('#presetApply').click();await expect(page.locator('#loadingOverlay')).toBeHidden();
  await expect(page.locator('#walkStep')).toHaveValue('0.3');await page.locator('#scanPanel summary').click();
  await page.locator('#proxyTarget').fill('1500');await page.locator('#proxyApply').click();await expect(page.locator('#loadingOverlay')).toBeHidden();
  await expect(page.locator('#proxyAutoTune')).not.toBeChecked();await expect(page.locator('#proxyTarget')).toHaveValue('1500');
  await page.locator('#proxyTune').click();await expect(page.locator('#loadingOverlay')).toBeHidden();await expect(page.locator('#tuneStatus')).toContainText('valid');
  await page.locator('#performanceToggle').check();await page.locator('#walkBtn').click();await expect(page.locator('#performanceHud')).toBeVisible();await expect(page.locator('#performanceHud')).toContainText('FPS');
  await page.locator('#performanceToggle').uncheck();await expect(page.locator('#performanceHud')).toBeHidden();await page.locator('#walkBtn').click();
  const event=page.waitForEvent('download');await page.locator('#exportBtn').click();const path=test.info().outputPath('intelligence.agc');await(await event).saveAs(path);
  const saved=JSON.parse(await readFile(path,'utf8'));expect(saved.version).toBe(5);expect(saved.walk.slope).toBe(45);expect(saved.walk.stepHeight).toBe(.3);expect(saved.walk.minArea).toBe(.5);expect(saved.objects[0].cleanup.preset).toBe('Outdoor');expect(saved.objects[0].cleanup.autoTune).toBe(false);
  await page.reload();await page.locator('#projectInput').setInputFiles(path);await page.locator('#projectScanInput').setInputFiles(file);await expect(page.locator('#projectStatus')).toContainText('Project opened');
  await expect(page.locator('#scanPreset')).toHaveValue('Outdoor');expect(await page.evaluate(()=>agcDebug.objects[0].scan.cleanup)).toEqual(saved.objects[0].cleanup);
});
