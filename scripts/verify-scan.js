// Private scans are accepted only on localhost and never copied or uploaded.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { scanFile } from '../tests/fixture.js';
const url=process.argv[2] || 'http://127.0.0.1:4189/agc/';
const scanPath=process.argv[3];
if(scanPath && !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Private scans are restricted to localhost verification.');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(120000);
  // Limit rendering during software-GPU visual checks; application code remains unchanged.
  await page.addInitScript(() => { const raf=window.requestAnimationFrame.bind(window); window.requestAnimationFrame=fn=>raf(t=>setTimeout(()=>fn(t),100)); });
  const response=await page.goto(url);assert.equal(response.status(),200);
  await page.locator('#fileInput').setInputFiles(scanPath || scanFile(
    [-6,2,-6,-6,2,6,6,2,6,6,2,-6, 0,2,-6,0,5,-6,0,5,6,0,2,6, 20,2,0,20,2,.01,20.01,2,.01,20.01,2,0],
    [0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11]));
  await page.locator('#scanPanel').waitFor({timeout:180000});
  await page.locator('#loadingOverlay').waitFor({state:'hidden',timeout:180000});
  await mkdir('artifacts/scan-verification',{recursive:true});
  const shot=async name=>{await page.locator('#scanPanel').scrollIntoViewIfNeeded();await page.screenshot({timeout:120000,path:`artifacts/scan-verification/${scanPath?'real':'synthetic'}-${name}.png`});};
  await shot('original');
  const original=await page.locator('#scanAnalysis').textContent();
  await page.locator('#autoClean').click();await page.locator('#loadingOverlay').waitFor({state:'hidden',timeout:180000});
  assert.match(await page.locator('#cleanupStatus').textContent(),/Applied/);
  await shot('cleaned-studio-ground');
  const auto=await page.locator('#scanComparison').textContent();
  await page.locator('#cropStart').click();
  await shot('crop-box');
  // Manual crop can be tailored through environment variables after inspecting Original.
  if(process.env.AGC_CROP) {
    const crop=JSON.parse(process.env.AGC_CROP);
    for(const [kind,values] of Object.entries(crop)) for(let i=0;i<3;i++) await page.locator(`#crop${kind}${i}`).fill(String(values[i]));
  } else {
    const size=Number(await page.locator('#cropSize0').inputValue());
    await page.locator('#cropSize0').fill(String(size*.8));
  }
  await page.locator('#cropKeep').click();await page.locator('#loadingOverlay').waitFor({state:'hidden',timeout:180000});
  assert.match(await page.locator('#cleanupStatus').textContent(),/Applied/);
  await shot('crop');
  const cropped=await page.locator('#scanComparison').textContent(),cropStatus=await page.locator('#cleanupStatus').textContent();
  await page.locator('#scanMode').selectOption('original'); await page.locator('#loadingOverlay').waitFor({state:'hidden'});await shot('original-restored');
  await page.locator('#scanMode').selectOption('cleaned'); await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  await page.locator('#backgroundMode').selectOption('dark');await shot('dark');
  assert.deepEqual(errors,[]);
  const result={url,realScan:!!scanPath,original,auto,cropped,cropStatus,errors};
  await writeFile(`artifacts/scan-verification/${scanPath?'real':'synthetic'}-metrics.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
