import os from 'node:os';
import { analyzeWalk } from '../src/walk.js';
import { benchmarkScene } from '../tests/walk-fixtures.js';

console.log(JSON.stringify({node:process.version,platform:process.platform,cpu:os.cpus()[0].model,runs:3,units:'milliseconds; median of three; no timing assertions'}));
for (const count of [10000,50000,100000]) {
  const entries=benchmarkScene(count), runs=[];
  for(let i=0;i<3;i++) runs.push(analyzeWalk(entries));
  const median=field=>runs.map(d=>d.timings[field]).sort((a,b)=>a-b)[1];
  console.log(JSON.stringify({triangles:count,walkabilityMs:median('walkabilityMs'),regionMs:median('regionMs'),colliderMs:median('colliderMs'),totalMs:median('totalMs'),regions:runs[0].regions.length,references:runs[0].references}));
}
