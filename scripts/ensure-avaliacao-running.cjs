'use strict';
const repo = 'C:\\Users\\suporte\\Documents\\projetos\\avaliacao-desempenho-competencias';
const artifacts = 'C:\\CloudflareMigracao\\preparado-WIN-00NEDIJ1R5P\\artifacts\\avaliacao';
const expected = [
  {name:'avaliacao-api-28081', cwd:repo+'\\backend', exe:'C:\\Users\\suporte\\AppData\\Local\\Programs\\Eclipse Adoptium\\jdk-21\\bin\\java.exe', args:['-jar', artifacts+'\\backend\\avaliacao-desempenho-api-0.0.1-SNAPSHOT.jar', '--spring.config.additional-location=file:C:\\ProgramData\\Rodogarcia\\AvaliacaoDesempenho\\production\\avaliacao-prod.properties', '--server.address=127.0.0.1', '--server.port=28081']},
  {name:'avaliacao-front-38080', cwd:repo+'\\frontend', exe:'C:\\Program Files\\nodejs\\node.exe', args:[repo+'\\frontend\\node_modules\\vite\\bin\\vite.js','preview','--outDir',artifacts+'\\frontend-dist','--host','127.0.0.1','--port','38080','--strictPort']},
];
function selectTargets(rows, restartApi) {
  return expected.map(e => {
    const found=rows.filter(r=>r.name===e.name);
    if(found.length!==1) throw Error('EXPECTED_APPLICATION_NOT_REGISTERED');
    const row=found[0], env=row.pm2_env;
    if(env.pm_exec_path!==e.exe || env.pm_cwd!==e.cwd || env.exec_interpreter!=='none' || JSON.stringify(env.args)!==JSON.stringify(e.args)) throw Error('APPLICATION_DEFINITION_CHANGED');
    if(!['online','stopped','errored'].includes(env.status)) throw Error('APPLICATION_TRANSITION_IN_PROGRESS');
    return {id:env.pm_id,name:e.name,restart:env.status!=='online' || (restartApi && e.name===expected[0].name)};
  });
}
module.exports={selectTargets,expected};
if(require.main===module){
  const apply=process.argv.includes('--apply'), restartApi=process.argv.includes('--restart-api');
  if(process.argv.slice(2).some(a=>!['--apply','--restart-api'].includes(a))){console.log('{"status":"INVALID_ARGUMENTS"}');process.exit(1);}
  const pm2='C:\\Users\\suporte\\AppData\\Roaming\\npm\\node_modules\\pm2';
  const socket=require(pm2+'\\modules\\pm2-axon').socket('req');
  const client=new(require(pm2+'\\modules\\pm2-axon-rpc').Client)(socket);
  let transport,finished=false;
  const timer=setTimeout(()=>finish(1,{status:'RPC_TIMEOUT'}),30000);
  function finish(code,result){if(finished)return;finished=true;clearTimeout(timer);try{socket.close();transport?.destroy();}catch{}console.log(JSON.stringify({...result,daemonSpawned:false,saved:false}));process.exit(code);}
  const call=(method,arg)=>new Promise((resolve,reject)=>client.call(method,arg,(err,rows)=>err?reject(Error('RPC_METHOD_FAILED')):resolve(rows)));
  socket.once('error',()=>finish(1,{status:'RPC_ACCESS_FAILED'}));
  socket.once('connect',async()=>{try{
    const before=await call('getMonitorData',{}), targets=selectTargets(before,restartApi), restarted=[];
    if(apply)for(const target of targets.filter(t=>t.restart)){await call('restartProcessId',{id:target.id});restarted.push(target.name);}
    const after=await call('getMonitorData',{});
    const changedOthers=before.filter(r=>!expected.some(e=>e.name===r.name)).some(r=>!after.some(a=>a.name===r.name && a.pid===r.pid && a.pm2_env.pm_id===r.pm2_env.pm_id));
    if(changedOthers)throw Error('OTHER_RUNTIME_CHANGED_DURING_CHECK');
    finish(0,{status:apply?'APPLICATIONS_ENSURED':'APPLICATIONS_VERIFIED',restarted,otherProcessesPreserved:true});
  }catch(error){finish(1,{status:/^[A-Z_]+$/.test(error.message)?error.message:'CHECK_FAILED'});}});
  transport=socket.connect('\\\\.\\pipe\\rpc.sock');
}
