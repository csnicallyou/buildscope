import test from 'node:test';
import assert from 'node:assert/strict';
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
const {cumulative,renderLedger}=await import('../ledger.js');
test('initial ledger totals include current facts, not planned values',()=>{
 assert.equal(cumulative('lev','w2'),96.9);
 assert.equal(cumulative('lev','w1'),312);
 assert.equal(cumulative('hov','w2'),0);
});
test('ledger renders actual entries and plan/fact comparison',()=>{
 const html=renderLedger({site:'lev'},[{id:'w2',name:'Подбетонка',unit:'м³',plan:142.6}],[{id:'lev',name:'Левобережная'}]);
 assert.match(html,/Сменный журнал/);
 assert.match(html,/Накопительный план \/ факт/);
 assert.match(html,/Исправить/);
 assert.match(html,/Левобережная/);
});
