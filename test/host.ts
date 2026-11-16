import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Decorations } from '../src/extension';

async function until(predicate: () => boolean, label: string) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > 15000) throw new Error('Timeout: ' + label);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
export async function run() {
  const results: Record<string, unknown> = { vscode: vscode.version, mdx: vscode.extensions.getExtension('unifiedjs.vscode-mdx')?.packageJSON.version };
  const config = vscode.workspace.getConfiguration();
  await config.update('editor.wordWrap', 'off', vscode.ConfigurationTarget.Workspace);
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'performance.mdx');
  const source = '<Details>\n\n' + Array.from({length: 800}, (_, i) =>
    '**段落' + i + '** [链接 **嵌套** *斜体*](https://example.com) ~~删除~~ ![图](a.png)\n\n').join('') + '</Details>\n\n结尾\n';
  await vscode.workspace.fs.writeFile(uri, Buffer.from(source));
  const doc = await vscode.workspace.openTextDocument(uri);
  assert.equal(doc.languageId, 'mdx');
  await vscode.extensions.getExtension('unifiedjs.vscode-mdx')!.activate();
  const editor = await vscode.window.showTextDocument(doc);
  await until(() => editor.visibleRanges.length > 0, 'visible editor');
  const manager: any = new Decorations();
  const timings: number[] = [];
  const render = manager.render.bind(manager);
  manager.render = (...args: any[]) => {
    const start = performance.now();
    const result = render(...args);
    timings.push(performance.now() - start);
    return result;
  };
  try {
    const entry = manager.cache.get(doc);
    assert.ok(entry.spans.length > 5000);
    const count = (e: vscode.TextEditor) => [...manager.applied.get(e).keys.values()]
      .reduce((n: number, key: any) => n + (key ? key.split(',').length : 0), 0);
    assert.ok(count(editor) < entry.spans.length / 4);
    results.utf16 = source.length;
    results.totalSpans = entry.spans.length;
    results.initialSubmittedRanges = count(editor);
    for (const line of [400, 800, 1200, 100, 1500]) {
      editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
      await until(() => editor.visibleRanges.some(r => r.contains(new vscode.Position(line, 0))), 'scroll visible');
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.strictEqual(manager.cache.get(doc), entry, 'scroll must retain parse cache');
      assert.ok(count(editor) < entry.spans.length / 4);
    }
    const second = await vscode.window.showTextDocument(doc, {viewColumn: vscode.ViewColumn.Beside});
    second.revealRange(new vscode.Range(700, 0, 700, 0), vscode.TextEditorRevealType.AtTop);
    await until(() => !!manager.applied.get(second), 'split decorated');
    assert.strictEqual(manager.cache.get(doc), entry);
    assert.ok(count(second) < entry.spans.length / 4);
    const started = performance.now();
    assert.equal(await second.edit(edit => edit.insert(new vscode.Position(0, 0), '\n')), true);
    await until(() => manager.cache.get(doc)?.version === doc.version, 'edit range update');
    assert.equal(manager.applied.get(second).version, doc.version);
    results.editToAppliedMs = performance.now() - started;
    await doc.save();
    assert.equal(doc.getText(), '\n' + source, 'decorations must not change source');
    const folding = async () => await vscode.commands.executeCommand<vscode.FoldingRange[]>(
      'vscode.executeFoldingRangeProvider', uri);
    let before = await folding();
    for (let i = 0; !before?.length && i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      before = await folding();
    }
    assert.ok(before?.some(r => r.start <= 1 && r.end >= 1600));
    const focused = await vscode.window.showTextDocument(doc, {viewColumn: second.viewColumn});
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    console.log('FOLD BEFORE', JSON.stringify(before));
    focused.selection = new vscode.Selection(before![0].start, 0, before![0].start, 0);
    focused.revealRange(new vscode.Range(1, 0, 1, 0), vscode.TextEditorRevealType.AtTop);
    await until(() => focused.visibleRanges.some(r => r.start.line < 5), 'top before fold');
    await new Promise(resolve => setTimeout(resolve, 1500));
    await vscode.commands.executeCommand('editor.foldAll');
    await new Promise(resolve => setTimeout(resolve, 300));
    results.foldedVisibleRanges = focused.visibleRanges.map(r => [r.start.line, r.end.line]);
    console.log('FOLDED VISIBLE', JSON.stringify(results.foldedVisibleRanges));
    await until(() => focused.visibleRanges.some(r => r.end.line >= 1603), 'component folded');
    results.foldCommand = 'passed';
    await vscode.commands.executeCommand('editor.unfoldAll');
    await until(() => focused.visibleRanges.every(r => r.end.line < 200), 'component unfolded');
    results.unfoldCommand = 'passed';
    manager.dispose();
    const after = await folding();
    assert.deepEqual(after, before, 'decorations must not change MDX folding provider results');
    results.foldingRanges = before!.length;
    results.renderSubmissionMedianMs = timings.sort((a,b) => a-b)[Math.floor(timings.length / 2)];
    results.renderSubmissionMaxMs = Math.max(...timings);
    results.status = 'passed';
  } catch (error) {
    results.status = 'failed';
    results.error = String(error);
    throw error;
  } finally {
    manager.dispose();
    results.limitations = 'Measures real extension-host API submission, not renderer completion, GPU paint, FPS or visual color correctness.';
    await writeFile(vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '../../host-results.json').fsPath, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  }
}
