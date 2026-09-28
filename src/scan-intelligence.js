import * as THREE from 'three';
import { buildCollisionProxy, disposeProxy, proxyForEntry } from './scan-optimize.js';
import { analyzeWalk } from './walk.js';

// Defaults, not semantic recognition. Applying a preset never crops geometry.
export const PRESETS = {
  Object: { target:100000, proxyTarget:5000, error:.005, slope:35, stepHeight:.15, minArea:.05 },
  Room: { target:200000, proxyTarget:20000, error:.01, slope:40, stepHeight:.2, minArea:.2 },
  Outdoor: { target:200000, proxyTarget:20000, error:.02, slope:45, stepHeight:.3, minArea:.5 },
  Vegetation: { target:200000, proxyTarget:5000, error:.02, slope:40, stepHeight:.2, minArea:.1 },
};
export function presetSettings(cleanup, name) {
  const p=PRESETS[name];if(!p) throw new Error('Unknown scan preset.');
  const config=structuredClone(cleanup);
  config.preset=name;config.optimization.target=p.target;
  config.proxy={enabled:true,target:p.proxyTarget,error:p.error};
  return {config,walk:{slope:p.slope,stepHeight:p.stepHeight,minArea:p.minArea}};
}
export function recommendPreset(analysis) {
  const size=Math.max(...analysis.bounds.dimensions);
  return size>30 ? 'Outdoor' : size>6 ? 'Room' : analysis.triangles>100000 ? 'Vegetation' : 'Object';
}
export function scanHealth(entry,state={}) {
  const scan=entry.scan,render=entry.triangleCount ?? scan.analysis.triangles,proxy=proxyForEntry(entry);
  const status=state.ready && state.spawn ? (proxy ? 'valid' : 'fallback') : 'blocked';
  const recommended=recommendPreset(scan.analysis),collision=proxy?.triangles ?? render;
  const collisionComplexity=collision>20000 ? 'High' : collision>5000 ? 'Medium' : 'Low';
  const complexity=render>200000 ? 'High' : render>50000 ? 'Medium' : 'Low';
  const action=status==='blocked' ? 'Auto Tune Proxy; if blocked, crop/align/scale the scan or inspect spawn.' : complexity==='High' ? 'Try Optimized; inspect visual detail.' : 'Ready to test; inspect collisions locally.';
  return {status,recommended,render,proxy:proxy?.triangles ?? 0,complexity,action,
    text:`${complexity} visual complexity · Render ${render.toLocaleString()} triangles\nCollision complexity: ${collisionComplexity} · ${proxy ? `${proxy.triangles.toLocaleString()} proxy triangles` : `${render.toLocaleString()} visual triangles (fallback)`} · ${status}\nWalkability: ${state.ready ? 'calculated' : 'blocked / not calculated'} · Spawn: ${state.spawn ? 'valid' : 'unvalidated / blocked'}\nRecommended preset: ${recommended} (size/density heuristic, not object recognition)\nRecommended action: ${action}`};
}

// Candidate tests are isolated: no active visual, spawn or gameplay state changes.
// Smallest ACTUAL valid result wins among at most six bounded attempts.
export async function tuneProxy(entry, entries, walk, progress=()=>{}, options={}) {
  const build=options.build || buildCollisionProxy, analyze=options.analyze || analyzeWalk;
  if(!Number.isFinite(walk.slope) || walk.slope<0 || walk.slope>50 || !Number.isFinite(walk.minArea) || walk.minArea<0 || walk.minArea>10 || !Number.isFinite(walk.stepHeight) || walk.stepHeight<0 || walk.stepHeight>.4) throw new Error('Invalid walk settings; use slope 0–50°, area 0–10 m² and step 0–0.4 m.');
  const scan=entry.scan,source=scan.cleanup.mode==='original' ? 'original' : 'cleaned';
  if(scan.analysis.limited) return {status:'blocked',attempts:[],reason:'Scan exceeds the supported static 600k analysis budget.'};
  entry.root.updateMatrixWorld(true);
  const scale=Math.max(...entry.root.getWorldScale(new THREE.Vector3()).toArray().map(Math.abs));
  const maxError=Math.min(.02,.025/Math.max(scale,1e-9));
  if(maxError<.001) return {status:'blocked',attempts:[],reason:'World scale exceeds the proxy error guard. Adjust scale first.'};
  const candidates=[[1000,.005],[3000,.01],[5000,.02],[10000,.01],[20000,.005],[scan.cleanup.proxy.target,scan.cleanup.proxy.error]];
  const attempts=[],seen=new Set(),start=performance.now();let best=null;
  try {
    for(const [target,requested] of candidates) {
      if(attempts.length && performance.now()-start>30000) break;
      const settings={enabled:true,target,error:Math.min(requested,maxError)},key=JSON.stringify(settings);
      if(seen.has(key)) continue;seen.add(key);
      progress(`Auto Tune Proxy · candidate ${attempts.length+1}/6 · target ${target.toLocaleString()}`);
      await new Promise(r=>setTimeout(r,0));
      let proxy=null;
      try {
        proxy=await build(scan.analysis,source==='original' ? null : scan.derived,settings,()=>{});
        if(!proxy) {attempts.push({target,error:settings.error,valid:false,reason:'No smaller proxy produced.'});continue;}
        const trial={...entry,scan:{...scan,cleanup:{...scan.cleanup,proxy:settings},proxies:{...scan.proxies,[source]:proxy}}};
        if(!proxyForEntry(trial)) throw new Error('Proxy exceeds triangle/world-error guard.');
        const data=analyze(entries.map(e=>e===entry ? trial : e),walk);
        const spawn=walk.spawnMode==='manual' && walk.spawn ? new THREE.Vector3().fromArray(walk.spawn) : data.autoSpawn;
        const valid=!!spawn && data.validateSpawn(spawn).valid;
        attempts.push({target,error:settings.error,triangles:proxy.triangles,valid,reason:valid ? 'Valid walkability and spawn.' : 'No valid spawn.'});
        if(valid && (!best || proxy.triangles<best.proxy.triangles || (proxy.triangles===best.proxy.triangles && proxy.error<best.proxy.error))) {
          disposeProxy(best?.proxy);best={proxy,settings};proxy=null;
        }
      } catch(error) {attempts.push({target,error:settings.error,valid:false,reason:error.message});}
      finally {disposeProxy(proxy);}
    }
    return {...best,status:best ? 'valid' : 'blocked',attempts,ms:performance.now()-start,reason:best ? 'Smallest valid tested proxy selected.' : 'No valid proxy found; previous collision data retained. Crop/align/scale or inspect spawn.'};
  } catch(error) {disposeProxy(best?.proxy);throw error;}
}

export class FrameMeter {
  constructor() {this.reset();}
  reset() {this.last=null;this.ms=0;this.samples=0;}
  sample(now) {
    if(this.last!==null) {
      const dt=now-this.last;
      if(Number.isFinite(dt) && dt>0) {this.ms=this.samples ? this.ms*.9+dt*.1 : dt;this.samples++;}
    }
    this.last=now;return {ms:this.ms,fps:this.ms ? 1000/this.ms : 0};
  }
}
