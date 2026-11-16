import * as esbuild from 'esbuild';
const tests = process.argv.includes('--tests');
const options = {
  entryPoints: [tests ? 'test/unit.ts' : 'src/extension.ts'],
  outfile: tests ? 'dist/test.cjs' : 'dist/extension.cjs',
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  external: ['vscode', './extension.cjs'], minify: !tests, legalComments: 'eof'
};
if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else await esbuild.build(options);

if (tests) await esbuild.build({ ...options, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs' });
