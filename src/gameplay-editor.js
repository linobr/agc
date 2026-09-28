import * as THREE from 'three';
import { ACTION_TYPES, GAME_LIMITS, validateGameplay } from './gameplay.js';
const $ = id => document.getElementById(id);
const colors = { trigger:0x3485dd, goal:0x23a965, collectible:0xe8ae26 };
const labels = { showMessage:'Show message', activate:'Activate object', deactivate:'Deactivate object', completeObjective:'Mark objective complete', finishGame:'Finish game' };
const option = (value,text) => { const o=document.createElement('option'); o.value=value; o.textContent=text; return o; };

export class GameplayEditor {
  constructor(scene, { busy, select, position, notify, change }) {
    this.group=new THREE.Group(); scene.add(this.group); this.definitions=[]; this.nodes=new Map(); this.selectedId=null;
    this.busy=busy; this.onSelect=select; this.position=position; this.notify=notify; this.onChange=change;
    for (const type of ['trigger','goal','collectible']) $(`add${type[0].toUpperCase()+type.slice(1)}`).onclick=()=>this.add(type);
    $('gameObjectSelect').onchange=()=>this.select($('gameObjectSelect').value || null);
    $('gameDelete').onclick=()=>this.remove();
    $('gameName').onchange=()=>this.edit(o=>{ const name=$('gameName').value.trim(); if (!name || name.length>100) throw new Error('Use a name with 1–100 characters.'); o.name=name; });
    $('gameEnabled').onchange=()=>this.edit(o=>{o.enabled=$('gameEnabled').checked;});
    $('gameRequireAll').onchange=()=>this.edit(o=>{o.requireAll=$('gameRequireAll').checked;});
    for (const field of ['position','size']) for (const axis of ['x','y','z']) $(`game-${field}-${axis}`).onchange=()=>this.edit(o=>{
      const values=['x','y','z'].map(a=>$(`game-${field}-${a}`).value === '' ? NaN : Number($(`game-${field}-${a}`).value));
      const [min,max]=field==='size' ? [.1,100] : [-1e6,1e6];
      if (!values.every(n=>Number.isFinite(n) && n>=min && n<=max)) throw new Error(`${field}: use values from ${min} to ${max}.`);
      o[field]=values;
    });
    $('gameAddRule').onclick=()=>this.edit(o=>{ if(o.rules.length<8) o.rules.push({event:o.type==='trigger'?'enter':'collected',action:{type:'showMessage',text:'You found something!'}}); });
    this.render();
  }
  get selected() { return this.definitions.find(o=>o.id===this.selectedId); }
  add(type) {
    if(this.busy()) return;
    if(this.definitions.length>=GAME_LIMITS.objects) return this.notify('Maximum 100 gameplay objects.');
    const base=this.position();
    const o={id:crypto.randomUUID(),name:`${type[0].toUpperCase()+type.slice(1)} ${this.definitions.length+1}`,type,
      position:[base.x,base.y+(type==='collectible'?.7:1),base.z],size:type==='collectible'?[.5,.5,.5]:[2,2,2],enabled:true,rules:[],
      ...(type==='goal'?{requireAll:false}:{})};
    this.definitions.push(o); this.createNode(o); this.select(o.id); this.onChange();
  }
  createNode(o) {
    const root=new THREE.Group(); root.userData.gameId=o.id;
    const geometry=o.type==='collectible'?new THREE.OctahedronGeometry(.5):new THREE.BoxGeometry(1,1,1);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:colors[o.type],transparent:true,opacity:o.type==='collectible'?.9:.18,depthWrite:false}));
    root.add(mesh,new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:colors[o.type]})));
    this.nodes.set(o.id,root); this.group.add(root); this.updateNode(o);
  }
  updateNode(o) { const root=this.nodes.get(o.id); root.position.fromArray(o.position); root.scale.fromArray(o.size); root.updateMatrixWorld(true); }
  disposeNode(root) { root.traverse(n=>{n.geometry?.dispose();n.material?.dispose();}); this.group.remove(root); }
  load(definitions) {
    validateGameplay(definitions);
    for(const n of this.nodes.values()) this.disposeNode(n);
    this.nodes.clear(); this.definitions=structuredClone(definitions); this.selectedId=null;
    for(const o of this.definitions) this.createNode(o);
    this.render(); this.sync();
  }
  select(id, announce=true) {
    if(this.busy()) return;
    this.selectedId=id;
    if(id && announce) this.onSelect();
    this.render(); this.sync();
  }
  pick(raycaster) {
    const hit=raycaster.intersectObjects(this.group.children,true)[0];
    return hit ? {id:hit.object.parent.userData.gameId,distance:hit.distance} : null;
  }
  edit(change) {
    if(this.busy() || !this.selected) return;
    const old=structuredClone(this.selected);
    try { change(this.selected); validateGameplay(this.definitions); this.updateNode(this.selected); }
    catch(error) { Object.assign(this.selected,old); this.notify(error.message); }
    this.render(); this.sync();
  }
  remove() {
    if(this.busy() || !this.selected) return;
    const id=this.selectedId; let removed=0;
    this.definitions=this.definitions.filter(o=>o.id!==id);
    for(const o of this.definitions) o.rules=o.rules.filter(r=>{ if(r.action.targetId===id){removed++;return false;} return true; });
    this.disposeNode(this.nodes.get(id)); this.nodes.delete(id); this.selectedId=null; this.render(); this.onChange();
    if(removed) this.notify(`Deleted object and ${removed} referencing rule(s).`);
  }
  render() {
    $('gameObjectSelect').replaceChildren(option('','Select gameplay object'),...this.definitions.map(o=>option(o.id,`${o.name} · ${o.type}`)));
    $('gameObjectSelect').value=this.selectedId || '';
    const o=this.selected; $('gameProperties').hidden=!o; $('gameCount').textContent=`${this.definitions.length}/100`;
    if(!o) return;
    $('gameName').value=o.name; $('gameEnabled').checked=o.enabled;
    for(const field of ['position','size']) ['x','y','z'].forEach((a,i)=>{$(`game-${field}-${a}`).value=o[field][i];});
    $('gameGoalOptions').hidden=o.type!=='goal'; $('gameRequireAll').checked=!!o.requireAll;
    $('gameRuleSection').hidden=o.type==='goal'; $('gameRules').replaceChildren();
    $('gameAddRule').disabled=o.rules.length>=8;
    o.rules.forEach((rule,i)=>{
      const row=document.createElement('div'); row.className='game-rule';
      const event=document.createElement('select'); event.setAttribute('aria-label',`Rule ${i+1} event`);
      for(const v of o.type==='trigger'?['enter','leave']:['collected']) event.append(option(v,{enter:'Player enters zone',leave:'Player leaves zone',collected:'Collectible collected'}[v]));
      event.value=rule.event; event.onchange=()=>this.edit(o=>{o.rules[i].event=event.value;});
      const action=document.createElement('select'); action.setAttribute('aria-label',`Rule ${i+1} action`);
      for(const type of ACTION_TYPES) action.append(option(type,labels[type])); action.value=rule.action.type;
      action.onchange=()=>this.edit(o=>{ const type=action.value; o.rules[i].action={type,...(type==='showMessage'?{text:'You found something!'}:type==='completeObjective'?{objective:'Find the exit'}:['activate','deactivate'].includes(type)?{targetId:o.id}:{})}; });
      row.append(event,action);
      const a=rule.action;
      if(['activate','deactivate'].includes(a.type)) {
        const target=document.createElement('select'); target.setAttribute('aria-label',`Rule ${i+1} target`);
        for(const targetObject of this.definitions) target.append(option(targetObject.id,targetObject.name));
        target.value=a.targetId; target.onchange=()=>this.edit(o=>{o.rules[i].action.targetId=target.value;}); row.append(target);
      } else if(['showMessage','completeObjective'].includes(a.type)) {
        const input=document.createElement('input'), field=a.type==='showMessage'?'text':'objective';
        input.setAttribute('aria-label',`Rule ${i+1} ${field}`); input.maxLength=field==='text'?500:100; input.value=a[field];
        input.onchange=()=>this.edit(o=>{o.rules[i].action[field]=input.value;}); row.append(input);
      }
      const remove=document.createElement('button'); remove.textContent='Remove rule'; remove.className='quiet-button'; remove.onclick=()=>this.edit(o=>o.rules.splice(i,1)); row.append(remove);
      $('gameRules').append(row);
    });
  }
  sync(session=null) {
    for(const o of this.definitions) {
      const root=this.nodes.get(o.id);
      root.visible=!session || (session.enabled.get(o.id) && !session.collected.has(o.id));
      root.children[0].material.opacity=!session && !o.enabled ? .06 : o.type==='collectible'?.9:.18;
      const color=!session && this.selectedId===o.id ? 0xff4400 : session && o.type==='goal' && o.requireAll && session.collected.size<session.total ? 0xee9933 : colors[o.type];
      root.children[1].material.color.set(color);
    }
  }
  lock(locked) { $('gameEditorFields').disabled=locked; }
}
