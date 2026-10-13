'use strict';
const assert=require('node:assert/strict');
const {selectTargets,expected}=require('./ensure-avaliacao-running.cjs');
const rows=()=>expected.map((e,i)=>({name:e.name,pid:100+i,pm2_env:{pm_id:i,pm_exec_path:e.exe,pm_cwd:e.cwd,exec_interpreter:'none',args:[...e.args],status:'online'}}));
assert.deepEqual(selectTargets(rows(),false).map(r=>r.restart),[false,false]);
assert.deepEqual(selectTargets(rows(),true).map(r=>r.restart),[true,false]);
const stopped=rows();stopped[0].pm2_env.status='stopped';stopped[1].pm2_env.status='errored';
assert.deepEqual(selectTargets(stopped,false).map(r=>r.restart),[true,true]);
assert.throws(()=>selectTargets([],false),/NOT_REGISTERED/);
const duplicate=rows();duplicate.push(duplicate[0]);assert.throws(()=>selectTargets(duplicate,false),/NOT_REGISTERED/);
for(const key of ['pm_exec_path','pm_cwd','exec_interpreter']){const changed=rows();changed[0].pm2_env[key]='unexpected';assert.throws(()=>selectTargets(changed,true),/DEFINITION_CHANGED/);}
const args=rows();args[0].pm2_env.args.push('--unexpected');assert.throws(()=>selectTargets(args,false),/DEFINITION_CHANGED/);
const transition=rows();transition[0].pm2_env.status='launching';assert.throws(()=>selectTargets(transition,true),/TRANSITION/);
const unrelated=rows();unrelated.push({name:'other-project',pid:999,pm2_env:{pm_id:99,status:'errored'}});
assert.deepEqual(selectTargets(unrelated,true).map(r=>r.name),expected.map(e=>e.name));
console.log('11 runtime selection checks passed; no RPC or process mutation.');
