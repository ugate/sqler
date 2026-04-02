import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const stageRoot = path.join(root, 'vpjsdocsrc');
const stageSource = path.join(stageRoot, 'src');
const docsDir = path.join(root, 'docs');
const apiDir = path.join(docsDir, 'api');

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

async function walkFiles(dir, filter, results = []) {
  if (!(await exists(dir))) return results;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, filter, results);
    } else if (entry.isFile() && filter(full)) {
      results.push(full);
    }
  }
  return results;
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/[.\s/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function headingTextToAutoId(title) {
  return slug(title);
}

function relDocLink(fromFile, toFile, anchor = '') {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, toFile).replace(/\\/g, '/');
  rel = rel.replace(/\.md$/i, '');
  if (rel === 'index') rel = './';
  else if (!rel.startsWith('.')) rel = './' + rel;
  return anchor ? `${rel}#${anchor}` : rel;
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

  const files = await walkFiles(stageSource, file => file.endsWith('.js'));
  if (!files.length) throw new Error(`No staged source files found in ${stageSource}`);
}

async function runGenerator() {
  const args = [
    'vitepress-jsdoc',
    '--source', './vpjsdocsrc/src',
    '--dist', './docs',
    '--folder', 'api',
    '--title', 'API Reference',
    '--readme', './README.md'
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
  const apiIndex = path.join(apiDir, 'index.md');
  const lines = [
    '# API Reference',
    '',
    'Generated API pages:',
    '',
    '- [manager](/api/manager)',
    '- [typedefs](/api/typedefs)',
    '- [lib/dbs](/api/lib/dbs)',
    '- [lib/dialect](/api/lib/dialect)',
    '- [lib/sqls](/api/lib/sqls)',
    '- [lib/utils](/api/lib/utils)',
    ''
  ];
  await ensureDir(path.dirname(apiIndex));
  await fs.writeFile(apiIndex, lines.join('\n'), 'utf8');
}

async function normalizeOutput() {
  await ensureDir(path.join(apiDir, 'lib'));

  const moves = [
    ['docs/api__index__.md', 'docs/api/manager.md'],
    ['docs/api/__index__.md', 'docs/api/manager.md'],
    ['docs/apitypedefs.md', 'docs/api/typedefs.md'],
    ['docs/api/libdbs.md', 'docs/api/lib/dbs.md'],
    ['docs/api/libdialect.md', 'docs/api/lib/dialect.md'],
    ['docs/api/libsqls.md', 'docs/api/lib/sqls.md'],
    ['docs/api/libutils.md', 'docs/api/lib/utils.md']
  ];

  for (const [fromRel, toRel] of moves) {
    await moveIfExists(fromRel, toRel);
  }

  await rmrf(path.join(apiDir, 'README.md'));
  await rmrf(path.join(apiDir, '__index__.md'));

  await writeApiIndex();
}

function normalizeGuideLinks(md, relPath) {
  if (relPath === 'guide/manual.md') {
    md = md.replace(/\]\(\.\/typedefs\)/g, '](../api/typedefs)');
    md = md.replace(/\]\(\.\/global\)/g, '](../api/index)');
    md = md.replace(/\]\(\.\/index\)/g, '](/)');
  }
  return md;
}

async function buildSymbolIndex(mdFiles) {
  const symbolIndex = new Map();
  const rewritten = new Map();

  for (const file of mdFiles) {
    let md = await fs.readFile(file, 'utf8');

    // Convert "<a name=...></a>\n### Heading" into just "### Heading"
    // and index the symbol to the heading's AUTO id. Do not emit custom ids.
    md = md.replace(/<a\s+name="([^"]+)"><\/a>\s*\n(#{1,6})\s+(.+)$/gm, (_m, symbol, hashes, title) => {
      const cleanTitle = title.trim();
      const id = headingTextToAutoId(cleanTitle);
      symbolIndex.set(symbol, { file, id });
      if (!symbolIndex.has(cleanTitle)) symbolIndex.set(cleanTitle, { file, id });
      return `${hashes} ${cleanTitle}`;
    });

    // Remove any remaining raw named anchors and index them to their own slug.
    md = md.replace(/<a\s+name="([^"]+)"><\/a>/g, (_m, symbol) => {
      const id = headingTextToAutoId(symbol);
      symbolIndex.set(symbol, { file, id });
      return '';
    });

    // Capture headings as fallback symbols.
    md.replace(/^(#{1,6})\s+(.+?)\s*$/gm, (_m, _h, title) => {
      const cleanTitle = title.trim();
      const id = headingTextToAutoId(cleanTitle);
      if (!symbolIndex.has(cleanTitle)) symbolIndex.set(cleanTitle, { file, id });
      return _m;
    });

    rewritten.set(file, md);
  }

  for (const [file, md] of rewritten.entries()) {
    await fs.writeFile(file, md, 'utf8');
  }

  return symbolIndex;
}

function rewriteLinks(md, file, symbolIndex) {
  // Rewrite same-file fragments to discovered ids.
  md = md.replace(/\(#([A-Za-z0-9_$.:-]+)\)/g, (_m, frag) => {
    const found = symbolIndex.get(frag);
    return `(#${found ? found.id : headingTextToAutoId(frag)})`;
  });

  md = md.replace(/href="#([A-Za-z0-9_$.:-]+)"/g, (_m, frag) => {
    const found = symbolIndex.get(frag);
    return `href="#${found ? found.id : headingTextToAutoId(frag)}"`;
  });

  // Rewrite ./typedefs.Symbol or /typedefs.Symbol
  md = md.replace(/\]\((?:\.\/|\/)?typedefs\.([A-Za-z0-9_$.:-]+)\)/g, (m, symbol) => {
    const full = `typedefs.${symbol}`;
    const found = symbolIndex.get(full) || symbolIndex.get(symbol);
    return found ? `](${relDocLink(file, found.file, found.id)})` : m;
  });

  // Rewrite bare symbol links only when symbol index knows them.
  md = md.replace(/\]\((\.\/)?([A-Za-z][A-Za-z0-9_$.:-]*)\)/g, (m, _prefix, symbol) => {
    if (symbol.includes('/') || symbol.startsWith('http') || symbol.endsWith('.md') || symbol.endsWith('.html')) return m;
    const found = symbolIndex.get(symbol) || symbolIndex.get(`typedefs.${symbol}`);
    return found ? `](${relDocLink(file, found.file, found.id)})` : m;
  });

  return md;
}

async function postProcessMarkdown() {
  const mdFiles = await walkFiles(docsDir, file => file.endsWith('.md'));
  const symbolIndex = await buildSymbolIndex(mdFiles);

  for (const file of mdFiles) {
    const rel = path.relative(docsDir, file).replace(/\\/g, '/');
    let md = await fs.readFile(file, 'utf8');
    const original = md;

    md = normalizeGuideLinks(md, rel);
    md = rewriteLinks(md, file, symbolIndex);

    if (md !== original) {
      await fs.writeFile(file, md, 'utf8');
    }
  }
}

async function main() {
  try {
    await stageSources();
    await runGenerator();
    await normalizeOutput();
    await postProcessMarkdown();
  } finally {
    await rmrf(stageRoot);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
