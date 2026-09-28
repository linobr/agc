// Runs against preview or deployed Pages. Only synthetic, local GLB data is used.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { roomFile, stepFile } from '../tests/fixture.js';
const url=process.argv[2] || 'http://127.0.0.1:4189/agc/';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  page.on('requestfailed',r=>{if (/\.(js|css)(\?|$)/.test(r.url())) failures.push(r.url());});
  page.on('response',r=>{if (/\.(js|css)(\?|$)/.test(r.url()) && r.status()>=400) failures.push(`${r.status()} ${r.url()}`);});
  const response=await page.goto(url);
  assert.equal(response.status(),200);
  await page.locator('#importEmptyBtn').waitFor();
  assert.equal(await page.evaluate(()=>typeof window.agcDebug),'undefined');
  await page.locator('#fileInput').setInputFiles(roomFile());
  await page.getByText(/2 walkable candidates/).waitFor();
  assert.match(await page.locator('#walkRegions').textContent(),/Regions: 1/);
  await page.locator('#walkSlope').fill('35'); await page.locator('#walkSlope').press('Tab');
  await page.locator('#walkStep').fill('0.25'); await page.locator('#walkStep').press('Tab');
  const setSpawn=async (x,y,z)=>{
    for(const [id,n] of [['spawnX',x],['spawnY',y],['spawnZ',z]]) { await page.locator(`#${id}`).fill(String(n)); await page.locator(`#${id}`).press('Tab'); }
  };
  await setSpawn(0,.04,0);
  await page.locator('#walkBtn').click(); assert.equal(await page.locator('#sceneStatus').textContent(),'EDITOR MODE');
  assert.match(await page.locator('#spawnStatus').textContent(),/cannot start/);
  await setSpawn(-3,.04,-2);
  assert.match(await page.locator('#spawnStatus').textContent(),/Manual: Spawn valid/);
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
  const downloading=page.waitForEvent('download'); await page.locator('#exportBtn').click();
  await (await downloading).saveAs('test-results/production-walk.agc');
  const saved=JSON.parse(await readFile('test-results/production-walk.agc','utf8'));
  assert.equal(saved.version,4); assert.equal(saved.walk.slope,35); assert.equal(saved.walk.stepHeight,.25);
  assert.deepEqual(saved.walk.spawn,[-3,.04,-2]);
  await page.locator('#projectInput').setInputFiles({name:'production-walk.agc',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await page.locator('#projectScanInput').setInputFiles(roomFile());
  await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent.includes('Project opened'));
  assert.equal(await page.locator('#spawnX').inputValue(),'-3');
  // Exercise step-up through production keyboard input and observable telemetry only.
  await page.locator('#fileInput').setInputFiles(stepFile());
  await page.waitForFunction(()=>document.querySelector('#walkStatus').textContent.includes('14 collision triangles'));
  await setSpawn(-2,.04,0); await page.locator('#walkBtn').click();
  await page.waitForFunction(()=>document.querySelector('#walkTelemetry').textContent.includes('grounded'));
  await page.keyboard.down('d');
  await page.waitForFunction(()=>{
    const values=document.querySelector('#walkTelemetry').textContent.match(/Player: ([\d.-]+), ([\d.-]+)/);
    return values && Number(values[1])>1 && Number(values[2])>.14;
  },null,{timeout:60000});
  await page.keyboard.up('d');
  await page.screenshot({path:'test-results/production-step.png'});
  await page.locator('#walkBtn').click();
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({url,http:response.status(),assetErrors:failures,walk:'regions, manual/invalid spawn, movement, respawn, project v4 roundtrip, low step and editor verified'}));
} finally { await browser.close(); }
