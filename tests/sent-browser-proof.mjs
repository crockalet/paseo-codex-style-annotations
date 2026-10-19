import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const dir=process.env.SENT_PROOF_DIR??'/tmp/paseo-annotations-extension/sent-flash-proof';
fs.mkdirSync(dir,{recursive:true});
const repo=process.env.SENT_REPO??new URL('..',import.meta.url).pathname;
const req=createRequire(repo+'/package.json');
const source=fs.readFileSync('/Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web/index-a0a678d83bffdc3214916815ddd23799.js','utf8');
const registry=source.split(/(?=__d\(function\()/).flatMap(c=>{if(!c.startsWith('__d(function('))return [];const e=c.match(/\},\d+,\[[\d,]*\]\);/);return e?[c.slice(0,e.index+e[0].length)]:[];}).join('\n');
const output=await req('esbuild').build({stdin:{contents:`export {installSentQuotes} from '${repo}/client/sent-quotes';export {inspectSentNative,discoverSentNative,SENT_MODULES} from '${repo}/client/sent-native';export {resolveModuleIds} from '${repo}/client/host-draft-bridge';`,resolveDir:repo},bundle:true,write:false,format:'iife',globalName:'Probe'});
const {chromium}=await import(pathToFileURL('/tmp/omp-role-browser-check/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu']});
const results=[];
try{
for(const scenario of ['warm-ready','warm-pending-id','warm-pending-no-id','warm-pending-null-id','warm-no-id-only','warm-null-id-only','cold-ready','warm-remount','props-only-invalid-to-valid']){
const page=await browser.newPage({viewport:{width:900,height:500}});const errors=[];page.on('pageerror',e=>errors.push(e.stack??String(e)));
await page.route('http://localhost/**',route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('.js')?registry:'<!doctype html><style>body{background:#fff;color:#222;font:14px Arial}main{width:780px;padding:32px;display:flex;flex-direction:column}</style><main id="fixture"></main><script src="/bundle.js"></script>'}));
await page.addInitScript(()=>{const registry=new Map(),cache=new Map(),overrides=new Map();window.__d=(factory,id,deps)=>registry.set(id,{factory,deps});window.__r=id=>{if(overrides.has(id))return overrides.get(id);if(cache.has(id))return cache.get(id).exports;const rec=registry.get(id);if(!rec)throw Error('Unregistered '+id);const mod={exports:{}};cache.set(id,mod);rec.factory(window,window.__r,undefined,undefined,mod,mod.exports,rec.deps);return mod.exports;};window.__registry=registry;window.__overrides=overrides;});
await page.goto('http://localhost/probe');await page.addScriptTag({content:output.outputFiles[0].text});
await page.evaluate(({source,scenario})=>{
const r=window.__r,o=window.__overrides,React=r(37),DOM=r(388),ids=Probe.resolveModuleIds(source,Probe.SENT_MODULES);
window.__source=source;
const nothing=()=>null;const generic=new Proxy(nothing,{get:(t,k)=>k==='__esModule'?true:k==='prototype'?t.prototype:generic});
const messageRec=window.__registry.get(ids.message);for(const id of messageRec.deps)if(![899,900,901,457,37,281,58,4728,857,1220,884,4221,4731,4606,4726].includes(id))o.set(id,generic);
for(const id of [226,429,236,148,1221,1145,4222])o.set(id,generic);
const flatten=s=>Array.isArray(s)?Object.assign({},...s.map(flatten)):s||{};
const style=s=>{const out={};for(const [k,v] of Object.entries(flatten(s))){if(k==='uni__dependencies')continue;if(k==='paddingHorizontal'){out.paddingLeft=v;out.paddingRight=v;}else if(k==='paddingVertical'){out.paddingTop=v;out.paddingBottom=v;}else if(k==='backgroundColor')out.backgroundColor=v;else if(k==='borderWidth'){out.borderWidth=v;out.borderStyle='solid';}else out[k]=v;}return out;};
function View({children,style:s,testID,dataSet,...p}){const attrs=Object.fromEntries(Object.entries(p).filter(([k])=>k.startsWith('aria-')||k.startsWith('onPointer')));if(dataSet)for(const[k,v]of Object.entries(dataSet))attrs['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=v;return React.createElement('div',{...attrs,'data-testid':testID,style:{display:'flex',flexDirection:'column',...style(s)}},children);}
function Text({children,style:s,testID,dataSet}){return React.createElement('span',{'data-testid':testID,...(dataSet?{'data-message-text':'true'}:{}),style:style(s)},children);}
o.set(899,{View});o.set(900,{Text});o.set(901,{Pressable:({children,onPress})=>React.createElement('button',{onClick:onPress},children)});
const scale=new Proxy({sm:6,md:8,'2xl':14,base:14,content:14},{get:(t,k)=>t[k]??Number(k)*4});const colors=new Proxy({foreground:'#222',foregroundMuted:'#666',borderAccent:'#ccc',surface1:'#fafafa',surface3:'#eee',palette:new Proxy({},{get:()=>scale})},{get:(t,k)=>t[k]??'#eee'});const theme={colors,spacing:scale,fontSize:scale,borderRadius:scale,borderWidth:scale,fontWeight:scale,fontFamily:{ui:"Arial",mono:"monospace"}};
o.set(58,{withUnistyles:x=>x??nothing,StyleSheet:{create:f=>typeof f==='function'?f(theme):f},useUnistyles:()=>({theme})});o.set(884,{isWeb:true,isNative:false});o.set(1220,{useIsCompactFormFactor:()=>false});o.set(857,{useTranslation:()=>({t:s=>s})});o.set(4731,{useRewindAgentMutation:()=>({isPending:false})});o.set(4606,{formatMessageTimestamp:()=>''});o.set(4221,{AttachmentLightbox:nothing});
o.set(4726,{getAgentAttachmentPillContent:a=>({title:a.externalResource.title,subtitle:`${a.externalResource.providerLabel} ${a.externalResource.identifier}`,icon:null})});
const message=r(ids.message),attachment=r(ids.attachment),cap=Probe.inspectSentNative(message,attachment);window.__cap=cap;
const quote={type:'text',mimeType:'text/plain',text:'Selected text\n\nComment',externalResource:{provider:'quote-notes',resourceType:'quote',id:'b01259d1-5ecb-4365-a7e7-fb8647c8d52a',identifier:'quote-b01259d1-5ecb-4365-a7e7-fb8647c8d52a',title:'Selected text',providerLabel:'引用'}};
let props={serverId:'fixture',agentId:'fixture',messageId:'m-1',message:'',images:[],attachments:[quote],timestamp:0,isPending:scenario.startsWith('warm-pending')};if(scenario==='warm-pending-null-id'||scenario==='warm-null-id-only'||scenario==='props-only-invalid-to-valid')props.messageId=null;if(scenario==='warm-pending-no-id'||scenario==='warm-no-id-only')delete props.messageId;
const root=DOM.createRoot(document.querySelector('main'));let key='a';window.__render=()=>root.render(React.createElement('div',{'data-message-id':'stream-row',style:{display:'flex',flexDirection:'column'}},React.createElement(message.UserMessage,{...props,key})));
let resolveDiscovery;window.__discoveryReady=false;const discovery=new Promise(resolve=>resolveDiscovery=()=>{window.__discoveryReady=true;resolve(cap);});window.__resolveDiscovery=resolveDiscovery;
window.__allowAck=scenario!=='warm-pending-no-id';let tickCount=0;const origInterval=window.setInterval;window.setInterval=(fn,ms,...args)=>origInterval(()=>{tickCount++;fn(...args);},ms);
const originalFetch=window.fetch.bind(window);if(scenario==='cold-ready')window.fetch=async(...args)=>{await discovery;return originalFetch(...args);};window.__stop=Probe.installSentQuotes({discover:scenario==='cold-ready'?async signal=>{window.__discoveryReady=false;const found=await Probe.discoverSentNative(signal);window.__discoveryReady=true;return found;}:()=>discovery});
window.__frames=[];window.__events=[];window.__done=false;const start=performance.now();let frame=0,ackFrame=null,phase='initial',stable=0;
const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
function sample(t){frame++;const native=document.querySelector('[data-testid="user-message"]'),capsule=document.querySelector('[data-paseo-sent-quotes="capsule"]');const record={frame,ms:Math.round((performance.now()-start)*100)/100,phase,ready:window.__discoveryReady,pending:props.isPending,messageId:props.messageId??null,messageIdKind:typeof props.messageId,busy:native?.getAttribute('aria-busy')??null,nativeVisible:visible(native),capsuleVisible:visible(capsule),intervals:tickCount};window.__frames.push(record);
if(props.isPending&&capsule&&window.__pendingCapsule===undefined){window.__pendingCapsule=capsule;const popup=document.querySelector('[data-paseo-sent-quotes="popup"]');window.__pendingPanel=popup.shadowRoot.querySelector('.panel');capsule.shadowRoot.querySelector('button').click();window.__pendingBusy=capsule.getAttribute('aria-busy');window.__pendingLabel=window.__pendingPanel.getAttribute('aria-label');}

if(scenario==='cold-ready'&&frame===5){resolveDiscovery();window.__discoveryReady=false;window.__events.push({kind:'discovery-fetch-unblocked',frame,ms:record.ms});}
if((scenario.startsWith('warm-pending')||scenario==='warm-null-id-only'||scenario==='warm-no-id-only')&&frame>=5&&window.__allowAck&&phase==='initial'){props={...props,isPending:false,messageId:'m-1'};phase='ack';ackFrame=frame;window.__render();window.__events.push({kind:'ack-render',frame,ms:record.ms});}
if(scenario==='props-only-invalid-to-valid'&&frame===5){props={...props,messageId:'m-1'};phase='props-only';window.__render();window.__events.push({kind:'props-only-render',frame,ms:record.ms});}
if(scenario==='warm-remount'&&frame===5){key='b';phase='remount';window.__render();window.__events.push({kind:'remount-render',frame,ms:record.ms});}
if(record.capsuleVisible)stable++;else stable=0;
const doneAfter=scenario==='warm-ready'?3:8;if(frame>=doneAfter&&stable>=3&&(!scenario.startsWith('warm-pending')||phase==='ack')){window.__done=true;return;}
if(frame>160){window.__done=true;window.__timeout=true;return;}requestAnimationFrame(sample);}
requestAnimationFrame(sample);if(scenario!=='cold-ready')resolveDiscovery();window.__render();
},{source,scenario});
if(scenario==='warm-pending-no-id'){await page.waitForFunction(()=>window.__frames.some(x=>x.busy==='true'&&x.capsuleVisible));await page.screenshot({path:dir+'/pending-capsule.png'});await page.evaluate(()=>window.__allowAck=true);}await page.waitForFunction(()=>window.__done,{},{timeout:8000});
const result=await page.evaluate(()=>({frames:window.__frames,events:window.__events,timeout:window.__timeout??false,html:document.querySelector('main').innerHTML,promotion:window.__pendingCapsule?{sameCapsule:window.__pendingCapsule===document.querySelector('[data-paseo-sent-quotes="capsule"]'),samePanel:window.__pendingPanel===document.querySelector('[data-paseo-sent-quotes="popup"]').shadowRoot.querySelector('.panel'),open:!window.__pendingPanel.hidden,pendingBusy:window.__pendingBusy,pendingLabel:window.__pendingLabel,busy:window.__pendingCapsule.getAttribute('aria-busy')}:null}));
result.scenario=scenario;result.errors=errors;result.nativeFrames=result.frames.filter(x=>x.nativeVisible&&!x.capsuleVisible).length;result.readyNativeFrames=result.frames.filter(x=>x.ready&&x.nativeVisible&&!x.capsuleVisible).length;result.firstCapsuleFrame=result.frames.find(x=>x.capsuleVisible)?.frame??null;results.push(result);
if(scenario==='warm-pending-no-id')await page.screenshot({path:dir+'/pending-after-ack.png'});
fs.writeFileSync(dir+'/last-errors.json',JSON.stringify({scenario,errors,result},null,2));assert.equal(errors.length,0,errors.join('\n'));assert.equal(result.timeout,false,scenario);assert.ok(result.firstCapsuleFrame,scenario);
await page.close();
}
fs.writeFileSync(dir+'/frames.json',JSON.stringify(results,null,2));
fs.writeFileSync(dir+'/summary.json',JSON.stringify(results.map(({scenario,nativeFrames,readyNativeFrames,firstCapsuleFrame,frames,events})=>({scenario,nativeFrames,readyNativeFrames,firstCapsuleFrame,events,last:frames.at(-1)})),null,2));console.log(JSON.stringify(results.map(({scenario,nativeFrames,readyNativeFrames,firstCapsuleFrame,frames,events})=>({scenario,nativeFrames,readyNativeFrames,firstCapsuleFrame,first:frames[0],events,last:frames.at(-1)})),null,2));
for(const scenario of ['warm-ready','warm-pending-id','warm-pending-no-id','warm-remount'])assert.equal(results.find(x=>x.scenario===scenario).nativeFrames,0,scenario+' has zero warm native-only frames');
for(const scenario of ['warm-pending-id','warm-pending-no-id'])assert.deepEqual(results.find(x=>x.scenario===scenario).promotion,{sameCapsule:true,samePanel:true,open:true,pendingBusy:'true',pendingLabel:'注释',busy:'false'},scenario+' promotes in place');
for(const scenario of ['warm-pending-null-id','warm-no-id-only','warm-null-id-only','props-only-invalid-to-valid'])assert.ok(results.find(x=>x.scenario===scenario).nativeFrames>0,scenario+' remains native until valid acknowledgement');
assert.ok(results.find(x=>x.scenario==='cold-ready').nativeFrames>0,'cold capability discovery retains native fallback');
assert.equal(results.find(x=>x.scenario==='warm-ready').nativeFrames,0,'warm eligible ready row has no native frame');
}finally{await browser.close();}
