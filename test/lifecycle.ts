import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

test('editor lifecycle, debounce, shared document, configuration and disposal', async () => {
  const events: Record<string, (e?: any) => void> = {};
  let listeners = 0, disposed = 0, enabled = true;
  const listen = (name: string) => (callback: any) => {
    events[name] = callback; listeners++;
    return { dispose() { listeners--; } };
  };
  let text = '**old**', reads = 0;
  const doc = { languageId: 'mdx', isClosed: false, version: 1, uri: {},
    get lineCount() { return text.split('\n').length; },
    getText: () => { reads++; return text; },
    positionAt: (n: number) => Math.min(n, text.length),
    offsetAt: (p: number | { line: number }) => typeof p === 'number' ? p :
      text.split('\n').slice(0, p.line).reduce((n, line) => n + line.length + 1, 0) > text.length ?
      text.length : text.split('\n').slice(0, p.line).reduce((n, line) => n + line.length + 1, 0) };
  const decorations = new Map<any, any[]>();
  let calls = 0;
  const editor = { document: doc, visibleRanges: [{start: {line: 0}, end: {line: 0}}], setDecorations: (type: any, ranges: any[]) => { calls++; decorations.set(type, ranges); } };
  const window = {
    visibleTextEditors: [editor],
    createTextEditorDecorationType: (options: any) => ({ options, dispose() { disposed++; decorations.delete(this); } }),
    onDidChangeTextEditorVisibleRanges: listen('scroll'),
    onDidChangeVisibleTextEditors: listen('visible'),
    onDidChangeActiveTextEditor: listen('active')
  };
  const mock = {
    window,
    workspace: {
      getConfiguration: () => ({ get: (key: string, fallback?: any) => key === 'enabled' ? enabled : fallback }),
      onDidChangeTextDocument: listen('change'), onDidSaveTextDocument: listen('save'),
      onDidCloseTextDocument: listen('close'), onDidChangeConfiguration: listen('config')
    },
    Position: class { constructor(public line: number, public character: number) {} },
    Range: class { constructor(public start: number, public end: number) {} },
    DecorationRangeBehavior: { ClosedClosed: 1 }
  };
  const loader = Module as any;
  const original = loader._load;
  loader._load = function(id: string, ...args: any[]) {
    return id === 'vscode' ? mock : original.call(this, id, ...args);
  };
  let manager: any;
  try {
    // External require allows the VS Code API to be replaced without launching Electron.
    const { Decorations } = require('./extension.cjs');
    manager = new Decorations();
    const bold = () => [...decorations].find(([t]) => t.options.fontWeight === 'bold')![1];
    assert.equal(bold()[0].start, 2);
    assert.equal([...decorations.keys()].find(t => t.options.fontWeight === 'bold').options.color, '#E6D5A7');
    const initialCalls = calls;
    events.active();
    events.save(doc);
    events.change({ document: doc, contentChanges: [] });
    assert.equal(calls, initialCalls);
    text = '😀 **new**'; doc.version++;
    events.change({ document: doc, contentChanges: [{}] });
    assert.equal(calls, initialCalls, "typing must not clear document decorations");
    assert.equal(bold()[0].start, 2);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(bold()[0].start, 5);
    assert.equal(calls, initialCalls + 1, "only nonempty bold needs replacement");
    text = 'plain'; doc.version++;
    events.change({ document: doc, contentChanges: [{}] });
    events.save(doc);
    assert.deepEqual(bold(), []);
    text = Array.from({length: 200}, (_, i) => '**line' + i + '**').join('\n');
    doc.version++;
    events.change({ document: doc, contentChanges: [{}] });
    events.save(doc);
    assert.equal(bold().length, 21, 'only viewport and 20 buffered lines');
    const beforeScroll = reads;
    const beforeCalls = calls;
    editor.visibleRanges = [{start: {line: 100}, end: {line: 100}}];
    events.scroll({textEditor: editor});
    assert.equal(bold().length, 41);
    assert.equal(reads, beforeScroll, 'scrolling must reuse parse cache');
    assert.equal(calls, beforeCalls + 1, 'scroll submits only changed bold ranges');
    events.scroll({textEditor: editor});
    assert.equal(calls, beforeCalls + 1, 'unchanged viewport does not resubmit');
    const secondDecorations = new Map<any, any[]>();
    const second = { ...editor, visibleRanges: [{start: {line: 0}, end: {line: 0}}],
      setDecorations: (type: any, ranges: any[]) => { secondDecorations.set(type, ranges); } };
    window.visibleTextEditors = [editor, second];
    events.visible();
    assert.equal(reads, beforeScroll, 'split editors share parsing');
    assert.equal([...secondDecorations.values()][0].length, 21, 'each split has its own viewport');
    window.visibleTextEditors = [editor];
    editor.visibleRanges = [{start: {line: 0}, end: {line: 0}}];
    enabled = false;
    events.config({ affectsConfiguration: () => true });
    assert.ok([...decorations.values()].every(r => r.length === 0));
    enabled = true;
    text = '**again**'; doc.version++;
    events.config({ affectsConfiguration: () => true });
    assert.equal(bold()[0]?.start ?? [...decorations.values()].find(r => r.length)?.[0].start, 2);
    window.visibleTextEditors = [];
    events.visible();
    doc.isClosed = true;
    events.close(doc);
    manager.dispose();
    assert.equal(listeners, 0);
    assert.equal(disposed, 15);
  } finally {
    loader._load = original;
  }
});
