import {spawnSync,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('tmp/legacy-baseline',{recursive:true});
for(const file of ['metrics.js','metrics.test.js','reports.js','reports.test.js'])await writeFile('tmp/legacy-baseline/'+file,execFileSync('git',['show','HEAD:'+file]));
const run=cwd=>{const r=spawnSync(process.execPath,['--test','metrics.test.js','reports.test.js'],{cwd,encoding:'utf8'}),out=r.stdout+'\n'+r.stderr;return{exit:r.status,summary:out.split('\n').filter(line=>/^ℹ (tests|pass|fail)/.test(line)),failures:[...out.matchAll(/^✖ (.+?) \(/gm)].map(m=>m[1]).sort()};};
const before=run('tmp/legacy-baseline'),after=run('.');console.log(JSON.stringify({before,after,unchanged:JSON.stringify(before)===JSON.stringify(after)},null,2));
if(JSON.stringify(before)!==JSON.stringify(after))process.exitCode=1;
