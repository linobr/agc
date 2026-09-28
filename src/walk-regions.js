import * as THREE from 'three';

export const REGION_LIMITS = { edgeTolerance: 0.03, heightTolerance: 0.02, comparisons: 2000000 };
// Spatially indexed edge matching + union/find. Point contact alone never joins floors.
export function buildRegions(triangles, minArea) {
  const parent = triangles.map((_, i) => i), rank = new Uint8Array(triangles.length);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function join(a, b) {
    a = find(a); b = find(b); if (a === b) return;
    if (rank[a] < rank[b]) [a,b] = [b,a];
    parent[b] = a; if (rank[a] === rank[b]) rank[a]++;
  }
  const exactEdges = new Map(), buckets = new Map(), tolerance = REGION_LIMITS.edgeTolerance;
  let comparisons = 0;
  const near = (a,b) => Math.abs(a.y-b.y) <= REGION_LIMITS.heightTolerance && a.distanceToSquared(b) <= tolerance*tolerance;
  const compatible = (a,b) => triangles[a].walkNormal.dot(triangles[b].walkNormal) >= Math.cos(Math.PI/4);
  const vertexKey = v => `${Math.round(v.x*1000)},${Math.round(v.y*1000)},${Math.round(v.z*1000)}`;
  // Resolve shared tessellation edges in O(edges); only unmatched seams need neighborhood searches.
  triangles.forEach((t,i) => {
    const vertices = [t.a,t.b,t.c], keys = vertices.map(vertexKey);
    for (let j=0;j<3;j++) {
      const next=(j+1)%3, a=vertices[j], b=vertices[next];
      const k=keys[j]<keys[next] ? `${keys[j]}|${keys[next]}` : `${keys[next]}|${keys[j]}`;
      const old=exactEdges.get(k);
      if (old) {
        old.count++;
        if (compatible(i,old.i)) join(i,old.i);
      } else exactEdges.set(k,{a,b,i,count:1});
    }
  });
  for (const edge of exactEdges.values()) {
    if (edge.count!==1) continue;
    const {a,b,i}=edge;
    const midpoint = a.clone().add(b).multiplyScalar(0.5/tolerance).floor();
    for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++) {
      const k = `${midpoint.x+x},${midpoint.y+y},${midpoint.z+z}`;
      for (const e of buckets.get(k) || []) {
        if (++comparisons > REGION_LIMITS.comparisons) throw new Error('Region matching budget exceeded; use a less dense scan section.');
        if (!compatible(i,e.i)) continue;
        if ((near(a,e.a) && near(b,e.b)) || (near(a,e.b) && near(b,e.a))) join(i,e.i);
      }
    }
    const k = `${midpoint.x},${midpoint.y},${midpoint.z}`;
    if (!buckets.has(k)) buckets.set(k,[]);
    buckets.get(k).push(edge);
  }
  const groups = new Map();
  triangles.forEach((t,i) => {
    const id = find(i);
    if (!groups.has(id)) groups.set(id,{ triangles:[], area:0, minHeight:Infinity, maxHeight:-Infinity, center:new THREE.Vector3() });
    const r = groups.get(id), area = t.getArea();
    r.triangles.push(t); r.area += area;
    r.center.addScaledVector(t.getMidpoint(new THREE.Vector3()),area);
    r.minHeight = Math.min(r.minHeight,t.a.y,t.b.y,t.c.y);
    r.maxHeight = Math.max(r.maxHeight,t.a.y,t.b.y,t.c.y);
  });
  const regions = [...groups.values()].filter(r => r.area >= minArea).sort((a,b) => b.area-a.area || a.minHeight-b.minHeight);
  regions.forEach((r,i) => {
    r.id = i+1; r.triangleCount = r.triangles.length; r.center.divideScalar(r.area);
    r.triangles.forEach(t => { t.regionId = r.id; });
  });
  return { regions, comparisons, filteredRegions: groups.size-regions.length };
}
