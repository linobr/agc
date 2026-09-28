// Runs against preview or deployed Pages. Only synthetic, local GLB data is used.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { roomFile } from '../tests/fixture.js';
const url=process.argv[2] || 'http://127.0.0.1:4189/agc/';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  page.on('response',r=>{if (/\.(js|css)(\?|$)/.test(r.url()) && r.status()>=400) failures.push(`${r.status()} ${r.url()}`);});
  const response=await page.goto(url);
  assert.equal(response.status(),200);
  await page.locator('#importEmptyBtn').waitFor();
  assert.equal(await page.evaluate(()=>typeof window.agcDebug),'undefined');
  await page.locator('#fileInput').setInputFiles(roomFile());
  await page.getByText(/2 walkable candidates/).waitFor();
  await page.locator('#walkSurfaces').check();
  await page.locator('#walkBtn').click();
  await page.waitForFunction(()=>document.querySelector('#walkTelemetry').textContent.includes('grounded'));
  const initial=await page.locator('#walkTelemetry').textContent();
  await page.keyboard.down('d');
  await page.waitForFunction(old=>document.querySelector('#walkTelemetry').textContent!==old,initial);
  await page.keyboard.up('d');
  await page.locator('#walkRespawn').click();
  await page.waitForFunction(()=>document.querySelector('#walkTelemetry').textContent.includes('grounded'));
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/production-walk.png'});
  await page.locator('#walkBtn').click();
  assert.equal(await page.locator('#sceneStatus').textContent(),'EDITOR MODE');
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({url,http:response.status(),assetErrors:failures,walk:'started, grounded, moved, respawned, returned to editor'}));
} finally { await browser.close(); }
