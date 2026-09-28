import * as THREE from 'three';

// Algorithm version is part of the project format: never silently change saved recipes.
export const DEFAULT_CLEANUP = { algorithm: 1, mode: 'original', auto: false, crop: null, crops: [], offset: [0,0,0], optimization: { target:200000, error:0.001 }, proxy: { enabled:true, target:20000, error:0.01 } };
export const DEFAULT_PRESENTATION = { lighting: 'studio', exposure: 1.05, background: 'light' };
export const SCAN_LIMIT = 600000;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export function validateCleanup(c) {
  const vec = a => Array.isArray(a) && a.length === 3 && a.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6);
  if (!c || c.algorithm !== 1 || !['original','cleaned','optimized'].includes(c.mode) || typeof c.auto !== 'boolean' || !vec(c.offset) ||
      (c.crop !== null && (!c.crop || !['keep','remove'].includes(c.crop.operation) || !vec(c.crop.min) || !vec(c.crop.max) || !c.crop.max.every((n,i) => n > c.crop.min[i]))))
    throw new Error('Invalid AGC project: cleanup settings.');
  if (!Array.isArray(c.crops) || c.crops.length>31 || c.crops.some(b => !b || !['keep','remove'].includes(b.operation) || !vec(b.min) || !vec(b.max) || !b.max.every((n,i)=>n>b.min[i])) ||
      !c.optimization || !Number.isInteger(c.optimization.target) || c.optimization.target<100 || c.optimization.target>600000 || !Number.isFinite(c.optimization.error) || c.optimization.error<0.0001 || c.optimization.error>0.005 ||
      !c.proxy || typeof c.proxy.enabled!=='boolean' || !Number.isInteger(c.proxy.target) || c.proxy.target<100 || c.proxy.target>50000 || !Number.isFinite(c.proxy.error) || c.proxy.error<0.001 || c.proxy.error>0.02)
    throw new Error('Invalid AGC project: optimization, proxy or crop history settings.');
  const box=b=>({operation:b.operation,min:[...b.min],max:[...b.max]});
  return { algorithm:c.algorithm, mode:c.mode, auto:c.auto, offset:[...c.offset], crop:c.crop && box(c.crop), crops:c.crops.map(box),
    optimization:{target:c.optimization.target,error:c.optimization.error}, proxy:{enabled:c.proxy.enabled,target:c.proxy.target,error:c.proxy.error} };
}
export function validatePresentation(p) {
  if (!p || !['studio','neutral','original'].includes(p.lighting) || !['light','dark'].includes(p.background) ||
      typeof p.exposure !== 'number' || !Number.isFinite(p.exposure) || p.exposure < 0.2 || p.exposure > 3)
    throw new Error('Invalid AGC project: presentation settings.');
  return { lighting:p.lighting, exposure:p.exposure, background:p.background };
}
const vertex = (g,i,out) => out.fromBufferAttribute(g.attributes.position, g.index ? g.index.getX(i) : i);
const count = g => (g.index?.count ?? g.attributes.position.count) / 3;
const boundsJSON = b => ({ min:b.min.toArray(), max:b.max.toArray(), dimensions:b.getSize(new THREE.Vector3()).toArray() });

