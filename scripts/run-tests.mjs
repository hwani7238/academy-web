import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// Build workers also have live notification and Firebase credentials. Unit
// tests must have a deterministic, isolated environment and never inherit them.
const env={NODE_ENV:'test',TZ:'UTC'};
for(const key of ['PATH','SystemRoot','TMPDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env});
if(result.error)console.error(result.error);
process.exit(result.status??1);
