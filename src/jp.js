#!/usr/bin/env node
// jp: one entry point for the job-pipeline tools. Run from anywhere inside a workspace (a folder
// with profile/), or set JOB_PIPELINE_HOME.
//
//   jp jobs [--all|--status=s]      board of jobs          jp set <id> <status>   move a job
//   jp add <url>                    new job from a listing jp build --job=<id>    CV (+ letter) PDFs
//   jp lint [<id>…]                 claims lint            jp search [--source=s] run the feeds
//   jp leads [promote|reject|import …]                     jp scrub               strip tracking tokens
//   jp preview                      live preview server    jp review <id> [--out=file]  static review page
//   jp init [dir]                   start a workspace      jp where               show paths
//
// Dependencies are installed on first run into a cache (CLAUDE_PLUGIN_DATA when Claude Code
// provides it, else ~/.cache/job-pipeline) and linked into the plugin, so an installed plugin
// needs no manual npm install.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, lstatSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COMMANDS = {
  jobs: ['src/jobs/cli.js'],
  set: ['src/jobs/cli.js', 'set'],
  add: ['src/jobs/cli.js', 'add'],
  build: ['src/cv/build.js'],
  lint: ['src/jobs/lint-claims.js'],
  search: ['src/jobs/search.js'],
  leads: ['src/jobs/leads-cli.js'],
  scrub: ['src/jobs/scrub.js'],
  preview: ['src/cv/server.js'],
  review: ['src/cv/review-page.js'],
};

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensureDeps() {
  const link = path.join(ENGINE, 'node_modules');
  if (existsSync(path.join(link, 'marked'))) return;
  const lock = readFileSync(path.join(ENGINE, 'package-lock.json'));
  const hash = createHash('sha256').update(lock).digest('hex').slice(0, 12);
  const base = process.env.CLAUDE_PLUGIN_DATA || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'job-pipeline');
  const dir = path.join(base, `deps-${hash}`);
  const done = path.join(dir, '.installed');
  if (!existsSync(done)) {
    mkdirSync(base, { recursive: true });
    const lockDir = `${dir}.lock`;
    let mine = false;
    for (let waited = 0; !mine; waited += 2000) {
      try { mkdirSync(lockDir); mine = true; } catch {
        if (existsSync(done)) break; // another process finished the install
        if (waited > 600_000) throw new Error(`Timed out waiting for ${lockDir}; delete it and retry`);
        sleep(2000);
      }
    }
    if (mine) {
      try {
        if (!existsSync(done)) {
          console.error(`job-pipeline: installing dependencies into ${dir} (first run only)…`);
          mkdirSync(dir, { recursive: true });
          cpSync(path.join(ENGINE, 'package.json'), path.join(dir, 'package.json'));
          cpSync(path.join(ENGINE, 'package-lock.json'), path.join(dir, 'package-lock.json'));
          const r = spawnSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: dir, stdio: ['ignore', 2, 2] });
          if (r.status !== 0) throw new Error('npm ci failed; see the output above');
          mkdirSync(done);
        }
      } finally {
        rmSync(lockDir, { recursive: true, force: true });
      }
    }
  }
  try { if (lstatSync(link).isSymbolicLink()) rmSync(link); } catch { /* no link yet */ }
  symlinkSync(path.join(dir, 'node_modules'), link, 'dir');
}

function init(target = '.') {
  const dest = path.resolve(target);
  const src = path.join(ENGINE, 'workspace-template');
  const copied = [];
  const walk = (rel) => {
    for (const name of readdirSync(path.join(src, rel))) {
      const from = path.join(src, rel, name);
      const to = path.join(dest, rel, name === 'gitignore' ? '.gitignore' : name);
      if (statSync(from).isDirectory()) { mkdirSync(to, { recursive: true }); walk(path.join(rel, name)); }
      else if (!existsSync(to)) { cpSync(from, to); copied.push(path.relative(dest, to)); }
    }
  };
  mkdirSync(dest, { recursive: true });
  walk('');
  for (const d of ['jobs', 'leads/runs', 'leads/agentic', 'variants']) mkdirSync(path.join(dest, d), { recursive: true });
  console.log(copied.length ? `Created in ${dest}:\n  ${copied.join('\n  ')}` : `Nothing to create: ${dest} already has every file.`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help') {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 10).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
if (cmd === 'init') {
  init(rest[0]);
  process.exit(0);
}
ensureDeps();
if (cmd === 'where') {
  const { ROOT } = await import(pathToFileURL(path.join(ENGINE, 'src/paths.js')).href);
  console.log(`engine:    ${ENGINE}\nworkspace: ${ROOT}${existsSync(path.join(ROOT, 'profile')) ? '' : '  (no profile/ yet: run jp init)'}`);
  process.exit(0);
}
const entry = COMMANDS[cmd];
if (!entry) {
  console.error(`jp: unknown command "${cmd}". Run jp help.`);
  process.exit(2);
}
const [script, ...pre] = entry;
process.argv = [process.argv[0], path.join(ENGINE, script), ...pre, ...rest];
await import(pathToFileURL(path.join(ENGINE, script)).href);
