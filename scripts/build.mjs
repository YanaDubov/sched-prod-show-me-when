import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('A committed build is required.');
const api = process.env.BOARD_API;
const session = process.env.BOARD_SESSION;
if (api !== 'https://hq.mega.dev/challenges/show-me-when/api' || !session) throw new Error('Supply the official board API and course session.');
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'app.js', 'api.js', 'style.css']) {
  const text = (await readFile('app/' + file, 'utf8')).replaceAll('__BUILD_SHA__', sha);
  await writeFile('dist/' + file, text);
}
await writeFile('dist/config.js', `// Course-authorized browser configuration; no account credentials.\nexport const API = ${JSON.stringify(api)};\nexport const SESSION = ${JSON.stringify(session)};\n`);
console.log('Built committed board ' + sha);
