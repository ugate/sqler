import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const stageRoot = path.join(root, 'vpjsdocsrc');
const stageSource = path.join(stageRoot, 'src');
const docsDir = path.join(root, 'docs');

async function rmrf(target) {
 await fs.rm(target, { recursive: true, force: true });
}

async function ensureDir(target) {
 await fs.mkdir(target, { recursive: true });
}

async function exists(target) {
 try {
  await fs.access(target);
  return true;
 } catch {
  return false;
 }
}

async function copyFile(src, dest) {
 await ensureDir(path.dirname(dest));
 await fs.copyFile(src, dest);
}

async function copyJsTree(srcDir, destDir) {
 const entries = await fs.readdir(srcDir, { withFileTypes: true });
 for (const entry of entries) {
  const src = path.join(srcDir, entry.name);
  const dest = path.join(destDir, entry.name);
  if (entry.isDirectory()) {
   await copyJsTree(src, dest);
  } else if (entry.isFile() && entry.name.endsWith('.js')) {
   await copyFile(src, dest);
  }
 }
}

async function stageSources() {
 await rmrf(stageRoot);
 await ensureDir(stageSource);

 for (const file of ['index.js', 'typedefs.js']) {
  const src = path.join(root, file);
  if (await exists(src)) await copyFile(src, path.join(stageSource, file));
 }

 const libDir = path.join(root, 'lib');
 if (await exists(libDir)) await copyJsTree(libDir, path.join(stageSource, 'lib'));

 const files = [];
 async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
   const full = path.join(dir, entry.name);
   if (entry.isDirectory()) await walk(full);
   else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
 }
 await walk(stageSource);
 if (!files.length) throw new Error(`No staged source files found in ${stageSource}`);
}

async function run() {
 const args = [
  'vitepress-jsdoc',
  '--source', './vpjsdocsrc/src',
  '--dist', './docs',
  '--folder', 'api',
  '--title', 'API Reference',
  '--readme', './README.md',
  '--exclude', '**/node_modules/**,**/docs/**,**/test/**,**/jsdocp/**,**/*.json,**/*.hbs,**/*.d.ts,**/*.map'
 ];

 await new Promise((resolve, reject) => {
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
   cwd: root,
   stdio: 'inherit',
   shell: false
  });
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`vitepress-jsdoc exited with code ${code}`)));
  child.on('error', reject);
 });
}

async function moveIfExists(fromRel, toRel) {
 const from = path.join(root, fromRel);
 const to = path.join(root, toRel);
 if (!(await exists(from))) return false;
 await ensureDir(path.dirname(to));
 if (await exists(to)) await rmrf(to);
 await fs.rename(from, to);
 return true;
}

async function writeApiIndex() {
 const apiIndex = path.join(docsDir, 'api', 'index.md');
 const candidates = [
  ['Overview', '/api/index'],
  ['typedefs', '/api/typedefs'],
  ['lib/dbs', '/api/lib/dbs'],
  ['lib/dialect', '/api/lib/dialect'],
  ['lib/sqls', '/api/lib/sqls'],
  ['lib/utils', '/api/lib/utils']
 ];
 const lines = ['# API Reference', '', 'Generated API pages:', ''];
 for (const [label, link] of candidates) {
  lines.push(`- [${label}](${link})`);
 }
 lines.push('');
 await ensureDir(path.dirname(apiIndex));
 await fs.writeFile(apiIndex, lines.join('\n'), 'utf8');
}

async function normalizeOutput() {
 await ensureDir(path.join(docsDir, 'api', 'lib'));

 const moves = [
  ['docs/api__index__.md', 'docs/api/index.md'],
  ['docs/apitypedefs.md', 'docs/api/typedefs.md'],
  ['docs/api/libdbs.md', 'docs/api/lib/dbs.md'],
  ['docs/api/libdialect.md', 'docs/api/lib/dialect.md'],
  ['docs/api/libsqls.md', 'docs/api/lib/sqls.md'],
  ['docs/api/libutils.md', 'docs/api/lib/utils.md']
 ];

 for (const [fromRel, toRel] of moves) {
  await moveIfExists(fromRel, toRel);
 }

 await writeApiIndex();
}

async function main() {
 try {
  await stageSources();
  await run();
  await normalizeOutput();
 } finally {
  await rmrf(stageRoot);
 }
}

main().catch(err => {
 console.error(err);
 process.exit(1);
});