export async function analyzeScan(root, progress = () => {}) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), records = [], components = [];
  let triangles = 0, unsupported = false;
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const geometry = mesh.geometry;
    triangles += count(geometry);
    unsupported ||= !!(mesh.isSkinnedMesh || mesh.isInstancedMesh || Object.keys(geometry.morphAttributes).length);
    records.push({ mesh, geometry, matrix:inverse.clone().multiply(mesh.matrixWorld), components:[], badNormals:false });
  });
  const limited = triangles > SCAN_LIMIT || unsupported;
  let missingNormals = 0, invalidNormals = 0, inconsistentNormals = 0;
  const bounds = new THREE.Box3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), face = new THREE.Vector3();
  let processed = 0;
  for (const record of records) {
    const g = record.geometry, p = g.attributes.position, normals = g.attributes.normal, total = count(g);
    // Recompute bounds from positions rather than trusting GLB accessor metadata.
    g.computeBoundingBox(); bounds.union(g.boundingBox.clone().applyMatrix4(record.matrix));
    if (!normals || record.mesh.userData.agcMissingNormals) { missingNormals++; record.badNormals = true; }
    if (limited) continue;
    const parents = new Int32Array(total); for (let i=0;i<total;i++) parents[i]=i;
    const find = i => { while (parents[i] !== i) { parents[i]=parents[parents[i]]; i=parents[i]; } return i; };
    const owners = new Map();
    // Exact position welding joins UV/normal seams without bridging nearby fragments.
    for (let t=0;t<total;t++) {
      for (let j=0;j<3;j++) {
        vertex(g,t*3+j,a);
        if (!a.toArray().every(Number.isFinite)) throw new Error('Scan contains invalid vertices.');
        const key = `${a.x},${a.y},${a.z}`;
        const previous = owners.get(key);
        if (previous === undefined) owners.set(key,t); else parents[find(t)] = find(previous);
        if (normals) {
          const id = g.index ? g.index.getX(t*3+j) : t*3+j;
          n.fromBufferAttribute(normals,id);
          if (!Number.isFinite(n.lengthSq()) || n.lengthSq()<0.25 || n.lengthSq()>2.25) { invalidNormals++; record.badNormals=true; }
        }
      }
      vertex(g,t*3,a); vertex(g,t*3+1,b); vertex(g,t*3+2,c);
      new THREE.Triangle(a,b,c).getNormal(face);
      if (normals && face.lengthSq()>0) {
        n.set(0,0,0);
        for(let j=0;j<3;j++) n.add(new THREE.Vector3().fromBufferAttribute(normals,g.index ? g.index.getX(t*3+j) : t*3+j));
        if (n.normalize().dot(face)<-0.2) { inconsistentNormals++; record.badNormals=true; }
      }
      if (++processed % 10000 === 0) { progress(`Analyzing connectivity · ${Math.round(processed/triangles*100)}%`); await pause(); }
    }
    owners.clear();
    const groups = new Map();
    record.labels = new Int32Array(total);
    for (let t=0;t<total;t++) {
      const id = find(t);
      if (!groups.has(id)) {
        const part = { id:components.length, triangles:0, area:0, box:new THREE.Box3(), remove:false };
        groups.set(id,part); record.components.push(part); components.push(part);
      }
      const part = groups.get(id); record.labels[t]=part.id; part.triangles++;
      vertex(g,t*3,a).applyMatrix4(record.matrix); vertex(g,t*3+1,b).applyMatrix4(record.matrix); vertex(g,t*3+2,c).applyMatrix4(record.matrix);
      part.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      part.area += new THREE.Triangle(a,b,c).getArea();
      if (t % 10000 === 9999) await pause();
    }
  }
  const main = components.reduce((best,p) => !best || p.area>best.area ? p : best,null);
  let tiny = 0, outliers = 0;
  if (main) {
    const span = main.box.getSize(new THREE.Vector3()).length();
    const expanded = main.box.clone().expandByScalar(span*0.01);
    for (const part of components) {
      if (part===main) continue;
      const isolated = !expanded.intersectsBox(part.box);
      const small = part.area < main.area*0.005 && part.box.getSize(new THREE.Vector3()).length()<span*0.1;
      const far = main.box.distanceToPoint(part.box.getCenter(a))>span*3 && part.area<main.area*0.02;
      if (isolated && small) tiny++;
      if (far) outliers++;
      part.remove = isolated && small || far;
    }
  }
  const looseBounds = !!main && bounds.getSize(a).length()>main.box.getSize(b).length()*2.5;
  const warnings = tiny + outliers + missingNormals + Number(invalidNormals>0) + Number(inconsistentNormals>0) + Number(looseBounds);
  return { records, components, main, triangles, meshes:records.length, bounds:boundsJSON(bounds), tiny, outliers,
    missingNormals, invalidNormals, inconsistentNormals, looseBounds, limited,
    status: limited ? 'Needs cleanup' : warnings>2 ? 'Poor scan quality' : warnings ? 'Needs cleanup' : 'Good' };
}

