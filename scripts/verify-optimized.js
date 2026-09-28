// Real scans stay on localhost; live verification uses generated geometry only.
import {chromium} from '@playwright/test';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {scanFile} from '../tests/fixture.js';
const url=process.argv[2] || 'http://127.0.0.1:4189/agc/',scanPath=process.argv[3];
if(scanPath && !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Private scans are localhost-only.');
const g=new THREE.PlaneGeometry(8,8,120,120);g.rotateX(-Math.PI/2);
const fixture=scanFile(Array.from(g.attributes.position.array),Array.from(g.index.array));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(180000);
  page.on('pageerror',e=>errors.push(e.message));
  // Avoid saturating the software GPU while inspecting the private dense scan.
  if(scanPath) await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(t=>setTimeout(()=>fn(t),120));});
  assert.equal((await page.goto(url)).status(),200);
  await page.locator('#fileInput').setInputFiles(scanPath || fixture);await page.locator('#scanPanel').waitFor();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  const prefix=`artifacts/scan-verification/${scanPath?'real':'synthetic'}-v5`;
  await mkdir('artifacts/scan-verification',{recursive:true});
  const shot=async name=>{await page.locator('#scanComparison').scrollIntoViewIfNeeded();await page.waitForTimeout(500);await page.screenshot({path:`${prefix}-${name}.png`,timeout:180000});};
  await shot('original');
  await page.locator('#autoClean').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});assert.match(await page.locator('#cleanupStatus').textContent(),/Applied/);await shot('cleaned');
  await page.locator('#scanPanel summary').click();
  if(process.env.AGC_PROXY_TARGET) {
    await page.locator('#proxyTarget').fill(process.env.AGC_PROXY_TARGET);await page.locator('#proxyError').fill(process.env.AGC_PROXY_ERROR || '0.01');
    await page.locator('#proxyApply').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  }
  if(!scanPath) {await page.locator('#optimizationTarget').fill('5000');await page.locator('#optimizeApply').click();}
  else await page.locator('[data-scan-mode="optimized"]').click();
  await page.locator('#loadingOverlay').waitFor({state:'hidden'});assert.equal(await page.locator('#scanMode').inputValue(),'optimized');await shot('optimized');
  await page.locator('#showProxy').check();await shot('proxy');
  const comparison=await page.locator('#scanComparison').textContent(),optimization=await page.locator('#optimizationStatus').textContent(),proxy=await page.locator('#proxyStatus').textContent();
  const walk=await page.locator('#walkStatus').textContent(),timing=await page.locator('#walkTiming').textContent();
  if(scanPath && /Spawn found/.test(walk)) {
    await page.locator('#walkBtn').click();assert.equal(await page.locator('#sceneStatus').textContent(),'WALK TEST');
    await page.waitForFunction(()=>document.querySelector('#walkTelemetry').textContent.includes('grounded'));
    await page.screenshot({path:`${prefix}-walk.png`,timeout:180000});await page.locator('#walkRespawn').click();await page.locator('#walkBtn').click();
  }
  if(!scanPath) {
    assert.match(walk,/Collision Proxy/);assert.match(proxy,/Walk uses this proxy/);
    await page.locator('#walkBtn').click();assert.equal(await page.locator('#sceneStatus').textContent(),'WALK TEST');await page.waitForFunction(()=>document.querySelector('#walkTelemetry').textContent.includes('grounded'));await page.locator('#walkBtn').click();
    await page.locator('#cropStart').click();await page.locator('#cropSize0').fill('6');await page.locator('#cropPreview').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});assert.match(await page.locator('#cleanupStatus').textContent(),/Preview only/);
    await page.locator('#cropKeep').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});await page.locator('#cleanupUndo').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});assert.match(await page.locator('#scanComparison').textContent(),/Crop steps: 0/);
    const download=page.waitForEvent('download');await page.locator('#exportBtn').click();await(await download).saveAs(`${prefix}.agc`);
    await page.locator('#projectInput').setInputFiles(`${prefix}.agc`);await page.locator('#projectScanInput').setInputFiles(fixture);await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent.includes('Project opened'));
  }
  assert.deepEqual(errors,[]);const result={url,real:!!scanPath,comparison,optimization,proxy,walk,timing,errors};await writeFile(`${prefix}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser.close();}
