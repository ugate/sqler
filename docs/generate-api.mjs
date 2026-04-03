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
  if (path.resolve(fromFile) === path.resolve(toFile)) {
    return anchor ? `#${anchor}` : '#';
  }

  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, toFile).replace(/\\/g, '/');
  rel = rel.replace(/\.md$/i, '');
  if (rel === 'index') rel = './';
  else if (!rel.startsWith('.')) rel = './' + rel;
  return anchor ? `${rel}#${anchor}` : rel;
}

function addSymbolAlias(symbolIndex, symbol, entry) {
  if (!symbol) return;
  symbolIndex.set(symbol, entry);

  const member = /^([a-z][A-Za-z0-9_$]*)\.(.+)$/.exec(symbol);
  if (member) {
    const owner = member[1];
    const capOwner = owner.charAt(0).toUpperCase() + owner.slice(1);
    symbolIndex.set(`${owner}.${member[2]}`, entry);
    symbolIndex.set(`${capOwner}.${member[2]}`, entry);
  }
}

function deriveHeadingSymbols(title) {
  const clean = title.replace(/`/g, '').trim();
  const symbols = new Set([clean]);

  const token = clean.match(/^([A-Za-z][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*)/);
  if (token) {
    const value = token[1];
    symbols.add(value);

    const member = /^([a-z][A-Za-z0-9_$]*)\.(.+)$/.exec(value);
    if (member) {
      const owner = member[1];
      const capOwner = owner.charAt(0).toUpperCase() + owner.slice(1);
      symbols.add(`${owner}.${member[2]}`);
      symbols.add(`${capOwner}.${member[2]}`);
    }

    if (value.startsWith('typedefs.')) {
      symbols.add(value.slice('typedefs.'.length));
    }
  }

  return [...symbols];
}

function knownSymbolTarget(symbol) {
  switch (symbol) {
    case 'Stream.Readable':
      return 'https://nodejs.org/api/stream.html#stream_class_stream_readable';
    case 'Stream.Writable':
      return 'https://nodejs.org/api/stream.html#stream_class_stream_writable';
    default:
      break;
  }

  if (symbol.startsWith('Manager.')) return path.join(apiDir, 'manager.md');
  if (symbol.startsWith('Dialect.')) return path.join(apiDir, 'lib', 'dialect.md');
  if (symbol.startsWith('SQLS.')) return path.join(apiDir, 'lib', 'sqls.md');
  if (symbol.startsWith('DBS.')) return path.join(apiDir, 'lib', 'dbs.md');
  if (symbol.startsWith('Utils.')) return path.join(apiDir, 'lib', 'utils.md');
  return null;
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

    md = md.replace(
      /<a\s+(?:name|id)="([^"]+)"><\/a>\s*\n(#{1,6})\s+(.+)$/gm,
      (_m, symbol, hashes, title) => {
        const cleanTitle = title.trim();
        const id = headingTextToAutoId(cleanTitle);

        addSymbolAlias(symbolIndex, symbol, { file, id });
        for (const alias of deriveHeadingSymbols(cleanTitle)) {
          addSymbolAlias(symbolIndex, alias, { file, id });
        }

        return `${hashes} ${cleanTitle}`;
      }
    );

    md = md.replace(/<a\s+(?:name|id)="([^"]+)"><\/a>/g, (_m, symbol) => {
      addSymbolAlias(symbolIndex, symbol, {
        file,
        id: headingTextToAutoId(symbol)
      });
      return '';
    });

    md.replace(/^(#{1,6})\s+(.+?)\s*$/gm, (_m, _h, title) => {
      const cleanTitle = title.trim();
      const entry = { file, id: headingTextToAutoId(cleanTitle) };

      for (const alias of deriveHeadingSymbols(cleanTitle)) {
        addSymbolAlias(symbolIndex, alias, entry);
      }

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
  md = md.replace(/\(#([A-Za-z0-9_$.:-]+)\)/g, (_m, frag) => {
    const found = symbolIndex.get(frag);
    return `(#${found ? found.id : headingTextToAutoId(frag)})`;
  });

  md = md.replace(/href="#([A-Za-z0-9_$.:-]+)"/g, (_m, frag) => {
    const found = symbolIndex.get(frag);
    return `href="#${found ? found.id : headingTextToAutoId(frag)}"`;
  });

  md = md.replace(/\]\((?:\.\/|\/)?typedefs\.([A-Za-z0-9_$.:-]+)\)/g, (m, symbol) => {
    const full = `typedefs.${symbol}`;
    const found = symbolIndex.get(full) || symbolIndex.get(symbol);
    if (found) return `](${relDocLink(file, found.file, found.id)})`;
    return m;
  });

  md = md.replace(/\[([^\]]+)\]\((\.\/)?([A-Za-z][A-Za-z0-9_$.:-]*)\)/g, (m, text, _prefix, symbol) => {
    if (
      symbol.includes('/') ||
      symbol.startsWith('http') ||
      symbol.endsWith('.md') ||
      symbol.endsWith('.html')
    ) {
      return m;
    }

    const found = symbolIndex.get(symbol) || symbolIndex.get(`typedefs.${symbol}`);
    if (found) {
      return `[${text}](${relDocLink(file, found.file, found.id)})`;
    }

    const fallback = knownSymbolTarget(symbol);
    if (!fallback) return m;
    if (fallback.startsWith('http')) return `[${text}](${fallback})`;
    return `[${text}](${relDocLink(file, fallback)})`;
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
