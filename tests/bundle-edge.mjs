// Dashboard's editor accepts one file. Produce the same source without secret configuration.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../supabase/functions/sst-reports/',import.meta.url);
let pdf=await readFile(new URL('pdf.mjs',root),'utf8'),index=await readFile(new URL('index.ts',root),'utf8');
pdf=pdf.replace("from 'pdf-lib'","from 'npm:pdf-lib@1.17.1'");
index=index.replace("from '@supabase/supabase-js'","from 'npm:@supabase/supabase-js@2.118.0'").replace("import { createReport } from './pdf.mjs';",'');
await mkdir('tmp',{recursive:true});await writeFile('tmp/sst-reports.ts',pdf+'\n'+index);
