import test from 'node:test';
import assert from 'node:assert/strict';
import {toolUrl,toolsError,reorderTool} from '../src/lib/tools.js';
import {parseToolMetadata,publicAddress,fetchToolMetadata} from '../server/toolMetadata.js';
import {normalizeState} from '../src/lib/planner.js';
import {migrateExport} from '../src/lib/legacy.js';
import {validateState} from '../server/storage.js';
const tools=[{id:'one',title:'Example',url:'https://example.com/',category:'Design',image:'',icon:''},{id:'two',title:'Code',url:'https://example.org/',category:'Dev'}];
test('tools preserve order, categories and previews across portable state; invalid links fail',()=>{
 assert.equal(toolUrl('example.com'),'https://example.com/');
 for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.com'])assert.throws(()=>toolUrl(url));
 const state=normalizeState({tools});assert.deepEqual(normalizeState(migrateExport(JSON.parse(JSON.stringify(state)))).tools,tools);
 assert.equal(validateState(state),state);assert.deepEqual(normalizeState({}).tools,[]);
 assert.deepEqual(reorderTool(tools,'two',-1).map(t=>t.id),['two','one']);assert.equal(reorderTool(tools,'one',-1),tools);
 for(const bad of [{...tools[0],url:'javascript:alert(1)'},{...tools[0],image:'data:text/html,bad'},{...tools[0],title:''}]){assert.ok(toolsError([bad]));assert.throws(()=>migrateExport({...state,tools:[bad]}));assert.throws(()=>validateState({...state,tools:[bad]}));}
});
test('metadata reads OG and Twitter previews, resolves relative icons and handles missing metadata',()=>{
 const result=parseToolMetadata(`<title>Fallback</title><meta content="Design &amp; Code" property="og:title"><meta property='og:image' content='/cover.jpg'><link rel="icon" href="favicon.png">`,'https://example.com/app');
 assert.equal(result.title,'Design & Code');assert.equal(result.image,'https://example.com/cover.jpg');assert.equal(result.icon,'https://example.com/favicon.png');
 assert.equal(parseToolMetadata('<title>Simple &amp; Useful</title>','https://example.com/').title,'Simple & Useful');assert.equal(parseToolMetadata('','https://example.com/').image,'');
 assert.equal(parseToolMetadata('<meta name="twitter:image" content="javascript:alert(1)">','https://example.com/').image,'');
});
test('preview requests reject local services and non-web schemes',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('93.184.216.34'),true);
 await assert.rejects(fetchToolMetadata('http://127.0.0.1/'),/public website/);await assert.rejects(fetchToolMetadata('file:///etc/passwd'),/HTTP/);
});
