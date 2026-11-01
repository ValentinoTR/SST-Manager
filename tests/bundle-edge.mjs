// Dashboard's editor accepts one file. Produce the same source without secret configuration.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../supabase/functions/sst-reports/',import.meta.url);
let pdf=await readFile(new URL('pdf.mjs',root),'utf8'),index=await readFile(new URL('index.ts',root),'utf8');
const reliperData=await readFile(new URL('../../../reliper.mjs',root),'utf8');
let reliperPdf=await readFile(new URL('reliper-pdf.mjs',root),'utf8');
reliperPdf=reliperPdf.replace(/^import .*;\r?\n/gm,'');
pdf=pdf.replace("import {createReliperReport} from './reliper-pdf.mjs';",'');
pdf=pdf.replace("from 'pdf-lib'","from 'npm:pdf-lib@1.17.1'");
index=index.replace("from '@supabase/supabase-js'","from 'npm:@supabase/supabase-js@2.118.0'").replace("import { createReport, createMailTest } from './pdf.mjs';",'');
const credentials=await readFile(new URL('../_shared/gmail-credentials.mjs',root),'utf8');
index=index.replace("import { decryptCredential } from '../_shared/gmail-credentials.mjs';",'');
let setup=await readFile(new URL('../sst-gmail-setup/index.ts',root),'utf8');
setup=setup.replace("import { digest, randomToken, encryptCredential } from '../_shared/gmail-credentials.mjs';",'');
await mkdir('tmp',{recursive:true});await writeFile('tmp/sst-reports.ts',reliperData+'\n'+reliperPdf+'\n'+credentials+'\n'+pdf+'\n'+index);
await writeFile('tmp/sst-gmail-setup.ts',credentials+'\n'+setup);
