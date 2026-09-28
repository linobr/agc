import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export const triangleCount = g => (g.index?.count ?? g.attributes.position.count) / 3;
export const PROXY_WORLD_ERROR_LIMIT = 0.025;

// Keep the source's attributes, including UVs and normals, exactly at surviving vertices.
function compact(source, indices, groups) {
  const geometry=new THREE.BufferGeometry(), remap=new Map(), vertices=[], output=[];
  for(const id of indices) {
    if(!remap.has(id)) { remap.set(id,vertices.length); vertices.push(id); }
    output.push(remap.get(id));
  }
  for(const [name,a] of Object.entries(source.attributes)) {
    const data=new Float32Array(vertices.length*a.itemSize);
    for(let i=0;i<vertices.length;i++) for(let j=0;j<a.itemSize;j++) data[i*a.itemSize+j]=a.getComponent(vertices[i],j);
    geometry.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize));
  }
  geometry.setIndex(output);
  for(const group of groups) geometry.addGroup(group.start,group.count,group.materialIndex);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
export async function optimizeVisual(analysis, base, settings, progress=()=>{}) {
  if(analysis.limited) throw new Error('Optimization requires a supported static scan within the 600k triangle limit.');
  await MeshoptSimplifier.ready;
  if(!MeshoptSimplifier.supported) throw new Error('WebAssembly simplification is unavailable. Cleaned remains available.');
  const started=performance.now(), source=base?.geometries || analysis.records.map(r=>r.geometry);
  const total=source.reduce((n,g)=>n+triangleCount(g),0), ratio=Math.min(1,settings.target/total);
  const geometries=[]; let triangles=0, error=0;
  try {
    for(const [i,g] of source.entries()) {
      progress(`Optimizing render mesh ${i+1}/${source.length} · target ${settings.target.toLocaleString()}`); await pause();
      const position=g.attributes.position, positions=new Float32Array(position.count*3);
      for(let j=0;j<position.count;j++) for(let k=0;k<3;k++) positions[j*3+k]=position.getComponent(j,k);
      const attributes=['normal','uv','color'].filter(name=>g.attributes[name]);
      const stride=attributes.reduce((n,name)=>n+g.attributes[name].itemSize,0), weights=[];
      for(const name of attributes) for(let k=0;k<g.attributes[name].itemSize;k++) weights.push(name==='uv' ? 2 : 1);
      const values=new Float32Array(position.count*stride);
      for(let j=0;j<position.count;j++) {
        let offset=j*stride;
        for(const name of attributes) for(let k=0;k<g.attributes[name].itemSize;k++) values[offset++]=g.attributes[name].getComponent(j,k);
        if(j%30000===29999) await pause();
      }
      const indices=g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({length:position.count},(_,j)=>j);
      const groups=g.groups.length ? g.groups : [{start:0,count:indices.length,materialIndex:0}];
      const result=[], outputGroups=[];
      for(const group of groups) {
        const input=indices.slice(group.start,group.start+group.count);
        const target=Math.min(input.length,Math.max(3,Math.floor(input.length/3*ratio)*3));
        let output=input, deviation=0;
        if(target<input.length) {
          [output,deviation]=stride ? MeshoptSimplifier.simplifyWithAttributes(input,positions,3,values,stride,weights,null,target,settings.error,['LockBorder'])
            : MeshoptSimplifier.simplify(input,positions,3,target,settings.error,['LockBorder']);
        }
        // A failed/empty reduction never erases a source material group.
        if(!output.length) output=input;
        outputGroups.push({start:result.length,count:output.length,materialIndex:group.materialIndex});
        for(const index of output) result.push(index);
        error=Math.max(error,deviation);
        await pause();
      }
      const output=compact(g,result,outputGroups); geometries.push(output); triangles+=triangleCount(output);
    }
    return {geometries,triangles,error,target:settings.target,ms:performance.now()-started};
  } catch(error) {geometries.forEach(g=>g.dispose());throw error;}
}

// Position-only collision mesh, independent of visual UV/material seams. Exact welding
// removes attribute duplication, never merges spatially separate parts or fills holes.
export async function buildCollisionProxy(analysis, base, settings, progress=()=>{}) {
  if(analysis.limited) return null;
  const source=base?.geometries || analysis.records.map(r=>r.geometry);
  const total=source.reduce((n,g)=>n+triangleCount(g),0);
  if(!settings.enabled || total<=settings.target) return null;
  await MeshoptSimplifier.ready;
  if(!MeshoptSimplifier.supported) return null;
  const started=performance.now(), positions=[], indices=[], weld=new Map(), v=new THREE.Vector3();
  for(const [i,g] of source.entries()) {
    const p=g.attributes.position, matrix=analysis.records[i].matrix;
    const remap=new Uint32Array(p.count);
    for(let j=0;j<p.count;j++) {
      v.fromBufferAttribute(p,j).applyMatrix4(matrix);
      const key=`${v.x},${v.y},${v.z}`;
      let id=weld.get(key);
      if(id===undefined) {id=positions.length/3;weld.set(key,id);positions.push(v.x,v.y,v.z);}
      remap[j]=id;
      if(j%30000===29999) {progress('Welding collision positions…');await pause();}
    }
    for(let j=0;j<(g.index?.count ?? p.count);j++) indices.push(remap[g.index ? g.index.getX(j) : j]);
  }
  weld.clear(); progress('Simplifying collision proxy · preserving open borders…'); await pause();
  const vertices=Float32Array.from(positions), input=Uint32Array.from(indices);
  const [reduced,error]=MeshoptSimplifier.simplify(input,vertices,3,settings.target*3,settings.error,['LockBorder','ErrorAbsolute']);
  if(!reduced.length || reduced.length>=input.length) return null;
  const sourceGeometry=new THREE.BufferGeometry();sourceGeometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  const geometry=compact(sourceGeometry,reduced,[]); sourceGeometry.dispose();
  const root=new THREE.Group();root.matrixAutoUpdate=false;
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());root.add(mesh);
  return {root,geometry,triangles:reduced.length/3,sourceTriangles:total,error,ms:performance.now()-started};
}
export function proxyForEntry(entry) {
  const scan=entry.scan;
  const proxy=scan?.proxies?.[scan.cleanup.mode==='original' ? 'original' : 'cleaned'];
  if(!scan?.cleanup.proxy.enabled || !proxy) return null;
  entry.root.updateMatrixWorld(true);
  const scale=entry.root.getWorldScale(new THREE.Vector3());
  // A later scale edit must not silently magnify the collision approximation.
  if(proxy.triangles>100000 || proxy.error*Math.max(...scale.toArray().map(Math.abs))>PROXY_WORLD_ERROR_LIMIT) return null;
  proxy.root.matrix.copy(entry.root.matrixWorld);proxy.root.updateMatrixWorld(true);
  return proxy;
}
export function collisionRootFor(entry) { return proxyForEntry(entry)?.root || entry.root; }
export function disposeProxy(proxy) {if(proxy) {proxy.geometry.dispose();proxy.root.children[0].material.dispose();}}