// Compact all attributes and preserve triangle material groups. No unused vertices
// remain to inflate bounds, collide, or leak into walkability after a crop.
async function filteredGeometry(record, keep, offset, repair) {
  const source = record.geometry, ids = [], remap = new Map(), indices = [], groups = [];
  let currentMaterial = -1;
  for (let t=0;t<count(source);t++) {
    if (keep(t)) {
      const material = source.groups.find(g => t*3>=g.start && t*3<g.start+g.count)?.materialIndex ?? 0;
      if (material!==currentMaterial) { groups.push({start:indices.length,count:0,materialIndex:material}); currentMaterial=material; }
      groups.at(-1).count+=3;
      for(let j=0;j<3;j++) {
        const id = source.index ? source.index.getX(t*3+j) : t*3+j;
        if (!remap.has(id)) { remap.set(id,ids.length); ids.push(id); }
        indices.push(remap.get(id));
      }
    }
    if (t%10000===9999) await pause();
  }
  const g = new THREE.BufferGeometry();
  for (const [name,attr] of Object.entries(source.attributes)) {
    const values = new Float32Array(ids.length*attr.itemSize);
    for(let i=0;i<ids.length;i++) {
      for(let j=0;j<attr.itemSize;j++) values[i*attr.itemSize+j]=attr.getComponent(ids[i],j);
      if(i%30000===29999) await pause();
    }
    g.setAttribute(name,new THREE.BufferAttribute(values,attr.itemSize));
  }
  g.setIndex(indices); for (const group of groups) g.addGroup(group.start,group.count,group.materialIndex);
  const localOffset = new THREE.Vector3().fromArray(offset).applyMatrix3(new THREE.Matrix3().setFromMatrix4(record.matrix).invert());
  g.translate(...localOffset.toArray());
  // Indexed meshes retain their authored seams; non-indexed source remains flat.
  if (repair) g.computeVertexNormals();
  if (g.attributes.normal) {
    const normal=g.attributes.normal, v=new THREE.Vector3();
    for(let i=0;i<normal.count;i++) {
      v.fromBufferAttribute(normal,i);
      if (!Number.isFinite(v.lengthSq()) || v.lengthSq()<1e-12) normal.setXYZ(i,0,1,0);
    }
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
export async function deriveScan(analysis, config, progress = () => {}) {
  validateCleanup(config);
  if (analysis.limited) throw new Error(`Cleanup limit: ${SCAN_LIMIT.toLocaleString()} triangles; static non-instanced meshes only. Original remains available.`);
  const geometries = [], bounds = new THREE.Box3(), v = new THREE.Vector3();
  const crops = [config.crop,...config.crops].filter(Boolean).map(c => ({operation:c.operation, box:new THREE.Box3(new THREE.Vector3().fromArray(c.min),new THREE.Vector3().fromArray(c.max))}));
  let triangles=0;
  const retainedComponents=new Set();
  try {
    for(const [i,record] of analysis.records.entries()) {
      progress(`Building derived geometry · ${i+1}/${analysis.records.length} meshes`); await pause();
      const keep = t => {
        if (config.auto && analysis.components[record.labels[t]]?.remove) return false;
        for(const {operation,box} of crops) {
          let inside=0;
          for(let j=0;j<3;j++) if (box.containsPoint(vertex(record.geometry,t*3+j,v).applyMatrix4(record.matrix))) inside++;
          if(operation==='keep') {if(inside!==3) return false;}
          else {
            if(inside) return false;
            const points=[0,1,2].map(j=>vertex(record.geometry,t*3+j,new THREE.Vector3()).applyMatrix4(record.matrix));
            if(box.intersectsTriangle(new THREE.Triangle(...points))) return false;
          }
        }
        return true;
      };
      const geometry = await filteredGeometry(record,t => {
        const retained=keep(t);
        if(retained && record.labels) retainedComponents.add(record.labels[t]);
        return retained;
      },config.offset,config.auto && record.badNormals);
      geometries.push(geometry); triangles+=count(geometry);
      if (geometry.attributes.position.count) bounds.union(geometry.boundingBox.clone().applyMatrix4(record.matrix));
    }
    if (!triangles) throw new Error('Crop would remove the entire scan. Adjust the box; the previous view is unchanged.');
    return { geometries, triangles, bounds:boundsJSON(bounds), removedComponents:analysis.components.length-retainedComponents.size };
  } catch(error) { geometries.forEach(g=>g.dispose()); throw error; }
}
export function activateScan(analysis, derived, mode, optimized = null) {
  analysis.records.forEach((r,i) => { r.mesh.geometry=mode==='optimized' && optimized ? optimized.geometries[i] : mode!=='original' && derived ? derived.geometries[i] : r.geometry; });
}
export function groundOffset(root, derivedBounds) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(new THREE.Vector3().fromArray(derivedBounds.min),new THREE.Vector3().fromArray(derivedBounds.max)).applyMatrix4(root.matrixWorld);
  const center=box.getCenter(new THREE.Vector3());
  return new THREE.Vector3(-center.x,-box.min.y,-center.z).applyMatrix3(new THREE.Matrix3().setFromMatrix4(root.matrixWorld).invert()).toArray();
}
