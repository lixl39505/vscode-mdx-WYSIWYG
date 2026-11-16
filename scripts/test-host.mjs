import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { mkdir, symlink, access } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const temp = path.join(root, 'temp/host');
await mkdir(path.join(temp, 'extensions'), { recursive: true });
await mkdir(path.join(temp, 'workspace'), { recursive: true });
const mdx = process.env.MDX_EXTENSION_PATH || '/Users/july/.vscode/extensions/unifiedjs.vscode-mdx-1.8.18';
await access(mdx);
try { await symlink(mdx, path.join(temp, 'extensions/unifiedjs.vscode-mdx')); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
await build({entryPoints:['test/host.ts'], outfile:'temp/host/tests.cjs', bundle:true,
  platform:'node', format:'cjs', external:['vscode'], target:'node22'});
await runTests({
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  extensionDevelopmentPath: path.join(root, 'test/fixture'),
  extensionTestsPath: path.join(temp, 'tests.cjs'),
  launchArgs: [path.join(temp, 'workspace'), '--user-data-dir', path.join(temp, 'profile'),
    '--extensions-dir', path.join(temp, 'extensions'), '--skip-welcome', '--skip-release-notes',
    '--disable-workspace-trust', '--new-window'],
});
