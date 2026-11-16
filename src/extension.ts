import * as vscode from 'vscode';
import { visibleSpans } from './viewport';
import { parseSpans, type Span, type Style } from './parser';

const styles: Style[] = ['bold', 'italic', 'strike', 'link', 'image'];
const defaults = { boldColor: '#E6D5A7', linkColor: '#78DCE8', imageColor: '#AB9DF2' };
const maxLength = 200_000;

export class Decorations implements vscode.Disposable {
  private types = new Map<Style, vscode.TextEditorDecorationType>();
  private cache = new Map<vscode.TextDocument, { version: number; spans: Span[] }>();
  private timers = new Map<vscode.TextDocument, ReturnType<typeof setTimeout>>();
  private applied = new WeakMap<vscode.TextEditor, { version: number; keys: Map<Style, string> }>();
  private subscriptions: vscode.Disposable[] = [];
  constructor() {
    this.createTypes();
    this.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshVisible()),
      vscode.window.onDidChangeTextEditorVisibleRanges(event => {
        // Scrolling never starts a parse or bypasses the typing debounce.
        const entry = this.cache.get(event.textEditor.document);
        if (entry?.version === event.textEditor.document.version)
          this.render(event.textEditor, entry.spans);
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshVisible()),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (!this.eligible(event.document)) return;
        if (event.contentChanges.length === 0) return;
        this.cache.delete(event.document);
        this.cancel(event.document);
        if (!vscode.window.visibleTextEditors.some(e => e.document === event.document)) return;
        // Keep existing decorations while VS Code tracks their ranges through edits.
        // Replace them in one pass after parsing, avoiding a document-wide flash.
        this.timers.set(event.document, setTimeout(() => {
          this.timers.delete(event.document);
          this.update(event.document);
        }, 150));
      }),
      vscode.workspace.onDidSaveTextDocument(doc => {
        this.cancel(doc);
        this.update(doc);
      }),
      vscode.workspace.onDidCloseTextDocument(doc => {
        this.cancel(doc);
        this.cache.delete(doc);
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration('mdxWysiwyg')) return;
        for (const type of this.types.values()) type.dispose();
        this.types.clear();
        this.applied = new WeakMap();
        this.createTypes();
        this.cache.clear();
        this.refreshVisible();
      })
    );
    this.refreshVisible();
  }
  private eligible(doc: vscode.TextDocument) { return doc.languageId === 'mdx' && !doc.isClosed; }
  private createTypes() {
    const color = (key: keyof typeof defaults) => {
      const value = vscode.workspace.getConfiguration('mdxWysiwyg').get<string>(key);
      return value && /^#[0-9a-f]{6}$/i.test(value) ? value : defaults[key];
    };
    const options: Record<Style, vscode.DecorationRenderOptions> = {
      bold: { color: color('boldColor'), fontWeight: 'bold' },
      italic: { fontStyle: 'italic' },
      strike: { textDecoration: 'line-through' },
      link: { color: color('linkColor'), textDecoration: 'underline' },
      image: { color: color('imageColor') }
    };
    for (const style of styles) this.types.set(style, vscode.window.createTextEditorDecorationType({
      ...options[style], rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    }));
  }
  private cancel(doc: vscode.TextDocument) {
    const timer = this.timers.get(doc);
    if (timer) clearTimeout(timer);
    this.timers.delete(doc);
  }
  private clear(doc: vscode.TextDocument) {
    for (const editor of vscode.window.visibleTextEditors.filter(e => e.document === doc))
      for (const type of this.types.values()) editor.setDecorations(type, []);
    for (const editor of vscode.window.visibleTextEditors.filter(e => e.document === doc))
      this.applied.delete(editor);
  }
  private refreshVisible() {
    const visible = new Set(vscode.window.visibleTextEditors.map(e => e.document));
    for (const doc of this.cache.keys()) if (!visible.has(doc)) this.cache.delete(doc);
    for (const doc of this.timers.keys()) if (!visible.has(doc)) this.cancel(doc);
    for (const doc of visible) if (!this.timers.has(doc)) this.update(doc);
  }
  private update(doc: vscode.TextDocument) {
    if (!this.eligible(doc)) { this.cache.delete(doc); this.clear(doc); return; }
    const enabled = vscode.workspace.getConfiguration('mdxWysiwyg', doc.uri).get<boolean>('enabled', true);
    if (!enabled || doc.offsetAt(doc.positionAt(Number.MAX_SAFE_INTEGER)) > maxLength) {
      this.cache.delete(doc); this.clear(doc); return;
    }
    let entry = this.cache.get(doc);
    if (!entry || entry.version !== doc.version) {
      entry = { version: doc.version, spans: parseSpans(doc.getText()).sort((a, b) => a.start - b.start) };
      this.cache.set(doc, entry);
    }
    for (const editor of vscode.window.visibleTextEditors.filter(e => e.document === doc))
      this.render(editor, entry.spans);
  }
  private render(editor: vscode.TextEditor, spans: Span[]) {
    const doc = editor.document;
    // Buffer full lines around each visible region; folded gaps stay undecorated.
    const windows = editor.visibleRanges.map(range => ({
      start: doc.offsetAt(new vscode.Position(Math.max(0, range.start.line - 20), 0)),
      end: doc.offsetAt(new vscode.Position(Math.min(doc.lineCount, range.end.line + 21), 0))
    }));
    const selected = visibleSpans(spans, windows);
    const grouped = new Map(styles.map(style => [style, [] as Span[]]));
    for (const span of selected) grouped.get(span.style)!.push(span);
    const previous = this.applied.get(editor);
    const keys = new Map<Style, string>();
    for (const style of styles) {
      const group = grouped.get(style)!;
      const key = group.map(span => span.start + ':' + span.end).join(',');
      keys.set(style, key);
      // VS Code tracks ranges across edits. After a new version, resubmit nonempty
      // types even if offsets match, since edits may have changed tracked ranges.
      if (previous?.keys.get(style) === key &&
          (previous.version === doc.version || key === '')) continue;
      if (!previous && key === '') continue;
      editor.setDecorations(this.types.get(style)!, group.map(span =>
        new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end))));
    }
    this.applied.set(editor, { version: doc.version, keys });
  }

  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.cache.clear();
    for (const type of this.types.values()) type.dispose();
    for (const subscription of this.subscriptions) subscription.dispose();
  }
}
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new Decorations());
}
