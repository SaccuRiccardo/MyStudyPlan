import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { toolUrl } from "../src/lib/tools.js";

export function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Only globally routed IPv6 unicast; exclude mapped/local/transition addresses.
  return net.isIP(address) === 6 && /^[23]/i.test(address) && !/^200[12]:/i.test(address);
}
const decode = (text) => text.replace(/&(?:amp|quot|apos|lt|gt|#39|#(\d+)|#x([a-f\d]+));/gi, (all, dec, hex) => dec || hex ? String.fromCodePoint(Math.min(0x10ffff,parseInt(dec || hex, hex ? 16 : 10))) : ({'&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&lt;':'<','&gt;':'>'}[all.toLowerCase()] || all)).trim();
export function parseToolMetadata(html, url) {
  const metadata = {}, links = [];
  const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4])]));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {const a=attrs(match[0]); metadata[(a.property || a.name || '').toLowerCase()] ||= a.content;}
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) links.push(attrs(match[0]));
  const imageUrl = (raw) => { if (!raw) return ''; try { const u = new URL(raw,url); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  return {url, title: decode(metadata['og:title'] || metadata['twitter:title'] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(url).hostname).replace(/\s+/g,' ').slice(0,150), image: imageUrl(metadata['og:image'] || metadata['twitter:image'] || ''), icon: imageUrl(links.find(a=>/^(shortcut )?icon$/i.test(a.rel || ''))?.href || '')};
}
async function readPage(url, deadline, redirects = 0) {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^\[|\]$/g,'');
  const addresses = await lookup(hostname,{all:true});
  if (!addresses.length || addresses.some(a=>!publicAddress(a.address)) || (parsed.port && !['80','443'].includes(parsed.port))) throw new Error('Preview requires a public website. You can still save this link manually.');
  if (Date.now() >= deadline) throw new Error('Preview timed out.');
  const result = await new Promise((resolve,reject)=>{
    const req = (parsed.protocol === 'https:' ? https : http).get(parsed, { headers:{'User-Agent':'StudyOrbit/1.0 (link preview)','Accept':'text/html','Accept-Encoding':'identity'},lookup:(_host,options,cb)=> options.all ? cb(null,addresses) : cb(null,addresses[0].address,addresses[0].family)}, res=>{
      if ([301,302,303,307,308].includes(res.statusCode)) {res.resume();resolve({redirect:res.headers.location});return;}
      if (res.statusCode < 200 || res.statusCode >= 300 || !/text\/html|application\/xhtml/i.test(res.headers['content-type'] || '')) {res.resume();reject(new Error('This site does not provide a readable preview.'));return;}
      let bytes=0; const chunks=[];
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>512*1024)req.destroy(new Error('Preview page is too large.'));else chunks.push(chunk)});
      res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error('Preview timed out.')),Math.max(1,deadline-Date.now()));req.on('close',()=>clearTimeout(timer));req.on('error',reject);
  });
  if (result.redirect) {if(redirects>=3)throw new Error('Too many preview redirects.');return readPage(toolUrl(new URL(result.redirect,url).href),deadline,redirects+1);}
  return parseToolMetadata(result.html,url);
}
export async function fetchToolMetadata(raw) {
  const url=toolUrl(raw);
  return Promise.race([readPage(url,Date.now()+8000),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Preview timed out. You can save the title manually.')),8500);timer.unref();})]);
}
