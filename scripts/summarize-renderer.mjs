import { readFile, writeFile } from 'node:fs/promises';
const source = process.argv[2] || 'temp/rendering-results.json';
const results = JSON.parse(await readFile(source, 'utf8'));
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
const round = value => +value.toFixed(2);
const groups = [];
for (const paragraphs of [...new Set(results.samples.map(s=>s.paragraphs))])
  for (const phase of ['scroll','typing','pausedTyping']) for (const enabled of [false,true]) {
    const samples=results.samples.filter(s=>s.paragraphs===paragraphs&&s.enabled===enabled);
    const phases=samples.map(s=>s.phases[phase]);
    const intervals=phases.flatMap(p=>p.intervals).sort((a,b)=>a-b);
    groups.push({paragraphs,utf16:samples[0].utf16,phase,enabled,runs:phases.length,
      meanDurationMs:round(mean(phases.map(p=>p.durationMs))),
      rafMedianMs:round(intervals[Math.floor(intervals.length*.5)]),
      rafP95Ms:round(intervals[Math.floor(intervals.length*.95)]),
      rafMaxMs:round(Math.max(...intervals)),
      rafOver25ms:intervals.filter(t=>t>25).length,rafSamples:intervals.length,
      longTasks:phases.reduce((n,p)=>n+p.longTasks.length,0),
      longTaskMaxMs:round(Math.max(0,...phases.flatMap(p=>p.longTasks.map(t=>t.duration)))),
      meanLayoutMs:round(mean(phases.map(p=>p.layout.totalMs))),
      meanPaintMs:round(mean(phases.map(p=>p.paint.totalMs))),
      meanStyleMs:round(mean(phases.map(p=>p.style.totalMs))),
      meanGpuSchedulerCpuMs:round(mean(phases.map(p=>p.gpuSchedulerCpuMs))),
      compositorDrawFrames:phases.reduce((n,p)=>n+p.compositorDrawFrames,0),
      compositorDroppedFrames:phases.reduce((n,p)=>n+p.compositorDroppedFrames,0),
      allFocused:phases.every(p=>p.focused),
      gpuObserved:phases.every(p=>p.gpuProcessObserved&&p.gpuTraceEvents>0)
    });
  }
console.table(groups);
await writeFile('temp/rendering-summary.json',JSON.stringify({source,base:results.base,groups},null,2));
