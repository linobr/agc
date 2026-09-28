// Production/live smoke; private input is strictly limited to loopback URLs.
import {chromium} from '@playwright/test';
import * as THREE from 'three';
import {scanFile} from '../tests/fixture.js';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.argv[2] || 'http://127.0.0.1:4189/agc/',path=process.argv[3];
if(path && !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Private scans are localhost-only.');
const g=new THREE.PlaneGeometry(8,8,120,120);g.rotateX(-Math.PI/2);
const fixture=scanFile(Array.from(g.attributes.position.array),Array.from(g.index.array));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(180000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await page.goto(url)).status(),200);
  await page.locator('#fileInput').setInputFiles(path || fixture);await page.locator('#scanPanel').waitFor();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  const result={url,real:!!path,importHealth:await page.locator('#scanHealth').textContent(),importTune:await page.locator('#tuneStatus').textContent(),importProxy:await page.locator('#proxyStatus').textContent()};
  assert.match(result.importTune,/valid/);
  await page.locator('#scanPanel summary').click();
  await page.locator('#proxyTarget').fill('20000');await page.locator('#proxyError').fill('0.01');await page.locator('#proxyApply').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  result.before=await page.locator('#proxyStatus').textContent();
  await page.locator('#proxyTune').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  result.after=await page.locator('#proxyStatus').textContent();result.tune=await page.locator('#tuneStatus').textContent();
  assert.match(result.tune,/valid/);assert.match(result.after,/Walk uses this proxy/);
  await page.locator('#proxyAutoTune').check();
  await page.locator('#optimizeApply').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  result.optimized=await page.locator('#scanComparison').textContent();result.health=await page.locator('#scanHealth').textContent();result.walk=await page.locator('#walkStatus').textContent();result.spawn=await page.locator('#spawnStatus').textContent();result.timing=await page.locator('#walkTiming').textContent();
  await page.locator('#performanceToggle').check();await page.locator('#walkBtn').click();
  await page.waitForFunction(()=>document.querySelector('#walkTelemetry').textContent.includes('grounded'));
  await page.waitForTimeout(5000);
  result.performance=[];
  for(let i=0;i<5;i++) {await page.waitForTimeout(1000);result.performance.push(await page.locator('#performanceHud').textContent());}
  assert.match(result.performance[0],/FPS/);
  await mkdir('artifacts/scan-verification',{recursive:true});const prefix=`artifacts/scan-verification/${path?'real':'synthetic'}-intelligence`;
  await page.screenshot({path:`${prefix}-walk.png`,timeout:180000});
  await page.locator('#performanceToggle').uncheck();assert.equal(await page.locator('#performanceHud').isVisible(),false);
  await page.locator('#walkBtn').click();await page.locator('#scanHealth').scrollIntoViewIfNeeded();await page.screenshot({path:`${prefix}-health.png`,timeout:180000});
  assert.deepEqual(errors,[]);result.errors=errors;await writeFile(`${prefix}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser.close();}
