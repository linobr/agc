import * as THREE from 'three';
import { buildRegions } from './walk-regions.js';

// Hard budgets: never silently drop collision triangles. Units are metres.
export const LIMITS = { triangles: 100000, references: 500000, perCell: 4000, cell: 2 };
const radius = 0.3;
const offsets = [0.3, 0.6, 0.9, 1.2, 1.5];
const key = (x, y, z) => `${x},${y},${z}`;
function cells(box, visit) {
  const lo = box.min.clone().divideScalar(LIMITS.cell).floor();
  const hi = box.max.clone().divideScalar(LIMITS.cell).floor();
  if ((hi.x-lo.x+1)*(hi.y-lo.y+1)*(hi.z-lo.z+1) > LIMITS.references)
    throw new Error('Triangle spans too much space. Split the scan into smaller sections.');
  for (let x=lo.x; x<=hi.x; x++) for (let y=lo.y; y<=hi.y; y++) for (let z=lo.z; z<=hi.z; z++) visit(key(x,y,z));
}
export function analyzeWalk(entries, { slope = 40, minArea = 0.1, stepHeight = 0.2 } = {}) {
  const started = performance.now(), triangles = [], unique = new Map();
  const slopeCos = Math.cos(slope*Math.PI/180);
  let count = 0, duplicates = 0;
  for (const entry of entries) entry.root.traverse(o => {
    if (o.isMesh) count += (o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0)/3;
  });
  if (count > LIMITS.triangles) throw new Error('Walk limit: 100,000 triangles. Use a smaller scan section; original GLB is unchanged.');
  for (const entry of entries) {
    entry.root.updateMatrixWorld(true);
    entry.root.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      if (o.isSkinnedMesh || o.isInstancedMesh || o.morphTargetInfluences?.some(Boolean))
        throw new Error('Walk supports static, non-instanced meshes only.');
      const p = o.geometry.attributes.position, index = o.geometry.index;
      for (let i=0; i<(index?.count ?? p.count); i+=3) {
        const points = [0,1,2].map(j => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i+j) : i+j).applyMatrix4(o.matrixWorld));
        if (!points.every(v => v.toArray().every(Number.isFinite))) throw new Error('Scan contains invalid vertices.');
        const t = new THREE.Triangle(...points);
        if (t.getArea() < 1e-10) continue;
        t.walkNormal = t.getNormal(new THREE.Vector3());
        t.isScan = entry.kind === 'model';
        // Quantized duplicate detection is bounded and does not alter source geometry.
        const k = points.map(v => v.toArray().map(n => Math.round(n*1000)).join(',')).sort().join('|');
        const existing = unique.get(k);
        if (existing) {
          duplicates++;
          if (t.walkNormal.y > existing.walkNormal.y) {
            existing.copy(t); existing.walkNormal.copy(t.walkNormal);
          }
          existing.isScan ||= t.isScan;
          continue;
        }
        unique.set(k,t); triangles.push(t);
      }
    });
  }
  unique.clear();
  const rawCandidates = triangles.filter(t => t.isScan && t.walkNormal.y >= slopeCos);
  const walkabilityMs = performance.now()-started;
  const regionStart = performance.now();
  const { regions, comparisons, filteredRegions } = buildRegions(rawCandidates,minArea);
  const candidates = regions.flatMap(r => r.triangles);
  const regionMs = performance.now()-regionStart;
  const colliderStart = performance.now(), buckets = new Map();
  let references = 0;
  triangles.forEach((t,id) => {
    cells(new THREE.Box3().setFromPoints([t.a,t.b,t.c]).expandByScalar(0.001), k => {
      if (++references > LIMITS.references) throw new Error('Walk spatial budget exceeded. Use a smaller scan section.');
      if (!buckets.has(k)) buckets.set(k, []);
      const b = buckets.get(k);
      if (b.length >= LIMITS.perCell) throw new Error('Scan is too dense in one area for a stable Walk Test.');
      b.push(id);
    });
  });
  const colliderMs = performance.now()-colliderStart;
  const query = box => {
    const ids = new Set();
    cells(box, k => { for (const id of buckets.get(k) || []) ids.add(id); });
    return [...ids].map(id => triangles[id]);
  };
  const nearby = position => query(new THREE.Box3(
    position.clone().add(new THREE.Vector3(-radius-0.05,-0.05,-radius-0.05)),
    position.clone().add(new THREE.Vector3(radius+0.05,1.85,radius+0.05))));
  const clear = position => {
    const ts = nearby(position), point = new THREE.Vector3();
    return offsets.every(y => {
      const c = position.clone().add(new THREE.Vector3(0,y,0));
      return ts.every(t => t.closestPointToPoint(c,point).distanceTo(c) >= radius-0.002);
    });
  };
  // Nearest hit wins, even if steep: never probe through an obstacle to a floor below it.
  const support = (position, up=0.2, down=0.25) => {
    const ray = new THREE.Ray(position.clone().add(new THREE.Vector3(0,up,0)),new THREE.Vector3(0,-1,0));
    const ts = query(new THREE.Box3(position.clone().add(new THREE.Vector3(-0.001,-down,-0.001)),position.clone().add(new THREE.Vector3(0.001,up,0.001))));
    let best = null;
    for (const t of ts) {
      const hit = ray.intersectTriangle(t.a,t.b,t.c,false,new THREE.Vector3());
      if (hit && hit.y >= position.y-down && (!best || hit.y > best.height)) best = { height:hit.y, triangle:t };
    }
    return best && best.triangle.walkNormal.y >= slopeCos ? best : null;
  };
  const validateSpawn = p => {
    if (!p || !p.toArray().every(n => Number.isFinite(n) && Math.abs(n)<=1e6)) return { valid:false, reason:'Spawn coordinates are invalid.' };
    if (!clear(p) || !clear(p.clone().add(new THREE.Vector3(0,0.35,0)))) return { valid:false, reason:'Spawn intersects geometry or has insufficient headroom.' };
    const margin = radius*Math.tan(Math.acos(slopeCos));
    const center = support(p,0.05,0.2);
    const probes = [center,...[[radius,0],[-radius,0],[0,radius],[0,-radius]].map(([x,z]) => {
      const hit = support(p.clone().add(new THREE.Vector3(x,0,z)),margin+0.05,margin+0.2);
      return hit && center && hit.triangle.regionId === center.triangle.regionId && Math.abs(hit.height-center.height)<=margin+0.03 ? hit : null;
    })];
    // One missing outer probe tolerates a small hole; center support remains mandatory.
    if (!probes[0]?.triangle.regionId || probes.filter(Boolean).length<4) return { valid:false, reason:'Spawn needs a walkable region under its center and at least four support probes.' };
    return { valid:true, regionId:probes[0].triangle.regionId, reason:'Spawn valid.' };
  };
  let spawn = null, activeRegion = regions[0] || null;
  // Bounded, distributed attempts within the largest regions rather than the first tiny triangles.
  let attempts = 0;
  for (const region of regions.slice(0,16)) {
    const stride = Math.max(1,Math.ceil(region.triangles.length/128));
    for (let i=0;i<region.triangles.length && attempts<512;i+=stride) {
      attempts++;
      const p = region.triangles[i].getMidpoint(new THREE.Vector3()).add(new THREE.Vector3(0,radius*(1/region.triangles[i].walkNormal.y-1)+0.04,0));
      if (validateSpawn(p).valid) { spawn=p; activeRegion=region; break; }
    }
    if (spawn || attempts>=512) break;
  }
  return { triangles, candidates, regions, activeRegion, area:regions.reduce((n,r)=>n+r.area,0), spawn, autoSpawn:spawn?.clone() || null,
    nearby, clear, support, validateSpawn, references, duplicates, filteredRegions, slopeCos, stepHeight,
    timings: { walkabilityMs, regionMs, colliderMs, totalMs:performance.now()-started }, comparisons };
}
export class WalkPlayer {
  constructor(data) { this.data=data; this.position=data.spawn.clone(); this.velocity=new THREE.Vector3(); this.grounded=false; this.respawn(); }
  respawn() { this.respawnVersion = (this.respawnVersion || 0) + 1; this.position.copy(this.data.spawn).y += 0.35; this.velocity.set(0,0,0); this.grounded=false; this.climb=null; }
  step(dt, x=0, z=0) {
    const moving = Math.hypot(x,z)>0;
    // Probe across the capsule radius, but never move horizontally farther than speed*dt.
    // A step is a bounded, clearance-checked lift over several frames, not a position snap.
    if (this.grounded && moving && !this.climb && this.data.stepHeight>0) {
      const ahead = this.position.clone().add(new THREE.Vector3(x*(radius+0.08),0,z*(radius+0.08)));
      const hit = this.data.support(ahead,this.data.stepHeight+0.02,0.04);
      const rise = hit ? hit.height-this.position.y : 0;
      if (rise>0.025 && rise<=this.data.stepHeight+0.001) {
        const top = this.position.clone(); top.y=hit.height+0.005;
        const landing = ahead.clone(); landing.y=top.y;
        if (this.data.clear(top) && this.data.clear(landing)) this.climb = { y:top.y, time:0, x, z };
      }
    }
    if (this.climb && (!moving || this.climb.x*x+this.climb.z*z<0.5 || this.climb.time>0.6)) this.climb=null;
    this.velocity.x=x*3; this.velocity.z=z*3;
    if (this.climb) {
      this.climb.time+=dt;
      const lift = Math.min(1.5*dt,Math.max(0,this.climb.y-this.position.y));
      const raised = this.position.clone(); raised.y+=lift;
      if (!this.data.clear(raised)) this.climb=null;
      else this.velocity.y=lift/dt;
    }
    if (!this.climb) this.velocity.y=Math.max(this.velocity.y-9.82*dt,-15);
    this.position.addScaledVector(this.velocity,dt);
    this.grounded=false;
    const ts=this.data.nearby(this.position), closest=new THREE.Vector3();
    for (let pass=0; pass<4; pass++) for (const y of offsets) {
      const c=this.position.clone().add(new THREE.Vector3(0,y,0));
      for (const t of ts) {
        t.closestPointToPoint(c,closest);
        const n=c.clone().sub(closest), distance=n.length();
        if (distance >= radius || distance < 1e-8) continue;
        n.divideScalar(distance);
        let penetration=radius-distance+1e-5;
        const walkable=t.walkNormal.y>=this.data.slopeCos;
        // Prevent rounded feet from climbing steep faces or raised platform edges.
        // On a walkable face the center must project inside the triangle before it supports us.
        let overFace=false, planeY=-Infinity;
        if (walkable) {
          planeY=t.a.y-(t.walkNormal.x*(c.x-t.a.x)+t.walkNormal.z*(c.z-t.a.z))/t.walkNormal.y;
          overFace=t.containsPoint(new THREE.Vector3(c.x,planeY,c.z));
        }
        if (n.y>0 && (!walkable || (!overFace && planeY>this.position.y+0.03))) {
          const horizontal=Math.hypot(n.x,n.z);
          if (horizontal>0.001) { n.y=0; n.divideScalar(horizontal); penetration/=horizontal; }
        }
        this.position.addScaledVector(n,penetration);
        c.addScaledVector(n,penetration);
        const inward=this.velocity.dot(n);
        if (inward<0) this.velocity.addScaledVector(n,-inward);
        if (walkable && n.y>=this.data.slopeCos) this.grounded=true;
      }
    }
    if (this.climb && this.position.y>=this.climb.y-0.001) {
      const floor=this.data.support(this.position,0.01,0.04);
      if (floor && Math.abs(floor.height-this.climb.y)<0.02) this.climb=null;
    }
    if (this.position.y < this.data.spawn.y-20) this.respawn();
  }
}
export function triangleOverlay(triangles, color, wireframe=false) {
  const positions = new Float32Array(triangles.length*9);
  triangles.forEach((t,i) => [t.a,t.b,t.c].forEach((p,j) => p.toArray(positions,i*9+j*3)));
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({ color, wireframe, side:THREE.DoubleSide, transparent:true, opacity:wireframe?0.45:0.35, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 }));
}
