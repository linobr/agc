import * as THREE from 'three';

export function floorMesh(width=8, depth=8, x=0, y=0, z=0, nx=1, nz=1) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width,depth,nx,nz));
  mesh.rotation.x=-Math.PI/2; mesh.position.set(x,y,z);
  return mesh;
}
export function scanEntries(...meshes) {
  const root=new THREE.Group(); root.add(...meshes); return [{root,kind:'model'}];
}
export function stepScene(height) {
  const floor=floorMesh(12,8);
  const block=new THREE.Mesh(new THREE.BoxGeometry(3,height,6));
  block.position.set(1.5,height/2,0);
  return scanEntries(floor,block);
}
export function benchmarkScene(triangles) {
  const [nx,nz]=triangles===10000 ? [100,50] : triangles===50000 ? [250,100] : [250,200];
  return scanEntries(floorMesh(100,100,0,0,0,nx,nz));
}
