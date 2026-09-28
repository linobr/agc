// Deliberately finite vocabulary. Actions change state but never emit events.
export const GAME_TYPES = ['trigger', 'goal', 'collectible'];
export const ACTION_TYPES = ['showMessage', 'activate', 'deactivate', 'completeObjective', 'finishGame'];
export const GAME_LIMITS = { objects: 100, rules: 8, name: 100, message: 500, objective: 100 };
const check = (ok, message) => { if (!ok) throw new Error(`Invalid AGC project: gameplay ${message}.`); };
function keys(value, allowed) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'expected an object');
  check(Object.keys(value).every(k => allowed.includes(k)), 'unknown field (code and runtime fields are not allowed)');
}
const string = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function validateGameplay(definitions, sceneIds = new Set()) {
  check(Array.isArray(definitions) && definitions.length <= GAME_LIMITS.objects, 'must contain at most 100 objects');
  const ids = new Set(sceneIds), gameplayIds = new Set();
  for (const o of definitions) {
    keys(o, ['id','name','type','position','size','enabled','rules', ...(o?.type === 'goal' ? ['requireAll'] : [])]);
    check(string(o.id,100) && !ids.has(o.id), 'object IDs must be unique'); ids.add(o.id); gameplayIds.add(o.id);
    check(string(o.name,GAME_LIMITS.name), 'name'); check(GAME_TYPES.includes(o.type), 'object type');
    check(typeof o.enabled === 'boolean', 'enabled flag');
    for (const [key,min,max] of [['position',-1e6,1e6],['size',0.1,100]])
      check(Array.isArray(o[key]) && o[key].length === 3 && o[key].every(n => typeof n === 'number' && Number.isFinite(n) && n>=min && n<=max), key);
    check(Array.isArray(o.rules) && o.rules.length <= GAME_LIMITS.rules, 'at most eight rules per object');
    if (o.type === 'goal') { check(typeof o.requireAll === 'boolean', 'goal requireAll flag'); check(o.rules.length === 0, 'goals use the built-in win condition'); }
  }
  for (const o of definitions) for (const rule of o.rules) {
    keys(rule,['event','action']);
    check((o.type === 'trigger' ? ['enter','leave'] : o.type === 'collectible' ? ['collected'] : []).includes(rule.event), 'event type');
    const a = rule.action;
    check(a && ACTION_TYPES.includes(a.type), 'action type');
    keys(a, a.type === 'showMessage' ? ['type','text'] : a.type === 'completeObjective' ? ['type','objective'] : ['activate','deactivate'].includes(a.type) ? ['type','targetId'] : ['type']);
    if (a.type === 'showMessage') check(string(a.text,GAME_LIMITS.message), 'message (1–500 characters)');
    if (a.type === 'completeObjective') check(string(a.objective,GAME_LIMITS.objective), 'objective (1–100 characters)');
    if (['activate','deactivate'].includes(a.type)) check(gameplayIds.has(a.targetId), 'action target ID must reference a gameplay object');
  }
  return definitions;
}
function touching(o, p) {
  return Math.abs(p.x-o.position[0]) <= o.size[0]/2+0.3 &&
    Math.abs(p.z-o.position[2]) <= o.size[2]/2+0.3 &&
    p.y <= o.position[1]+o.size[1]/2 && p.y+1.8 >= o.position[1]-o.size[1]/2;
}
export class GameSession {
  constructor(definitions, clock = () => performance.now()) {
    validateGameplay(definitions);
    this.definitions = structuredClone(definitions); this.clock = clock; this.restart();
  }
  restart() {
    this.enabled = new Map(this.definitions.map(o => [o.id,o.enabled]));
    this.inside = new Map(); this.collected = new Set(); this.objectives = new Set();
    this.total = this.definitions.filter(o => o.type === 'collectible').length;
    this.message = ''; this.won = false; this.elapsed = 0; this.started = this.clock();
  }
  finish() { this.won = true; this.elapsed = Math.max(0,(this.clock()-this.started)/1000); }
  act(a) {
    switch(a.type) {
      case 'showMessage': this.message = a.text; break;
      case 'activate': this.enabled.set(a.targetId,true); break;
      case 'deactivate': this.enabled.set(a.targetId,false); break;
      case 'completeObjective': this.objectives.add(a.objective); break;
      case 'finishGame': this.finish(); break;
    }
  }
  tick(position) {
    if (this.won) return;
    this.elapsed = Math.max(0,(this.clock()-this.started)/1000);
    const events = [], active = new Map(this.enabled);
    // All contacts are sampled before actions. Enabling an occupied zone does not synthesize enter.
    for (const o of this.definitions) {
      const inside = touching(o,position), wasInside = this.inside.get(o.id) || false;
      this.inside.set(o.id,inside);
      if (!active.get(o.id)) continue;
      if (o.type === 'collectible' && inside && !this.collected.has(o.id)) {
        this.collected.add(o.id); this.enabled.set(o.id,false); events.push([o,'collected']);
      } else if (o.type === 'trigger') {
        if (inside && !wasInside) events.push([o,'enter']);
        if (!inside && wasInside) events.push([o,'leave']);
      }
    }
    for (const [o,event] of events) {
      for (const rule of o.rules) {
        if (this.won) break;
        if (rule.event === event) this.act(rule.action);
      }
    }
    // Check goals after pickups/actions so a final pickup inside a goal can unlock it.
    for (const o of this.definitions) if (!this.won && o.type === 'goal' && this.enabled.get(o.id) && this.inside.get(o.id)) {
      if (!o.requireAll || this.collected.size === this.total) this.finish();
      else this.message = `Collect all items first (${this.collected.size}/${this.total}).`;
    }
  }
}
