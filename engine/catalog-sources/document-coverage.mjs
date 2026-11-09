import {readFile,writeFile} from 'node:fs/promises';
import {documentedRelationships,serviceExclusions} from '../catalog/relationship-rules.js';
const services=JSON.parse(await readFile(new URL('../catalog/services.json',import.meta.url),'utf8'));
const connected=new Set(documentedRelationships.flatMap(row=>[row.source,row.target]));
const excluded=new Set(serviceExclusions.map(entry=>entry.id));
const pending=services.filter(service=>!connected.has(service.id)&&!excluded.has(service.id)).map(({id,name})=>({id,name}));
const report={total:services.length,connected:services.filter(service=>connected.has(service.id)).length,relationships:documentedRelationships.length,pending,excluded:serviceExclusions};
await writeFile(new URL('./relationship-coverage.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`${report.connected}/${report.total} catalog entries connected; ${pending.length} pending research; ${serviceExclusions.length} explained exclusions; ${report.relationships} documented relationships.`);
