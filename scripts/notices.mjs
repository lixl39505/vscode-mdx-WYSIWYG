import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const paths = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { encoding: 'utf8' }).trim().split('\n').slice(1);
let text = 'Third-party notices (production dependency tree; may include modules removed by bundling)\n';
for (const dir of [...new Set(paths)].sort()) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  text += '\n========== ' + pkg.name + '@' + pkg.version + ' (' + pkg.license + ') ==========\n';
  const licenses = readdirSync(dir).filter(name => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name));
  if (!licenses.length) throw new Error('Missing license: ' + dir);
  for (const file of licenses) text += readFileSync(join(dir, file), 'utf8') + '\n';
}
writeFileSync('THIRD_PARTY_NOTICES.txt', text.trimEnd() + '\n');
