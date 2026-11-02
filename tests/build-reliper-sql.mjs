import {readFile,writeFile} from 'node:fs/promises';
import {reliperComponents} from '../reliper.mjs';
import C from '../safety-core.js';
const path=new URL('../supabase/migrations/20261101174432_reliper_vehicle_template.sql',import.meta.url);
let sql=await readFile(path,'utf8');
for(const [name,data] of [['catalog',reliperComponents],['legacy',C.checklist]])sql=sql.replace(new RegExp('/\\*'+name+'\\*/[\\s\\S]*?/\\*end'+name+'\\*/'),'/*'+name+"*/'"+JSON.stringify(data).replaceAll("'","''")+"'/*end"+name+'*/');
await writeFile(path,sql);
