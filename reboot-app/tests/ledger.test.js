import test from 'node:test';
import assert from 'node:assert/strict';
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
const {cumulative,renderLedger}=await import('../ledger.js');
test('new journal starts without invented facts',()=>{
 assert.equal(cumulative('los','w2'),0);
 assert.equal(cumulative('mal','w1'),0);
});
test('empty journal renders source-based entry form',()=>{
 const html=renderLedger({site:'los'},[{id:'w1',name:'Работа по наряду',unit:'м³',plan:12}],[{id:'los',name:'Лось'}]);
 assert.match(html,/Сменный журнал/);
 assert.match(html,/Накопительный план \/ факт/);
 assert.match(html,/Записей пока нет/);
 assert.match(html,/Лось/);
});
