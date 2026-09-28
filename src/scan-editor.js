import * as THREE from 'three';
import { DEFAULT_CLEANUP, validateCleanup, analyzeScan, deriveScan, activateScan, groundOffset } from './scan-cleanup.js';
import { optimizeVisual, buildCollisionProxy, disposeProxy, proxyForEntry } from './scan-optimize.js';

function disposeVariants(scan) {
  scan.derived?.geometries.forEach(g=>g.dispose());
  scan.optimized?.geometries.forEach(g=>g.dispose());
  Object.values(scan.proxies).forEach(disposeProxy);
}
async function ensureVariants(scan, progress, optimize=false) {
  if((optimize || scan.cleanup.mode==='optimized') && !scan.optimized)
    scan.optimized=await optimizeVisual(scan.analysis,scan.derived,scan.cleanup.optimization,progress);
  const source=scan.cleanup.mode==='original' ? 'original' : 'cleaned';
  if(!(source in scan.proxies)) {
    try {scan.proxies[source]=await buildCollisionProxy(scan.analysis,source==='original' ? null : scan.derived,scan.cleanup.proxy,progress);}
    catch(error) {scan.proxies[source]=null;scan.proxyWarning=`Proxy unavailable: ${error.message}`;}
  }
}
async function buildState(analysis, cleanup, progress, optimize=false, groundRoot=null) {
  const scan={analysis,cleanup:validateCleanup(cleanup),derived:null,optimized:null,proxies:{},history:[]};
  try {
    if(cleanup.auto || cleanup.crop || cleanup.crops.length || cleanup.offset.some(Boolean)) scan.derived=await deriveScan(analysis,cleanup,progress);
    if(groundRoot && scan.derived) {
      scan.cleanup.offset=groundOffset(groundRoot,scan.derived.bounds);
      scan.derived.geometries.forEach(g=>g.dispose());scan.derived=null;
      scan.derived=await deriveScan(analysis,scan.cleanup,progress);
    }
    await ensureVariants(scan,progress,optimize);
    return scan;
  } catch(error) {disposeVariants(scan);throw error;}
}
export async function prepareScan(root, config = DEFAULT_CLEANUP, progress) {
  const analysis=await analyzeScan(root,progress);
  const scan=await buildState(analysis,config,progress);
  activateScan(analysis,scan.derived,scan.cleanup.mode,scan.optimized);
  return scan;
}
export function disposeScan(scan) {
  if(!scan) return;
  activateScan(scan.analysis,null,'original');disposeVariants(scan);
}
const $=id=>document.getElementById(id);
const dimensions=b=>b.dimensions.map(n=>n.toFixed(3)).join(' × ');
const range=b=>`${b.min.map(n=>n.toFixed(2)).join(', ')} → ${b.max.map(n=>n.toFixed(2)).join(', ')}`;
export class ScanEditor {
  constructor(scene, hooks) {
    this.scene=scene;this.hooks=hooks;
    this.helper=new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)),0x157aff);
    this.helper.visible=false;this.helper.material.depthTest=false;this.helper.renderOrder=10;scene.add(this.helper);
    this.proxyView=new THREE.Group();this.proxyView.matrixAutoUpdate=false;scene.add(this.proxyView);
    this.proxyMaterial=new THREE.MeshBasicMaterial({color:0xe155da,wireframe:true,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.6});
    $('autoClean').onclick=()=>this.apply('auto');
    $('cleanupReset').onclick=()=>this.apply('reset');
    $('cleanupUndo').onclick=()=>this.apply('undo');
    $('scanMode').onchange=()=>this.apply('mode');
    for(const button of document.querySelectorAll('[data-scan-mode]')) button.onclick=()=>{$('scanMode').value=button.dataset.scanMode;this.apply('mode');};
    $('optimizeApply').onclick=()=>this.apply('optimize');
    $('proxyApply').onclick=()=>this.apply('proxy');
    $('showProxy').onchange=()=>this.update();
    $('cropStart').onclick=()=>this.startCrop();
    $('cropKeep').onclick=()=>this.apply('keep');
    $('cropRemove').onclick=()=>this.apply('remove');
    $('cropReset').onclick=()=>this.apply('cropReset');
    $('cropPreview').onclick=()=>this.previewCrop();
    $('cropCancelPreview').onclick=()=>this.cancelPreview();
    $('cropPreviewOperation').onchange=()=>this.cancelPreview();
    for(const input of document.querySelectorAll('[data-crop]')) input.oninput=()=>{this.cancelPreview();this.updateBox();};
  }
  entry() {return this.hooks.entry();}
  update() {
    const entry=this.entry(),scan=entry?.scan;
    $('scanPanel').hidden=!scan;
    if(!scan) {this.helper.visible=false;this.proxyView.visible=false;return;}
    const a=scan.analysis,d=scan.derived,o=scan.optimized,proxy=scan.proxies[scan.cleanup.mode==='original' ? 'original' : 'cleaned'];
    $('scanMode').value=scan.cleanup.mode;
    for(const b of document.querySelectorAll('[data-scan-mode]')) b.setAttribute('aria-pressed',String(b.dataset.scanMode===scan.cleanup.mode));
    $('optimizationTarget').value=scan.cleanup.optimization.target;
    $('optimizationError').value=scan.cleanup.optimization.error;
    $('proxyEnabled').checked=scan.cleanup.proxy.enabled;$('proxyTarget').value=scan.cleanup.proxy.target;$('proxyError').value=scan.cleanup.proxy.error;
    $('cleanupUndo').disabled=!scan.history.length;
    $('scanQuality').textContent=`${a.status} · original scan heuristic`;
    $('scanAnalysis').textContent=`${a.triangles.toLocaleString()} triangles · ${a.meshes} meshes · ${a.limited ? 'components not analyzed (limit/unsupported mesh)' : `${a.components.length} components · ${a.tiny} tiny isolated · ${a.outliers} outliers`}\nNormals: ${a.missingNormals} meshes missing · ${a.invalidNormals} invalid corners · ${a.inconsistentNormals} opposing faces. ${a.looseBounds ? 'Unusually loose / fragmented bounds.' : 'No obvious bounds inflation detected.'}`;
    $('scanComparison').textContent=`Active mode: ${scan.cleanup.mode}\nOriginal Triangles: ${a.triangles.toLocaleString()}\nCleaned Triangles: ${(d?.triangles ?? a.triangles).toLocaleString()}\nOptimized Triangles: ${o ? o.triangles.toLocaleString() : 'not generated'}\nCollision Proxy Triangles: ${proxy ? proxy.triangles.toLocaleString() : '0 (using visual geometry)'}\nRemoved components: ${d?.removedComponents ?? 0}\nDimensions: ${dimensions(a.bounds)} → ${dimensions(d?.bounds ?? a.bounds)}\nBounds (scan coordinates): ${range(a.bounds)} → ${range(d?.bounds ?? a.bounds)}\nGround/center offset: ${scan.cleanup.offset.map(n=>n.toFixed(3)).join(', ')}\nCrop steps: ${Number(!!scan.cleanup.crop)+scan.cleanup.crops.length}`;
    $('optimizationStatus').textContent=o ? `Target ${o.target.toLocaleString()} · achieved ${o.triangles.toLocaleString()} · estimated relative error ${o.error.toPrecision(3)} · ${o.ms.toFixed(0)} ms. Quality/borders take priority over the target.` : 'Optional. Default error budget 0.1%; UVs, normals and material borders are protected. Target is not guaranteed.';
    this.updateProxyStatus();
    this.proxyView.clear();
    if(proxy) this.proxyView.add(new THREE.Mesh(proxy.geometry,this.proxyMaterial));
    $('autoClean').disabled=a.limited;$('optimizeApply').disabled=a.limited;
  }
  updateProxyStatus() {
    const entry=this.entry(),scan=entry?.scan;
    if(!scan) return;
    const proxy=scan.proxies[scan.cleanup.mode==='original' ? 'original' : 'cleaned'];
    let status='Auto proxy above the target. Small or irreducible scans use visual geometry.';
    if(proxy) {
      const state=this.hooks.walkState?.();
      const use=proxyForEntry(entry) ? (state?.ready ? 'Walk uses this proxy.' : `Proxy selected; Walk unavailable or not yet calculated. ${state?.reason || ''}`) : 'Outside Walk budget/error guard; visual fallback.';
      status=`${proxy.triangles.toLocaleString()} triangles · estimated error ${proxy.error.toFixed(5)} scan units · build ${proxy.ms.toFixed(0)} ms. ${use}`;
    }
    $('proxyStatus').textContent=scan.proxyWarning || status;
  }
  startCrop() {
    if(this.hooks.busy()) return;
    this.cancelPreview();const scan=this.entry()?.scan;if(!scan) return;
    const b=scan.cleanup.crops.at(-1) || scan.cleanup.crop || scan.analysis.bounds;
    for(let i=0;i<3;i++) {$(`cropCenter${i}`).value=(b.min[i]+b.max[i])/2;$(`cropSize${i}`).value=Math.max(b.max[i]-b.min[i],.001);}
    $('cropControls').hidden=false;this.cropping=true;this.updateBox();
  }
  crop() {
    const center=[0,1,2].map(i=>Number($(`cropCenter${i}`).value)),size=[0,1,2].map(i=>Number($(`cropSize${i}`).value));
    if(!center.every(Number.isFinite) || !size.every(n=>Number.isFinite(n)&&n>0)) throw new Error('Crop requires finite coordinates and positive dimensions.');
    return {min:center.map((n,i)=>n-size[i]/2),max:center.map((n,i)=>n+size[i]/2)};
  }
  appendCrop(config,operation) {
    const crop={...this.crop(),operation};
    if(!config.crop) config.crop=crop;else config.crops.push(crop);
    config.mode='cleaned';return config;
  }
  updateBox() {
    try {const c=this.crop();this.helper.box.set(new THREE.Vector3().fromArray(c.min),new THREE.Vector3().fromArray(c.max));this.tick();}
    catch {this.helper.visible=false;}
  }
  cancelPreview() {
    if(this.preview) {
      this.preview.entry.root.visible=true;this.scene.remove(this.preview.root);
      this.preview.derived.geometries.forEach(g=>g.dispose());this.preview.material.dispose();this.preview=null;
      $('cleanupStatus').textContent='Preview cancelled. Applied recipe unchanged.';
    }
    $('cropCancelPreview').hidden=true;
  }
  async previewCrop() {
    const entry=this.entry();if(!entry?.scan || this.hooks.busy()) return;
    this.cancelPreview();this.hooks.loading('Building crop preview…');
    try {
      const config=this.appendCrop(structuredClone(entry.scan.cleanup),$('cropPreviewOperation').value);
      const derived=await deriveScan(entry.scan.analysis,config,this.hooks.progress);
      const root=new THREE.Group();root.matrixAutoUpdate=false;
      const material=new THREE.MeshBasicMaterial({color:0x36bdd2,wireframe:true,side:THREE.DoubleSide});
      derived.geometries.forEach((g,i)=>{const mesh=new THREE.Mesh(g,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(entry.scan.analysis.records[i].matrix);root.add(mesh);});
      this.preview={root,material,derived,entry};this.scene.add(root);entry.root.visible=false;
      $('cleanupStatus').textContent=`Preview only: ${derived.triangles.toLocaleString()} triangles. Keep/Remove applies; save/test cancels preview.`;
      $('cropCancelPreview').hidden=false;
    } catch(error) {$('cleanupStatus').textContent=error.message;}
    finally {this.hooks.loaded();}
  }
  tick() {
    const entry=this.entry();
    this.proxyView.visible=!!(entry?.scan && $('showProxy').checked && !this.hooks.busy() && !this.preview);
    if(entry) {entry.root.updateMatrixWorld(true);this.proxyView.matrix.copy(entry.root.matrixWorld);}
    if(this.preview) this.preview.root.matrix.copy(this.preview.entry.root.matrixWorld);
    this.helper.visible=!!(this.cropping && entry?.scan && !this.hooks.busy());
    if(!this.helper.visible) return;
    const offset=entry.scan.cleanup.mode!=='original' || this.preview ? entry.scan.cleanup.offset : [0,0,0];
    this.helper.matrixWorldAutoUpdate=true;this.helper.updateMatrixWorld(true);
    this.helper.matrixWorld.premultiply(new THREE.Matrix4().makeTranslation(...offset)).premultiply(entry.root.matrixWorld);this.helper.matrixWorldAutoUpdate=false;
  }
  async apply(action) {
    const entry=this.entry();if(!entry?.scan || this.hooks.busy()) return;
    this.cancelPreview();const scan=entry.scan;
    if(action==='undo' && !scan.history.length) return;
    this.hooks.loading('Preparing scan variants…');
    let next=null;
    try {
      let config=structuredClone(scan.cleanup);
      if(action==='undo') config=structuredClone(scan.history.at(-1));
      else if(action==='reset') config=structuredClone(DEFAULT_CLEANUP);
      else if(action==='mode') config.mode=$('scanMode').value;
      else {
        if(action==='auto') {config.mode='cleaned';config.auto=true;config.offset=[0,0,0];}
        if(action==='keep' || action==='remove') this.appendCrop(config,action);
        if(action==='cropReset') {config.mode='cleaned';config.crop=null;config.crops=[];}
        if(action==='optimize') {config.mode='optimized';config.optimization={target:Number($('optimizationTarget').value),error:Number($('optimizationError').value)};}
        if(action==='proxy') config.proxy={enabled:$('proxyEnabled').checked,target:Number($('proxyTarget').value),error:Number($('proxyError').value)};
      }
      validateCleanup(config);
      if(action==='mode') {next={...scan,cleanup:config,proxies:{...scan.proxies}};await ensureVariants(next,this.hooks.progress);}
      else next=await buildState(scan.analysis,config,this.hooks.progress,action!=='reset' && !!scan.optimized,action==='auto' ? entry.root : null);
      next.history=action==='undo' ? scan.history.slice(0,-1) : action==='mode' ? scan.history : [...scan.history,structuredClone(scan.cleanup)].slice(-20);
      activateScan(next.analysis,next.derived,next.cleanup.mode,next.optimized);entry.scan=next;
      if(action!=='mode') disposeVariants(scan);
      if(action==='reset') {this.cropping=false;$('cropControls').hidden=true;}
      const status=this.hooks.changed(entry);
      $('cleanupStatus').textContent=action==='reset' ? `Original restored. Cleanup recipe cleared. ${status}` : `Applied. ${status}`;
    } catch(error) {$('cleanupStatus').textContent=error.message;}
    finally {this.hooks.loaded();this.update();this.updateBox();}
  }
}
