import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GameSession, validateGameplay } from '../src/gameplay.js';
import { parseProject } from '../src/project.js';
import { roomFile } from './fixture.js';
const object = (id,type,position=[0,1,0],extra={}) => ({id,name:id,type,position,size:[1,2,1],enabled:true,rules:[],...(type==='goal'?{requireAll:false}:{}),...extra});
const rule = (event,type,extra={}) => ({event,action:{type,...extra}});
const pos=(x=0,y=0,z=0)=>({x,y,z});

test('enter/leave messages, objectives and activation use finite non-cascading events',()=>{
  let now=1000;
  const definitions=[object('trigger','trigger',[0,1,0],{rules:[rule('enter','showMessage',{text:'Hello <script>text</script>'}),rule('enter','activate',{targetId:'target'}),rule('leave','completeObjective',{objective:'Exit visited'}),rule('leave','deactivate',{targetId:'target'})]}),
    object('target','trigger',[0,1,0],{enabled:false,rules:[rule('enter','finishGame')]})];
  const game=new GameSession(definitions,()=>now);
  game.tick(pos(-4)); game.tick(pos()); expect(game.message).toContain('Hello'); expect(game.enabled.get('target')).toBe(true);
  for(let i=0;i<100;i++) game.tick(pos()); expect(game.won).toBe(false); // Activation is not an enter event.
  now=3500; game.tick(pos(4)); expect(game.objectives.has('Exit visited')).toBe(true); expect(game.enabled.get('target')).toBe(false); expect(game.elapsed).toBe(2.5);
  expect(definitions[1].enabled).toBe(false);
});

test('collectibles gate goals; restart resets all runtime state and time',()=>{
  let now=0;
  const defs=[object('coin','collectible',[3,1,0],{rules:[rule('collected','showMessage',{text:'Got it'})]}),object('goal','goal',[0,1,0],{requireAll:true})];
  const game=new GameSession(defs,()=>now);
  game.tick(pos()); expect(game.won).toBe(false); expect(game.message).toContain('Collect all');
  now=1200; game.tick(pos(3)); expect(game.collected.size).toBe(1); expect(game.message).toBe('Got it');
  game.tick(pos(3)); expect(game.collected.size).toBe(1);
  now=2300; game.tick(pos()); expect(game.won).toBe(true); expect(game.elapsed).toBe(2.3);
  now=8000; game.tick(pos()); expect(game.elapsed).toBe(2.3);
  game.restart(); expect(game.collected.size).toBe(0); expect(game.enabled.get('coin')).toBe(true); expect(game.won).toBe(false); expect(game.elapsed).toBe(0);
  const free=new GameSession([object('goal','goal')]); free.tick(pos()); expect(free.won).toBe(true);
});

test('rule finish action and self references cannot recurse; disabled coins still count',()=>{
  const defs=[object('t','trigger',[0,1,0],{rules:[rule('enter','deactivate',{targetId:'t'}),rule('enter','activate',{targetId:'t'}),rule('leave','finishGame')]}),object('c','collectible',[5,1,0],{enabled:false})];
  const game=new GameSession(defs); game.tick(pos()); expect(game.won).toBe(false); expect(game.total).toBe(1);
  game.tick(pos(3)); expect(game.won).toBe(true);
});

test('strict gameplay schema rejects code, unknown events/actions, references and unbounded definitions',()=>{
  const good=object('t','trigger');
  for(const bad of [
    [{...good,rules:[rule('enter','eval',{code:'alert(1)'})]}],
    [{...good,rules:[rule('tick','finishGame')]}],
    [{...good,rules:[rule('enter','activate',{targetId:'missing'})]}],
    [{...good,code:'alert(1)'}], [{...good,collected:true}],
    [{...good,rules:[rule('enter','showMessage',{text:'x'.repeat(501)})]}],
    [{...good,rules:Array.from({length:9},()=>rule('enter','finishGame'))}],
    [good,good], [{...good,size:[0,1,1]}], [null],
    Array.from({length:101},(_,i)=>object(String(i),'collectible')),
  ]) expect(()=>validateGameplay(bad)).toThrow('Invalid AGC project: gameplay');
  expect(()=>validateGameplay([good],new Set(['t']))).toThrow('unique');
});

