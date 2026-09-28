// Local-only follow-up for the representative private scan: no uploads, no committed outputs.
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const path=process.argv[2];if(!path) throw new Error('Provide a local GLB path.');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(180000);
  await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(t=>setTimeout(()=>fn(t),120));});
  await page.goto('http://127.0.0.1:4189/agc/');await page.locator('#fileInput').setInputFiles(path);await page.locator('#scanPanel').waitFor();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
  await page.locator('#scanPanel summary').click();
  const results=[];
  for(const error of ['0.01','0.02']) {
    await page.locator('#proxyTarget').fill('5000');await page.locator('#proxyError').fill(error);await page.locator('#proxyApply').click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
    results.push({error,comparison:await page.locator('#scanComparison').textContent(),proxy:await page.locator('#proxyStatus').textContent(),walk:await page.locator('#walkStatus').textContent(),timing:await page.locator('#walkTiming').textContent()});
  }
  for(const mode of ['original','optimized']) {
    await page.locator(`[data-scan-mode="${mode}"]`).click();await page.locator('#loadingOverlay').waitFor({state:'hidden'});
    const b=await page.locator('#sceneCanvas').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.wheel(0,-500);await page.waitForTimeout(1500);
    await page.screenshot({path:`artifacts/scan-verification/real-v5-${mode}-detail.png`,timeout:180000});
  }
  await writeFile('artifacts/scan-verification/real-v5-proxy-budgets.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
