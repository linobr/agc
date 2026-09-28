import * as THREE from 'three';
import { DEFAULT_CLEANUP, analyzeScan, deriveScan, activateScan, groundOffset } from './scan-cleanup.js';

export async function prepareScan(root, config = DEFAULT_CLEANUP, progress) {
  const analysis=await analyzeScan(root,progress);
  const cleanup=structuredClone(config);
  const derived=(cleanup.auto || cleanup.crop || cleanup.offset.some(Boolean)) ? await deriveScan(analysis,cleanup,progress) : null;
  activateScan(analysis,derived,cleanup.mode);
  return { analysis, cleanup, derived };
}
export function disposeScan(scan) {
  if (!scan) return;
  // Caller disposes source materials and geometry after restoring Original.
  activateScan(scan.analysis,null,'original');
  scan.derived?.geometries.forEach(g=>g.dispose());
}
const $=id=>document.getElementById(id);
const dimensions=b=>b.dimensions.map(n=>n.toFixed(3)).join(' × ');
const range=b=>`${b.min.map(n=>n.toFixed(2)).join(', ')} → ${b.max.map(n=>n.toFixed(2)).join(', ')}`;
export class ScanEditor {
  constructor(scene, hooks) {
    this.hooks=hooks;
    this.helper=new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)),0x157aff);
    this.helper.visible=false; this.helper.material.depthTest=false; this.helper.renderOrder=10; scene.add(this.helper);
    $('autoClean').onclick=()=>this.apply('auto');
    $('cleanupReset').onclick=()=>this.apply('reset');
    $('scanMode').onchange=()=>this.apply('mode');
    $('cropStart').onclick=()=>this.startCrop();
    $('cropKeep').onclick=()=>this.apply('keep');
    $('cropRemove').onclick=()=>this.apply('remove');
    $('cropReset').onclick=()=>this.apply('cropReset');
    for(const input of document.querySelectorAll('[data-crop]')) input.oninput=()=>this.updateBox();
  }
  entry() { return this.hooks.entry(); }
  update() {
    const scan=this.entry()?.scan;
    $('scanPanel').hidden=!scan;
    if (!scan) { this.helper.visible=false; return; }
    const a=scan.analysis,d=scan.derived;
    $('scanMode').value=scan.cleanup.mode;
    $('scanQuality').textContent=`${a.status} · heuristic, not a certification`;
    $('scanAnalysis').textContent=`${a.triangles.toLocaleString()} triangles · ${a.meshes} meshes · ${a.limited ? 'components not analyzed (limit/unsupported mesh)' : `${a.components.length} components · ${a.tiny} tiny isolated · ${a.outliers} outliers`}\nNormals: ${a.missingNormals} meshes missing · ${a.invalidNormals} invalid corners · ${a.inconsistentNormals} opposing faces. ${a.looseBounds ? 'Unusually loose / fragmented bounds.' : 'No obvious bounds inflation detected.'}`;
    $('scanComparison').textContent=`Original → Cleaned\nTriangles: ${a.triangles.toLocaleString()} → ${(d?.triangles ?? a.triangles).toLocaleString()}\nRemoved components: ${d?.removedComponents ?? 0}\nDimensions: ${dimensions(a.bounds)} → ${dimensions(d?.bounds ?? a.bounds)}\nBounds (scan coordinates): ${range(a.bounds)} → ${range(d?.bounds ?? a.bounds)}\nGround/center offset: ${scan.cleanup.offset.map(n=>n.toFixed(3)).join(', ')}`;
    $('autoClean').disabled=a.limited;
  }
  startCrop() {
    if(this.hooks.busy()) return;
    const scan=this.entry()?.scan; if(!scan) return;
    const b=scan.cleanup.crop || scan.analysis.bounds;
    for(let i=0;i<3;i++) {
      $(`cropCenter${i}`).value=(b.min[i]+b.max[i])/2;
      $(`cropSize${i}`).value=Math.max(b.max[i]-b.min[i],.001);
    }
    $('cropControls').hidden=false; this.cropping=true; this.updateBox();
  }
  crop() {
    const center=[0,1,2].map(i=>Number($(`cropCenter${i}`).value));
    const size=[0,1,2].map(i=>Number($(`cropSize${i}`).value));
    if(!center.every(Number.isFinite) || !size.every(n=>Number.isFinite(n)&&n>0)) throw new Error('Crop requires finite coordinates and positive dimensions.');
    return { min:center.map((n,i)=>n-size[i]/2), max:center.map((n,i)=>n+size[i]/2) };
  }
  updateBox() {
    try {
      const crop=this.crop();
      this.helper.box.set(new THREE.Vector3().fromArray(crop.min),new THREE.Vector3().fromArray(crop.max));
      this.tick();
    } catch { this.helper.visible=false; }
  }
  tick() {
    const entry=this.entry();
    this.helper.visible=!!(this.cropping && entry?.scan && !this.hooks.busy());
    if(!this.helper.visible) return;
    // Box3Helper handles its own box transform; parent matrix applies scan pose and derived offset.
    const offset=entry.scan.cleanup.mode==='cleaned' ? entry.scan.cleanup.offset : [0,0,0];
    entry.root.updateMatrixWorld(true);
    this.helper.matrixWorldAutoUpdate=true;
    this.helper.updateMatrixWorld(true);
    this.helper.matrixWorld.premultiply(new THREE.Matrix4().makeTranslation(...offset)).premultiply(entry.root.matrixWorld);
    this.helper.matrixWorldAutoUpdate=false;
  }
  async apply(action) {
    const entry=this.entry();
    if(!entry?.scan || this.hooks.busy()) return;
    const scan=entry.scan;
    this.hooks.loading('Preparing scan cleanup…');
    let nextDerived=null;
    try {
      const config=structuredClone(scan.cleanup);
      if(action==='reset') Object.assign(config,structuredClone(DEFAULT_CLEANUP));
      else if(action==='mode') config.mode=$('scanMode').value;
      else {
        config.mode='cleaned';
        if(action==='auto') { config.auto=true; config.offset=[0,0,0]; }
        if(action==='keep' || action==='remove') config.crop={...this.crop(),operation:action};
        if(action==='cropReset') config.crop=null;
      }
      if(action!=='mode' && action!=='reset') {
        nextDerived=await deriveScan(scan.analysis,config,this.hooks.progress);
        if(action==='auto') {
          config.offset=groundOffset(entry.root,nextDerived.bounds);
          nextDerived.geometries.forEach(g=>g.dispose());
          nextDerived=await deriveScan(scan.analysis,config,this.hooks.progress);
        }
      }
      const previous=scan.derived;
      if(action!=='mode') scan.derived=nextDerived;
      scan.cleanup=config;
      activateScan(scan.analysis,scan.derived,config.mode);
      if(action!=='mode') previous?.geometries.forEach(g=>g.dispose());
      if(action==='reset') { this.cropping=false; $('cropControls').hidden=true; }
      const status=this.hooks.changed(entry);
      $('cleanupStatus').textContent=action==='reset' ? `Original restored. Cleanup recipe cleared. ${status}` : `Applied. ${status}`;
    } catch(error) { $('cleanupStatus').textContent=error.message; }
    finally { this.hooks.loaded(); this.update(); this.updateBox(); }
  }
}
