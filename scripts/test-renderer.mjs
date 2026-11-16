import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { mkdir, symlink, access, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const base = path.join(root, 'temp', 'r' + Date.now().toString(36));
await mkdir(path.join(base, 'workspace'), {recursive:true});
await mkdir(path.join(base, 'extensions'));
const mdx = process.env.MDX_EXTENSION_PATH || '/Users/july/.vscode/extensions/unifiedjs.vscode-mdx-1.8.18';
await access(mdx);
await symlink(mdx, path.join(base, 'extensions/unifiedjs.vscode-mdx'));
await build({entryPoints:['test/renderer-host.ts'], outfile:path.join(base,'tests.cjs'), bundle:true,
  platform:'node',format:'cjs',external:['vscode'],target:'node22'});
const port = await new Promise(resolve => {
  const server = createServer();
  server.listen(0,'127.0.0.1', () => {const port = server.address().port; server.close(() => resolve(port));});
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await delay(50);
  }
  throw new Error('Timeout: ' + label);
}
const launch = runTests({
  vscodeExecutablePath:process.env.VSCODE_EXECUTABLE_PATH || '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  extensionDevelopmentPath:path.join(root,'test/fixture'),
  extensionTestsPath:path.join(base,'tests.cjs'),
  launchArgs:[path.join(base,'workspace'),'--user-data-dir',path.join(base,'profile'),
    '--extensions-dir',path.join(base,'extensions'),'--skip-welcome','--skip-release-notes',
    '--disable-workspace-trust','--new-window', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port='+port]
});
let launchError;
launch.catch(error => { launchError = error; });
let ws;
try {
  const boot = await until(async () => {
    if (launchError) throw launchError;
    try { return JSON.parse(await readFile(path.join(base,'ready.json'),'utf8')); } catch { return false; }
  }, 'extension host ready');
  const target = await until(async () => {
    try { return (await (await fetch('http://127.0.0.1:'+port+'/json/list')).json())
      .filter(t => t.type === 'page' && /workbench/.test(t.url)).sort((a,b)=>Number(/renderer.mdx/.test(b.title))-Number(/renderer.mdx/.test(a.title)))[0]; } catch { return false; }
  },'renderer CDP');
  console.log('TARGET', target.id, target.title);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {ws.onopen=resolve;ws.onerror=reject;});
  let sequence=0;
  const pending=new Map();
  let trace=[];
  let completed;
  ws.onmessage=({data}) => {
    const msg=JSON.parse(data);
    if (msg.id) {
      const pair=pending.get(msg.id); if(!pair)return;
      pending.delete(msg.id);clearTimeout(pair.timer);
      msg.error ? pair.reject(new Error(JSON.stringify(msg.error))) : pair.resolve(msg.result);
    } else if(msg.method==='Tracing.dataCollected') trace.push(...msg.params.value);
    else if(msg.method==='Tracing.tracingComplete') completed?.();
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},15000);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const reply=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  };
  const control=async command=>{
    await writeFile(path.join(base,'control.json'),JSON.stringify(command));
    return until(async()=>{
      try {const ready=JSON.parse(await readFile(path.join(base,'ready.json'),'utf8'));return ready.id===command.id&&ready;}
      catch{return false;}
    },'host control '+command.id);
  };
  await send('Page.bringToFront');
  const browser=await send('Browser.getVersion');
  const samples=[];
  // Counterbalance warmup/order: disabled, enabled, enabled, disabled at each size.
  for(const paragraphs of [800,2400]) for(const [repeat,enabled] of [false,true,true,false].entries()) {
    const id=paragraphs+'-'+repeat+'-'+(enabled?'on':'off');
    const ready=await control({id,paragraphs,enabled});
    await send('Page.bringToFront');
    await delay(250);
    console.log('VISIBILITY', await evaluate('({state:document.visibilityState,focus:document.hasFocus(),title:document.title})'));
    assert.equal(ready.utf16 < 200000,true);
    if(enabled) assert.ok(ready.spans>5000);
    const point=await evaluate(`(() => {
      const e=[...document.querySelectorAll('.monaco-editor')].find(e=>e.getBoundingClientRect().height>100);
      if(!e)throw new Error('No editor');const r=e.getBoundingClientRect();
      return {x:r.x+Math.min(250,r.width/2),y:r.y+Math.min(170,r.height/2),width:r.width,height:r.height};
    })()`);
    const sample={id,paragraphs,enabled,utf16:ready.utf16,editor:point,phases:{}};
    for(const phase of ['scroll','typing','pausedTyping']) {
      await send('Page.bringToFront');
      await delay(100);
      // Click visible text before typing, so keyboard events go through Monaco.
      if(phase!=='scroll') {
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
        await delay(100);
      }
      trace=[];
      await send('Tracing.start',{categories:'devtools.timeline,toplevel,cc,gpu,disabled-by-default-devtools.timeline.frame',transferMode:'ReportEvents'});
      await evaluate(`(() => {
        window.__bench={intervals:[],longTasks:[],running:true,last:0,start:performance.now()};
        const b=window.__bench;b.observer=new PerformanceObserver(l=>b.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
        b.observer.observe({type:'longtask',buffered:false});
        function frame(t){if(!b.running)return;if(b.last)b.intervals.push(t-b.last);b.last=t;requestAnimationFrame(frame);}
        requestAnimationFrame(frame);
      })()`);
      const start=Date.now();
      if (phase === 'scroll') {
        const scroll = await control({id:id+'-scroll',scroll:true});
        assert.notEqual(scroll.startLine,scroll.middleLine,'Scroll workload must move editor viewport');
      } else for(let i=0;i<(phase==='pausedTyping'?12:60);i++) {
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',text:'z',unmodifiedText:'z',windowsVirtualKeyCode:90});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90});
        await delay(Math.max(0,start+(i+1)*(phase==='pausedTyping'?220:40)-Date.now()));
      }
      await delay(600); // Include trailing debounce, parsing and resulting paint.
      const metrics=await evaluate(`(() => {
        const b=window.__bench;b.running=false;b.observer.disconnect();
        return {durationMs:performance.now()-b.start,intervals:b.intervals,longTasks:b.longTasks,visibility:document.visibilityState,focused:document.hasFocus()};
      })()`);
      if (metrics.visibility !== 'visible') {
        const image = await send('Page.captureScreenshot',{format:'png'});
        await writeFile(path.join(base,'hidden-window.png'),Buffer.from(image.data,'base64'));
      }
      assert.equal(metrics.visibility,'visible');
      assert.ok(metrics.intervals.length>30,'Insufficient rAF samples; window may be throttled');
      const finish=new Promise(resolve=>{completed=resolve;});
      await send('Tracing.end');await finish;
      const file=id+'-'+phase+'.trace.json';
      await writeFile(path.join(base,file),JSON.stringify({traceEvents:trace}));
      const metadata=trace.filter(e=>e.ph==='M'&&e.name==='thread_name');
      const main=metadata.find(e=>e.args?.name==='CrRendererMain' && trace.some(t=>t.pid===e.pid&&t.name==='Layout'));
      assert.ok(main,'Renderer main thread not found in trace');
      const events=trace.filter(e=>e.ph==='X'&&e.pid===main.pid&&e.tid===main.tid);
      const eventMetric=name=>{
        const items=events.filter(e=>e.name===name&&e.dur>=0);
        return {count:items.length,totalMs:items.reduce((n,e)=>n+e.dur/1000,0),maxMs:Math.max(0,...items.map(e=>e.dur/1000))};
      };
      const intervals=[...metrics.intervals].sort((a,b)=>a-b);
      const gpuProcess = trace.find(e=>e.ph==='M'&&e.name==='process_name'&&e.args?.name==='GPU Process');
      const gpuTasks = trace.filter(e=>e.ph==='X'&&e.pid===gpuProcess?.pid&&e.name==='Scheduler::RunTask');
      const gpu=trace.filter(e=>e.ph==='X'&&/gpu/i.test(e.cat||''));
      sample.phases[phase]={...metrics,rafMedianMs:intervals[Math.floor(intervals.length*.5)],rafP95Ms:intervals[Math.floor(intervals.length*.95)],
        rafMaxMs:Math.max(...intervals),rafOver25ms:intervals.filter(t=>t>25).length,
        layout:eventMetric('Layout'),paint:eventMetric('Paint'),style:eventMetric('UpdateLayoutTree'),
        rendererTasksOver50ms:events.filter(e=>e.name==='RunTask'&&e.dur>50000).length,
        compositorDrawFrames:trace.filter(e=>e.name==='DrawFrame'&&e.pid===main.pid).length,
        compositorDroppedFrames:trace.filter(e=>e.name==='DroppedFrame'&&e.pid===main.pid).length,
        gpuProcessObserved:!!gpuProcess,
        gpuSchedulerCpuMs:gpuTasks.reduce((n,e)=>n+(e.dur||0)/1000,0),
        gpuTraceEvents:gpu.length,gpuNames:[...new Set(gpu.map(e=>e.name))],traceFile:file};
      console.log('SAMPLE',id,phase,JSON.stringify({p95:sample.phases[phase].rafP95Ms,longTasks:metrics.longTasks.length,layout:sample.phases[phase].layout.totalMs,paint:sample.phases[phase].paint.totalMs}));
    }
    const snapshot=await control({id:id+'-snapshot',snapshot:true});
    assert.equal(snapshot.inserted,72,'Keyboard input did not reach editor exactly 72 times');
    sample.afterInput=snapshot;
    samples.push(sample);
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(path.join(base,id+'.png'),Buffer.from(screenshot.data,'base64'));
    await writeFile(path.join(base,'results.json'),JSON.stringify({boot,browser,samples},null,2));
  }
  const results={date:new Date().toISOString(),boot,browser,base,samples,
    limitations:'rAF gaps are renderer scheduling measurements, not presented-frame FPS. GPU events are trace observations, not utilization or input-to-photon latency. Two samples per condition and size; CDP keyboard input and VS Code editorScroll command, warm startup excluded.'};
  await writeFile(path.join(base,'results.json'),JSON.stringify(results,null,2));
  await writeFile(path.join(root,'temp/rendering-results.json'),JSON.stringify(results,null,2));
  console.log('RESULTS',path.join(base,'results.json'));
  await writeFile(path.join(base,'control.json'),JSON.stringify({id:'finish',finish:true}));
  await launch;
} finally {
  ws?.close();
  await writeFile(path.join(base,'control.json'),JSON.stringify({id:'finish',finish:true}));
  await launch.catch(() => {});
}