async function save(page) {
  const pending=page.waitForEvent('download'); await page.locator('#exportBtn').click();
  const file=await pending; const path=test.info().outputPath('game.agc'); await file.saveAs(path); return JSON.parse(await readFile(path,'utf8'));
}
async function open(page,project) {
  await page.locator('#projectInput').setInputFiles({name:'game.agc',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
}
async function editPosition(page,position) {
  for(const [i,axis] of ['x','y','z'].entries()) {const input=page.locator(`#game-position-${axis}`); await input.fill(String(position[i])); await input.press('Tab');}
}
async function teleport(page,x,y,z) {
  // Controlled contact test: runtime uses exactly the same fixed-step event path as keyboard play.
  await page.evaluate(([x,y,z])=>{const p=window.agcDebug.walk.player;p.position.set(x,y,z);p.velocity.set(0,0,0);},[x,y,z]);
}

test('no-code editor builds a game: enter message, collectible, locked goal, restart and editor return',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#fileInput').setInputFiles(roomFile());
  await expect(page.locator('#walkStatus')).toContainText('Spawn found');
  const start=await page.evaluate(()=>window.agcDebug.walk.data.spawn.toArray());
  await page.locator('#addTrigger').click();
  await page.locator('#gameAddRule').click();
  await page.getByLabel('Rule 1 text',{exact:true}).fill('Welcome to the room');await page.getByLabel('Rule 1 text',{exact:true}).press('Tab');
  await page.locator('#addGoal').click();await page.locator('#gameRequireAll').check();
  await page.locator('#addCollectible').click();await editPosition(page,[-4,.7,-3]);
  await page.locator('#gameAddRule').click();await page.getByLabel('Rule 1 action',{exact:true}).selectOption('completeObjective');
  await page.getByLabel('Rule 1 objective',{exact:true}).fill('Find the token');await page.getByLabel('Rule 1 objective',{exact:true}).press('Tab');
  const saved=await save(page);expect(saved.version).toBe(4);expect(saved.gameplay).toHaveLength(3);
  await page.locator('#gameBtn').click();await expect(page.locator('#sceneStatus')).toHaveText('GAME TEST');
  await expect(page.locator('#gameHudCount')).toHaveText('Collectibles: 0 / 1');
  await expect(page.locator('#gameMessage')).toContainText('Collect all items');await expect(page.locator('#gameWin')).toBeHidden();
  // Move out to the collectible and back through the trigger/goal.
  await teleport(page,-4,.01,-3);
  await expect(page.locator('#gameHudCount')).toHaveText('Collectibles: 1 / 1');
  await expect(page.locator('#gameHudObjectives')).toContainText('Find the token');
  const coin=saved.gameplay.find(o=>o.type==='collectible');
  expect(await page.evaluate(id=>window.agcDebug.gameplay.editor.nodes.get(id).visible,coin.id)).toBe(false);
  expect((await save(page)).gameplay).toEqual(saved.gameplay);
  await page.keyboard.press('r');await expect(page.locator('#gameHudCount')).toHaveText('Collectibles: 0 / 1');
  await teleport(page,-4,.01,-3);await expect(page.locator('#gameHudCount')).toHaveText('Collectibles: 1 / 1');
  await page.locator('#gameRestart').click();await expect(page.locator('#gameHudCount')).toHaveText('Collectibles: 0 / 1');
  expect(await page.evaluate(id=>window.agcDebug.gameplay.editor.nodes.get(id).visible,coin.id)).toBe(true);
  await teleport(page,-4,.01,-3);await expect(page.locator('#gameHudCount')).toContainText('1 / 1');
  await teleport(page,...start);await expect(page.locator('#gameWin')).toBeVisible();
  await expect(page.locator('#gameMessage')).toHaveText('Welcome to the room');
  await expect(page.locator('#gameWinStats')).toContainText('Collectibles: 1 / 1');
  await page.locator('#gameWinRestart').click();await expect(page.locator('#gameWin')).toBeHidden();await expect(page.locator('#gameHudCount')).toContainText('0 / 1');
  await page.locator('#gameExit').click();await expect(page.locator('#sceneStatus')).toHaveText('EDITOR MODE');
  await page.locator('#gameObjectSelect').selectOption(coin.id);await editPosition(page,[-3,1,-3]);
  await page.locator('#gameDelete').click();await expect(page.locator('#gameCount')).toHaveText('2/100');
  await page.locator('#addBoxBtn').click();await expect(page.locator('#objectCount')).toHaveText('2');
  expect(errors).toEqual([]);
});

test('v3 roundtrip, v1/v2 migrations and invalid gameplay leave the scene intact',async({page})=>{
  await page.goto('/');await page.locator('#fileInput').setInputFiles(roomFile());await expect(page.locator('#walkStatus')).toContainText('Spawn found');
  await page.locator('#addTrigger').click();await page.locator('#gameAddRule').click();
  await page.locator('#addCollectible').click();
  const saved=await save(page);
  await page.reload();await open(page,saved);await page.locator('#projectScanInput').setInputFiles(roomFile());await expect(page.locator('#projectStatus')).toContainText('Project opened');
  expect((await save(page)).gameplay).toEqual(saved.gameplay);
  for(const version of [1,2]) {
    const old={...saved,version};delete old.gameplay;if(version===1)delete old.walk;
    expect(parseProject(JSON.stringify(old)).version).toBe(4);
    await open(page,old);await page.locator('#projectScanInput').setInputFiles(roomFile());await expect(page.locator('#projectStatus')).toContainText('Project opened');
    await expect(page.locator('#gameCount')).toHaveText('0/100');
    expect((await save(page)).objects).toEqual(saved.objects);
  }
  await open(page,saved);await page.locator('#projectScanInput').setInputFiles(roomFile());await expect(page.locator('#projectStatus')).toContainText('Project opened');
  const bad=structuredClone(saved);bad.gameplay[0].rules[0].action={type:'runJavaScript',code:'document.body.remove()'};
  await open(page,bad);await expect(page.locator('#projectStatus')).toContainText('gameplay action type');
  expect((await save(page)).gameplay).toEqual(saved.gameplay);await expect(page.locator('#objectCount')).toHaveText('1');
});


test('gameplay size edits update the volume; deleting a target removes referencing rules',async({page})=>{
  await page.goto('/');await page.locator('#addTrigger').click();
  await expect(page.locator('#emptyState')).toBeHidden();
  const trigger=await page.locator('#gameObjectSelect').inputValue();
  await page.locator('#gameAddRule').click();await page.getByLabel('Rule 1 action',{exact:true}).selectOption('activate');
  await page.locator('#addCollectible').click();const coin=await page.locator('#gameObjectSelect').inputValue();
  await page.locator('#game-size-x').fill('2');await page.locator('#game-size-x').press('Tab');
  expect(await page.evaluate(id=>window.agcDebug.gameplay.editor.nodes.get(id).scale.x,coin)).toBe(2);
  await page.locator('#gameObjectSelect').selectOption(trigger);await page.getByLabel('Rule 1 target',{exact:true}).selectOption(coin);
  let saved=await save(page);expect(saved.gameplay[0].rules[0].action.targetId).toBe(coin);
  await page.locator('#gameObjectSelect').selectOption(coin);await page.locator('#gameDelete').click();
  saved=await save(page);expect(saved.gameplay).toHaveLength(1);expect(saved.gameplay[0].rules).toEqual([]);
  await open(page,saved);await expect(page.locator('#projectStatus')).toContainText('Project opened');
  await expect(page.locator('#gameCount')).toHaveText('1/100');
});
