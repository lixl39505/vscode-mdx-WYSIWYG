import * as vscode from 'vscode';
import { readFile, writeFile } from 'node:fs/promises';
import { Decorations } from '../src/extension';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function run() {
  const base = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, '..').fsPath;
  await vscode.workspace.getConfiguration().update('chat.disableAIFeatures', true, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace.getConfiguration().update('git.openRepositoryInParentFolders', 'never', vscode.ConfigurationTarget.Workspace);
  await vscode.workspace.getConfiguration().update('editor.wordWrap', 'off', vscode.ConfigurationTarget.Workspace);
  await vscode.workspace.getConfiguration().update('editor.smoothScrolling', false, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace.getConfiguration().update('editor.cursorBlinking', 'solid', vscode.ConfigurationTarget.Workspace);
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'renderer.mdx');
  await vscode.workspace.fs.writeFile(uri, Buffer.from('准备性能测试\n'));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.extensions.getExtension('unifiedjs.vscode-mdx')!.activate();
  const editor = await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  await vscode.commands.executeCommand('notifications.clearAll');
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  let manager: any;
  let current = '';
  const deadline = Date.now() + 240_000;
  await writeFile(base + '/ready.json', JSON.stringify({id: 'boot', vscode: vscode.version,
    mdx: vscode.extensions.getExtension('unifiedjs.vscode-mdx')!.packageJSON.version}));
  try {
    while (Date.now() < deadline) {
      let command: any;
      try { command = JSON.parse(await readFile(base + '/control.json', 'utf8')); }
      catch { await pause(50); continue; }
      if (command.id === current) { await pause(50); continue; }
      current = command.id;
      if (command.finish) return;
      if (command.scroll) {
        const startLine = editor.visibleRanges[0]?.start.line;
        let middleLine;
        for (let i = 0; i < 60; i++) {
          await vscode.commands.executeCommand('editorScroll', {to: i < 30 ? 'down' : 'up', by: 'line', value: 5, revealCursor: false});
          await pause(40);
          if (i === 29) middleLine = editor.visibleRanges[0]?.start.line;
        }
        await writeFile(base + '/ready.json', JSON.stringify({id: current, startLine, middleLine}));
        continue;
      }
      if (command.snapshot) {
        await writeFile(base + '/ready.json', JSON.stringify({id: current,
          version: doc.version, length: doc.getText().length,
          inserted: (doc.getText().match(/z/g) ?? []).length,
          visible: editor.visibleRanges.map(r => [r.start.line, r.end.line])}));
        continue;
      }
      manager?.dispose();
      const source = '<Details>\n\n' + Array.from({length: command.paragraphs}, (_, i) =>
        '**段落' + i + '** [链接 **嵌套** *斜体*](https://example.com) ~~删除~~ ![图](a.png)\n\n').join('') +
        '</Details>\n\n结尾\n';
      await editor.edit(edit => edit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), source));
      editor.selection = new vscode.Selection(2, 0, 2, 0);
      editor.revealRange(new vscode.Range(2, 0, 2, 0), vscode.TextEditorRevealType.AtTop);
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      manager = command.enabled ? new Decorations() : undefined;
      // Exclude reset, initial parsing, language-server warmup and initial paint.
      await pause(1800);
      await writeFile(base + '/ready.json', JSON.stringify({id: current, utf16: source.length,
        version: doc.version, enabled: command.enabled,
        spans: manager?.cache.get(doc)?.spans.length ?? null}));
    }
    throw new Error('Renderer benchmark control timeout');
  } finally { manager?.dispose(); }
}
