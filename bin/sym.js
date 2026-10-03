#!/usr/bin/env node
// sym — operaciones mecánicas de Symphony.
// Todo lo que un nodo no debe decidir (IDs, ramas, worktrees, estados) pasa por acá.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(__dirname, '..', 'templates');
const KIND_LETTER = { atril: 'A', tutti: 'T', reparacion: 'R', director: 'D' };
const KIND_MODE = { atril: 'plan', tutti: 'execute', reparacion: 'execute', director: 'plan' };
const EVENT_STATUS = {
  spawned: 'planned', started: 'in_progress', checkpoint: null, blocked: 'blocked',
  waiting_human: 'waiting_human', done: 'done', accepted: 'accepted', rejected: 'rejected',
  upgraded: 'in_progress', merged: 'merged', cleaned: 'cleaned',
};

// ---------- utilidades ----------

function fail(msg, code = 1) { console.error(`sym: ${msg}`); process.exit(code); }
function now() { return new Date().toISOString(); }
function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[k] = true; else { opt[k] = next; i++; }
    } else if (a === '-m') { opt.m = argv[++i]; }
    else pos.push(a);
  }
  return { pos, opt };
}
function git(repo, args, { allowFail = false } = {}) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) fail(`git ${args.join(' ')} falló en ${repo}:\n${r.stderr || r.stdout}`);
  return r;
}
function sh(cmd, cwd) {
  return spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function fill(tpl, vars) { return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '')); }
function fill1(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)); }

// ---------- obra ----------

function findObra(opt) {
  if (opt.obra) return path.resolve(opt.obra);
  if (process.env.SYMPHONY_OBRA) return path.resolve(process.env.SYMPHONY_OBRA);
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, 'symphony.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  fail('no encuentro symphony.yaml. Pasá --obra <ruta> o usá SYMPHONY_OBRA.');
}
function loadObra(opt) {
  const dir = findObra(opt);
  const cfg = YAML.parse(fs.readFileSync(path.join(dir, 'symphony.yaml'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(dir, 'registry.json'), 'utf8'));
  return { dir, cfg, registry };
}
function saveRegistry(obra) {
  fs.writeFileSync(path.join(obra.dir, 'registry.json'), JSON.stringify(obra.registry, null, 2) + '\n');
}
function nodeDir(obra, id) { return path.join(obra.dir, 'nodes', id); }
function partPath(obra, id) { return path.join(nodeDir(obra, id), 'partichela.md'); }
function wtPath(obra, id, repo) { return path.join(obra.dir, 'wt', id, repo); }
function branchOf(obra, id) { return `symphony/${obra.cfg.obra}/${id}`; }
// Los hijos del director no llevan el prefijo "D." (A1, no D.A1), salvo los de reparación (D.R1).
function parentOf(id) { if (id === 'D') return null; const p = id.split('.'); return p.length > 1 ? p.slice(0, -1).join('.') : 'D'; }
function depthOf(id) { return id === 'D' ? 0 : id.replace(/^D\./, '').split('.').length; }

// ---------- partichela ----------

function readPart(obra, id) {
  const p = partPath(obra, id);
  if (!fs.existsSync(p)) fail(`el nodo ${id} no existe (${p})`);
  const text = fs.readFileSync(p, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) fail(`partichela de ${id} sin frontmatter`);
  return { path: p, text, front: YAML.parse(m[1]) || {}, frontRaw: m[1] };
}
// Ediciones por regex sobre el frontmatter, para no perder los comentarios de la plantilla.
function setFront(obra, id, key, value) {
  const part = readPart(obra, id);
  const val = typeof value === 'string' && /[:#]/.test(value) ? JSON.stringify(value) : String(value);
  const re = new RegExp(`^${key}:[^#\\n]*?(\\s+#.*)?$`, 'm');
  let front = part.frontRaw;
  if (re.test(front)) front = front.replace(re, (_, c) => `${key}: ${val}${c || ''}`);
  else front += `\n${key}: ${val}`;
  fs.writeFileSync(part.path, part.text.replace(part.frontRaw, front));
}
function pushFrontList(obra, id, key, value) {
  const part = readPart(obra, id);
  const re = new RegExp(`^${key}: \\[(.*)\\]$`, 'm');
  const m = part.frontRaw.match(re);
  if (!m) fail(`${key} no es una lista inline en la partichela de ${id}`);
  const items = m[1].trim() ? m[1].split(',').map(s => s.trim()) : [];
  items.push(String(value));
  fs.writeFileSync(part.path, part.text.replace(part.frontRaw, part.frontRaw.replace(re, `${key}: [${items.join(', ')}]`)));
}
function appendBitacora(obra, id, line) {
  const part = readPart(obra, id);
  fs.writeFileSync(part.path, part.text.trimEnd() + `\n- ${now()} · ${line}\n`);
}

// ---------- worktrees e identidad ----------

function addWorktree(obra, id, repo, fromBranch) {
  const repoPath = obra.cfg.repos[repo];
  if (!repoPath) fail(`el repo "${repo}" no está en symphony.yaml`);
  const wt = wtPath(obra, id, repo);
  const branch = branchOf(obra, id);
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  const exists = git(repoPath, ['rev-parse', '--verify', '--quiet', branch], { allowFail: true }).status === 0;
  if (exists) git(repoPath, ['worktree', 'add', wt, branch]);
  else git(repoPath, ['worktree', 'add', '-b', branch, wt, fromBranch]);
  writeIdentity(obra, id, repo, wt);
  return wt;
}
function writeIdentity(obra, id, repo, wt) {
  const tpl = fs.readFileSync(path.join(TEMPLATES, 'identidad', 'IDENTIDAD.md'), 'utf8');
  const text = fill(tpl, { id, obra: obra.cfg.obra, repo, partichela: partPath(obra, id) });
  for (const name of ['CLAUDE.md', 'AGENTS.md']) fs.writeFileSync(path.join(wt, name), text);
  // Que la identidad no se cuele en commits del repo.
  const exclude = path.join(obra.cfg.repos[repo], '.git', 'info', 'exclude');
  const gitdir = git(wt, ['rev-parse', '--git-common-dir']).stdout.trim();
  const excl = path.isAbsolute(gitdir) ? path.join(gitdir, 'info', 'exclude') : exclude;
  try {
    const cur = fs.existsSync(excl) ? fs.readFileSync(excl, 'utf8') : '';
    const lines = ['CLAUDE.md', 'AGENTS.md'].filter(l => !cur.split('\n').includes(l));
    if (lines.length) fs.writeFileSync(excl, cur.trimEnd() + '\n' + lines.join('\n') + '\n');
  } catch { /* opcional */ }
}

// ---------- eventos ----------

function logEvent(obra, id, type, msg, extra = {}) {
  const part = readPart(obra, id);
  const ev = { ts: now(), id, type, msg: msg || '', iteration: part.front.iteration, tier: part.front.tier, ...extra };
  fs.appendFileSync(path.join(obra.dir, 'events.jsonl'), JSON.stringify(ev) + '\n');
  const status = EVENT_STATUS[type];
  if (status) {
    setFront(obra, id, 'status', status);
    obra.registry.nodes[id].status = status;
  }
  saveRegistry(obra);
  writeScore(obra);
  waveBadge(type, id);
  return ev;
}

// ---------- comandos ----------

function cmdInit({ pos, opt }) {
  const name = pos[0];
  if (!name) fail('uso: sym init <obra> --repos api=/ruta,web=/ruta [--base main] [--root ./repertorio]');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) fail(`nombre de obra inválido: "${name}". Usá letras, números, punto, guion o guion bajo (va en nombres de rama).`);
  if (!opt.repos) fail('falta --repos alias=/ruta[,alias=/ruta]');
  const base = opt.base || 'main';
  const root = path.resolve(opt.root || 'repertorio');
  const dir = path.join(root, name);
  if (fs.existsSync(dir)) fail(`la obra ya existe: ${dir}`);
  const repos = {};
  for (const pair of String(opt.repos).split(',')) {
    const [alias, p] = pair.split('=');
    if (!alias || !p) fail(`repo mal formado: "${pair}" (esperaba alias=/ruta)`);
    const abs = path.resolve(p);
    if (git(abs, ['rev-parse', '--is-inside-work-tree'], { allowFail: true }).status !== 0) fail(`${abs} no es un repo git`);
    if (git(abs, ['rev-parse', '--verify', '--quiet', base], { allowFail: true }).status !== 0) fail(`la rama base "${base}" no existe en ${alias}`);
    repos[alias] = abs;
  }
  fs.mkdirSync(path.join(dir, 'nodes', 'D'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'wt'), { recursive: true });
  const ts = now();
  const reposYaml = Object.entries(repos).map(([a, p]) => `  ${a}: ${JSON.stringify(p)}`).join('\n');
  fs.writeFileSync(path.join(dir, 'symphony.yaml'),
    fill(fs.readFileSync(path.join(TEMPLATES, 'symphony.yaml'), 'utf8'), { obra: name, created_at: ts, base_branch: base, repos_yaml: reposYaml }));
  fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify({ obra: name, created_at: ts, nodes: {} }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '');
  fs.writeFileSync(path.join(dir, 'brief.md'), `# Brief · ${name}\n\n<!-- Lo escribe el director al cerrar el relevamiento. -->\n`);
  const obra = loadObra({ obra: dir });
  createNodeFiles(obra, 'D', { kind: 'director', parent: null, repos: Object.keys(repos), tier: obra.cfg.default_tier.director, title: 'Director', origin: '', fromBranch: base });
  console.log(`obra creada en ${dir}`);
  console.log(`siguiente paso: revisá symphony.yaml y lanzá el director con: sym launch D --obra ${dir}`);
}

function createNodeFiles(obra, id, { kind, parent, repos, tier, title, origin, fromBranch, dependsOn = [] }) {
  const ts = now();
  fs.mkdirSync(nodeDir(obra, id), { recursive: true });
  const tpl = fs.readFileSync(path.join(TEMPLATES, 'partichela.md'), 'utf8');
  fs.writeFileSync(partPath(obra, id), fill(tpl, {
    id, obra: obra.cfg.obra, parent: parent ?? 'null', kind, mode: KIND_MODE[kind], tier, repos: `[${repos.join(', ')}]`,
    branch: branchOf(obra, id), origin: origin || 'null', created_at: ts, title: title || id,
  }));
  if (dependsOn.length) setFront(obra, id, 'depends_on', `[${dependsOn.join(', ')}]`);
  const worktrees = {};
  for (const r of repos) worktrees[r] = addWorktree(obra, id, r, fromBranch);
  obra.registry.nodes[id] = { id, kind, parent, children: [], repos, tier, status: 'planned', branch: branchOf(obra, id), worktrees, origin: origin || null, created_at: ts, title: title || id };
  if (parent) { obra.registry.nodes[parent].children.push(id); pushFrontList(obra, parent, 'children', id); }
  saveRegistry(obra);
  logEvent(obra, id, 'spawned', `creado por ${parent ?? 'humano'}`);
}

function cmdNode({ pos, opt }) {
  const sub = pos[0];
  if (sub === 'show') { const part = readPart(loadObra(opt), pos[1] || fail('uso: sym node show <ID>')); console.log(part.text); return; }
  if (sub !== 'create') fail('uso: sym node create <padre> --kind atril|tutti|reparacion --repos api[,web] [--tier N] [--title "..."] [--origin ID] [--depends A1.T1,A1.T2]');
  const obra = loadObra(opt);
  const parentId = pos[1] || fail('falta el ID del padre');
  const parent = obra.registry.nodes[parentId] || fail(`el padre ${parentId} no existe`);
  const kind = opt.kind || fail('falta --kind atril|tutti|reparacion');
  if (!KIND_LETTER[kind] || kind === 'director') fail(`kind inválido: ${kind}`);
  if (kind === 'reparacion' && parentId !== 'D') fail('los nodos de reparación solo cuelgan del director');
  if (kind === 'reparacion' && !opt.origin) fail('un nodo de reparación necesita --origin <ID responsable>');
  if (opt.origin && !obra.registry.nodes[opt.origin]) fail(`origin ${opt.origin} no existe`);
  if (parent.kind === 'tutti' && kind !== 'reparacion') console.error(`sym: aviso: ${parentId} nació como tutti; un tutti en modo execute no divide (regla 2). Seguí solo si está en modo plan.`);
  const limits = obra.cfg.limits || {};
  const depth = depthOf(parentId) + 1;
  if (limits.circuit_breaker_depth && depth > limits.circuit_breaker_depth) {
    logEvent(obra, parentId, 'waiting_human', `disyuntor: profundidad ${depth} > ${limits.circuit_breaker_depth}`);
    fail(`disyuntor de profundidad (${depth} > ${limits.circuit_breaker_depth}). ${parentId} queda en waiting_human.`);
  }
  if (limits.max_children && parent.children.length >= limits.max_children) {
    logEvent(obra, parentId, 'waiting_human', `disyuntor: ${parent.children.length} hijos ≥ ${limits.max_children}`);
    fail(`disyuntor de hijos (${parent.children.length} ≥ ${limits.max_children}). ${parentId} queda en waiting_human.`);
  }
  const repos = String(opt.repos || parent.repos.join(',')).split(',').map(s => s.trim()).filter(Boolean);
  for (const r of repos) if (!parent.repos.includes(r)) fail(`el padre ${parentId} no tiene el repo "${r}"; un hijo no puede tocar repos que su padre no toca`);
  const letter = KIND_LETTER[kind];
  const siblings = parent.children.filter(c => c.split('.').pop().startsWith(letter)).length;
  const id = `${parentId === 'D' && kind !== 'reparacion' ? '' : parentId + '.'}${letter}${siblings + 1}`;
  const tier = opt.tier !== undefined ? Number(opt.tier) : obra.cfg.default_tier[kind];
  if (!obra.cfg.tiers.some(t => t.id === tier)) fail(`tier ${tier} no existe en symphony.yaml`);
  const dependsOn = opt.depends ? String(opt.depends).split(',').map(s => s.trim()) : [];
  for (const d of dependsOn) if (!parent.children.includes(d)) fail(`dependencia ${d} no es hermano de ${id}`);
  createNodeFiles(obra, id, { kind, parent: parentId, repos, tier, title: opt.title, origin: opt.origin, fromBranch: parent.branch, dependsOn });
  console.log(`nodo ${id} creado · partichela: ${partPath(obra, id)}`);
  console.log(`completá Objetivo, Territorio, Contratos y Criterios antes de: sym launch ${id}`);
}

function partReady(obra, id) {
  const { front, text } = readPart(obra, id);
  const problems = [];
  if (!front.territorio?.length && front.kind !== 'director') problems.push('territorio vacío');
  if (!front.criterios?.length && front.kind !== 'director') problems.push('criterios vacíos');
  const obj = text.split('## Objetivo')[1]?.split('##')[0]?.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!obj && front.kind !== 'director') problems.push('Objetivo vacío');
  for (const d of front.depends_on || []) {
    const st = obra.registry.nodes[d]?.status;
    if (st !== 'merged') problems.push(`dependencia ${d} no está merged (está ${st})`);
  }
  return problems;
}

// Tokenizador mínimo de templates: respeta comillas simples y dobles, sin escapes.
function tokenize(s) {
  const out = []; let cur = '', q = null, has = false;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (cur || has) { out.push(cur); cur = ''; has = false; } }
    else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}
// Cita un argumento para mostrarlo (o para cmd.exe en Windows, donde no hay forma de evitar la shell).
function quoteArg(a) {
  if (process.platform === 'win32') return (a === '' || /[\s"&|<>^]/.test(a)) ? '"' + a.replace(/"/g, '\\"') + '"' : a;
  return /^[\w@%+=:,./\\-]+$/.test(a) ? a : "'" + a.replace(/'/g, "'\\''") + "'";
}
function buildLaunch(obra, id, opt) {
  const { front } = readPart(obra, id);
  const tierId = opt.tier !== undefined ? Number(opt.tier) : front.tier;
  const tier = obra.cfg.tiers.find(t => t.id === tierId) || fail(`tier ${tierId} no existe`);
  const runnerTpl = obra.cfg.runners?.[tier.runner] || fail(`runner "${tier.runner}" no definido en symphony.yaml`);
  const cwd = wtPath(obra, id, front.repos[0]);
  // Sin comillas dobles en el prompt: es un solo argumento, pero si alguien lo copia a mano no debe romperse.
  const prompt = `Sos el nodo ${id} de la obra ${obra.cfg.obra}. Leé ${partPath(obra, id)} y seguí el procedimiento de arranque de un nodo del skill symphony.`.replace(/"/g, "'");
  const vars = { model: tier.model, prompt, cwd, id, obra: obra.cfg.obra };
  // Compatibilidad con templates viejos que traían "{prompt}" entre comillas.
  const tpl = String(runnerTpl).replace(/["']\{(\w+)\}["']/g, '{$1}');
  const argv = tokenize(tpl).map(tok => tok.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)));
  if (!argv.length) fail(`el template del runner "${tier.runner}" está vacío`);
  return { argv, display: argv.map(quoteArg).join(' '), cwd, tier };
}

function cmdLaunch({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym launch <ID> [--exec | --wave [--magnified]] [--tier N] [--force]');
  const problems = partReady(obra, id);
  if (problems.length && !opt.force) fail(`${id} no está listo para lanzar: ${problems.join('; ')}. (--force para ignorar)`);
  const { argv, display, cwd, tier } = buildLaunch(obra, id, opt);
  console.log(`# ${id} · tier ${tier.id} (${tier.label || tier.runner}/${tier.model}) · cwd: ${cwd}`);
  console.log(display);
  const win = process.platform === 'win32';
  if (opt.wave) {
    if (!hasWsh()) fail('wsh no está disponible: corré esto desde un bloque de Wave');
    const wargs = ['run', '--cwd', cwd, ...(opt.magnified ? ['-m'] : []), '--', ...argv];
    // En Windows los runners suelen ser shims .cmd que solo cmd.exe sabe resolver; ahí sí va por shell, citado a mano.
    const r = win ? spawnSync(['wsh', ...wargs].map(quoteArg).join(' '), { stdio: 'inherit', shell: true })
                  : spawnSync('wsh', wargs, { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
  if (opt.exec) {
    const child = win ? spawn(display, { cwd, shell: true, stdio: 'inherit' })
                      : spawn(argv[0], argv.slice(1), { cwd, stdio: 'inherit' });
    child.on('error', e => fail(`no pude ejecutar ${argv[0]}: ${e.message}`));
    child.on('exit', code => process.exit(code ?? 0));
  }
}

function cmdEvent({ pos, opt }) {
  const obra = loadObra(opt);
  const [id, type] = pos;
  if (!id || !type) fail('uso: sym event <ID> <tipo> [-m "mensaje"]');
  if (!(type in EVENT_STATUS)) fail(`tipo inválido: ${type}. Válidos: ${Object.keys(EVENT_STATUS).join(', ')}`);
  const part = readPart(obra, id);
  const limits = obra.cfg.limits || {};
  let extra = {};
  if (type === 'rejected') {
    const it = (part.front.iteration || 1) + 1;
    setFront(obra, id, 'iteration', it);
    extra.iteration = it;
    if (limits.max_iterations_per_node && it > limits.max_iterations_per_node) {
      appendBitacora(obra, id, `rechazo #${it - 1}: ${opt.m || ''}`);
      logEvent(obra, id, 'waiting_human', `disyuntor: ${it - 1} rechazos ≥ ${limits.max_iterations_per_node}`);
      fail(`disyuntor de iteraciones. ${id} queda en waiting_human.`);
    }
  }
  if (type === 'upgraded') {
    const next = (part.front.tier ?? 0) + 1;
    if (!obra.cfg.tiers.some(t => t.id === next)) fail(`no hay tier ${next}: ${id} ya está en el nivel máximo`);
    setFront(obra, id, 'tier', next);
    pushFrontList(obra, id, 'tier_history', next);
    obra.registry.nodes[id].tier = next;
    extra.tier = next;
    const cap = obra.cfg.afinacion?.auto_upgrade_up_to_tier;
    if (cap !== undefined && next > cap && !opt.approved) {
      appendBitacora(obra, id, `UPGRADE_REQUEST a tier ${next}: ${opt.m || ''}`);
      logEvent(obra, id, 'waiting_human', `UPGRADE_REQUEST a tier ${next} (supera auto_upgrade_up_to_tier=${cap})`);
      console.log(`${id} pide subir a tier ${next}; requiere aprobación humana (--approved).`);
      return;
    }
  }
  appendBitacora(obra, id, `${type}${opt.m ? ': ' + opt.m : ''}`);
  const ev = logEvent(obra, id, type, opt.m, extra);
  console.log(`${ev.id} ${ev.type} → status ${obra.registry.nodes[id].status}`);
}

function globToRe(glob) {
  // Marcadores antes de escapar, para no pelear con los caracteres especiales.
  let g = glob.replace(/\/\*\*\//g, '\u0001').replace(/^\*\*\//, '\u0002').replace(/\/\*\*$/, '\u0003').replace(/\*\*/g, '\u0004');
  g = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  g = g.replace(/\u0001/g, '/(?:.*/)?').replace(/\u0002/g, '(?:.*/)?').replace(/\u0003/g, '(?:/.*)?').replace(/\u0004/g, '.*');
  return new RegExp(`^${g}$`);
}

function cmdCheck({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym check <ID>');
  const { front } = readPart(obra, id);
  let ok = true;
  console.log(`== criterios de ${id}`);
  for (const c of front.criterios || []) {
    const cwd = wtPath(obra, id, c.repo);
    if (!fs.existsSync(cwd)) { console.log(`  ✗ ${c.id}: worktree de ${c.repo} no existe`); ok = false; continue; }
    const r = sh(c.cmd, cwd);
    const pass = r.status === 0;
    ok = ok && pass;
    console.log(`  ${pass ? '✓' : '✗'} ${c.id} [${c.repo}] ${c.cmd}`);
    if (!pass) console.log((r.stdout + r.stderr).trim().split('\n').slice(-15).map(l => '      ' + l).join('\n'));
  }
  const patterns = (obra.cfg.tests?.forbidden_patterns || []).map(p => new RegExp(p));
  const parentId = front.parent;
  console.log(`== patrones prohibidos en el diff de ${id}`);
  for (const repo of front.repos) {
    const cwd = wtPath(obra, id, repo);
    const base = parentId ? branchOf(obra, parentId) : obra.cfg.base_branch;
    const diff = git(cwd, ['diff', base, '--', '.', ':(exclude)CLAUDE.md', ':(exclude)AGENTS.md']).stdout;
    let file = '';
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const re of patterns) if (re.test(line)) { console.log(`  ✗ ${repo}/${file}: ${line.trim()} (${re.source})`); ok = false; }
    }
  }
  console.log(`== territorio`);
  const terr = (front.territorio || []).flatMap(t => Object.entries(t).map(([repo, g]) => ({ repo, re: globToRe(g), glob: g })));
  if (terr.length) for (const repo of front.repos) {
    const cwd = wtPath(obra, id, repo);
    const base = parentId ? branchOf(obra, parentId) : obra.cfg.base_branch;
    const changed = git(cwd, ['diff', '--name-only', base]).stdout.split('\n').filter(Boolean).filter(f => !['CLAUDE.md', 'AGENTS.md'].includes(f));
    for (const f of changed) {
      const inside = terr.some(t => t.repo === repo && t.re.test(f));
      if (!inside) { console.log(`  ✗ ${repo}/${f} está fuera del territorio`); ok = false; }
    }
  }
  console.log(ok ? `== ${id}: OK` : `== ${id}: FALLA`);
  process.exit(ok ? 0 : 1);
}

function cmdMerge({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym merge <ID>');
  const node = obra.registry.nodes[id] || fail(`${id} no existe`);
  if (!node.parent) fail('el director no se mergea con sym; abrí un PR a la rama base');
  if (node.status !== 'accepted' && !opt.force) fail(`${id} está ${node.status}; solo se mergea un nodo accepted (--force para ignorar)`);
  for (const repo of node.repos) {
    const parentWt = wtPath(obra, node.parent, repo);
    if (!fs.existsSync(parentWt)) fail(`el padre ${node.parent} no tiene worktree de ${repo}`);
    const dirty = git(parentWt, ['status', '--porcelain', '--', '.', ':(exclude)CLAUDE.md', ':(exclude)AGENTS.md']).stdout.trim();
    if (dirty) fail(`el worktree del padre (${repo}) tiene cambios sin commitear; commiteá antes de mergear`);
    const r = git(parentWt, ['merge', '--no-ff', node.branch, '-m', `symphony: merge ${id} into ${node.parent}`], { allowFail: true });
    if (r.status !== 0) {
      console.error(r.stdout + r.stderr);
      fail(`conflicto al mergear ${id} en ${node.parent} (${repo}). Resolvelo en ${parentWt} y volvé a correr sym event ${id} merged`, 2);
    }
    console.log(`${repo}: ${id} → ${node.parent} OK`);
  }
  appendBitacora(obra, id, `merged en ${node.parent}`);
  logEvent(obra, id, 'merged', `en ${node.parent}`);
}

function cmdBlame({ pos, opt }) {
  const obra = loadObra(opt);
  const target = pos[0] || fail('uso: sym blame <repo>/<ruta>');
  const [repo, ...rest] = target.split('/');
  const file = rest.join('/');
  const owners = [];
  for (const id of Object.keys(obra.registry.nodes)) {
    const { front } = readPart(obra, id);
    for (const t of front.territorio || []) for (const [r, g] of Object.entries(t)) if (r === repo && globToRe(g).test(file)) owners.push({ id, glob: g, tier: front.tier, status: front.status });
  }
  owners.sort((a, b) => depthOf(b.id) - depthOf(a.id));
  if (!owners.length) { console.log(`nadie declara territorio sobre ${target}`); return; }
  for (const o of owners) console.log(`${o.id}\t${o.glob}\ttier ${o.tier}\t${o.status}`);
}

function cmdStatus({ opt }) {
  const obra = loadObra(opt);
  const nodes = obra.registry.nodes;
  const print = (id, indent) => {
    const n = nodes[id];
    const { front } = readPart(obra, id);
    console.log(`${indent}${id}  ${n.kind.padEnd(10)} ${String(front.status).padEnd(14)} ${String(front.mode).padEnd(9)} tier ${front.tier}  iter ${front.iteration}  ${n.title !== id ? n.title : ''}`);
    for (const c of n.children) print(c, indent + '  ');
  };
  console.log(`obra: ${obra.cfg.obra}  ·  ${obra.dir}`);
  print('D', '');
  const waiting = Object.keys(nodes).filter(id => readPart(obra, id).front.status === 'waiting_human');
  if (waiting.length) console.log(`\nesperan al humano: ${waiting.join(', ')}`);
}

function cmdClean({ pos, opt }) {
  const obra = loadObra(opt);
  const ids = opt.all ? Object.keys(obra.registry.nodes) : [pos[0] || fail('uso: sym clean <ID> | --all [--include-director]')];
  ids.sort((a, b) => depthOf(b) - depthOf(a));
  for (const id of ids) {
    const node = obra.registry.nodes[id] || fail(`${id} no existe`);
    if (id === 'D' && !opt['include-director']) { console.log('D: se conservan worktrees y rama de la obra (usá --include-director para borrarlos)'); continue; }
    for (const repo of node.repos) {
      const repoPath = obra.cfg.repos[repo];
      const wt = wtPath(obra, id, repo);
      if (fs.existsSync(wt)) git(repoPath, ['worktree', 'remove', '--force', wt], { allowFail: true });
      git(repoPath, ['branch', '-D', node.branch], { allowFail: true });
    }
    git(obra.cfg.repos[node.repos[0]], ['worktree', 'prune'], { allowFail: true });
    try { fs.rmSync(path.join(obra.dir, 'wt', id), { recursive: true, force: true }); } catch { /* ya no está */ }
    appendBitacora(obra, id, 'cleaned');
    logEvent(obra, id, 'cleaned');
    console.log(`${id}: limpio`);
  }
  if (opt.all) console.log(`curtain-call: el estado de la obra queda archivado en ${obra.dir}`);
}

function cmdDoctor() {
  const check = (label, cmd) => { const r = sh(cmd); console.log(`${r.status === 0 ? '✓' : '✗'} ${label}${r.status === 0 ? ': ' + (r.stdout || r.stderr).trim().split('\n')[0] : ' (no encontrado)'}`); };
  check('git', 'git --version');
  check('node', 'node --version');
  check('claude (Claude Code)', 'claude --version');
  check('codex', 'codex --version');
  check('opencode', 'opencode --version');
  check('wsh (Wave)', 'wsh version');
  const skillDirs = ['.claude/skills', '.agents/skills', '.config/opencode/skills'].map(d => path.join(os.homedir(), d));
  const archify = findArchify(null);
  console.log(`${archify ? '✓' : '✗'} archify${archify ? ': ' + archify + ' (sym board disponible)' : ' (npx skills add tt-a1i/archify -g; sin esto no hay sym board)'}`);
  const symphony = skillDirs.find(d => fs.existsSync(path.join(d, 'symphony')));
  console.log(`${symphony ? '✓' : '✗'} symphony skill${symphony ? ': ' + symphony : ' (npx skills add Leon-rod/Symphony -g)'}`);
}


// ---------- score (diagrama Archify) ----------

const KIND_TYPE = { director: 'security', atril: 'backend', tutti: 'frontend', reparacion: 'external' };
const STATUS_ICON = { waiting_human: 'person', blocked: 'flag', in_progress: 'clock', rejected: 'flag', cleaned: 'moon' };
function compId(id) { return 'n-' + id.replace(/\./g, '-'); }

function findArchify(obra) {
  const cands = [obra?.cfg?.archify, process.env.ARCHIFY_HOME,
    ...['.claude/skills/archify', '.agents/skills/archify', '.config/opencode/skills/archify', '.codex/skills/archify'].map(d => path.join(os.homedir(), d))];
  for (const c of cands) if (c && fs.existsSync(path.join(c, 'bin', 'archify.mjs'))) return path.join(c, 'bin', 'archify.mjs');
  return null;
}

function buildScore(obra) {
  const nodes = obra.registry.nodes;
  const parts = {};
  for (const id of Object.keys(nodes)) parts[id] = readPart(obra, id).front;
  // Layout en árbol: y por profundidad, x por hojas.
  const CELL_W = 160, CELL_H = 64, GAP_X = 50, LEVEL_H = 150, X0 = 40, Y0 = 60;
  const leaves = {}; let cursor = 0; const pos = {};
  const walk = (id) => {
    const ch = nodes[id].children;
    if (!ch.length) { leaves[id] = 1; pos[id] = cursor; cursor += 1; return 1; }
    let first = cursor, n = 0;
    for (const c of ch) n += walk(c);
    leaves[id] = n; pos[id] = first + (n - 1) / 2; return n;
  };
  walk('D');
  const components = Object.keys(nodes).map(id => {
    const f = parts[id]; const n = nodes[id];
    const c = {
      id: compId(id), type: KIND_TYPE[n.kind] || 'external', label: id,
      sublabel: (n.title && n.title !== id ? n.title : n.kind).slice(0, 28),
      tag: `${f.status} · t${f.tier} · i${f.iteration}`,
      pos: [X0 + pos[id] * (CELL_W + GAP_X), Y0 + depthOf(id) * LEVEL_H], size: [CELL_W, CELL_H],
    };
    if (STATUS_ICON[f.status]) c.icon = STATUS_ICON[f.status];
    return c;
  });
  const connections = [];
  for (const id of Object.keys(nodes)) {
    const f = parts[id];
    if (nodes[id].parent) connections.push({ id: `e-${compId(nodes[id].parent)}-${compId(id)}`, from: compId(nodes[id].parent), to: compId(id), fromSide: 'bottom', toSide: 'top',
      variant: ['in_progress', 'blocked', 'waiting_human'].includes(f.status) ? 'emphasis' : f.status === 'planned' ? 'dashed' : 'default' });
    for (const d of f.depends_on || []) if (nodes[d]) connections.push({ id: `dep-${compId(d)}-${compId(id)}`, from: compId(d), to: compId(id), variant: 'dashed', label: 'depende' });
  }
  const boundaries = nodes.D.children.filter(c => nodes[c].kind === 'atril' && nodes[c].children.length).map(c => {
    const wraps = []; const collect = (id) => { wraps.push(compId(id)); nodes[id].children.forEach(collect); }; collect(c);
    return { kind: 'region', label: `${c} · ${nodes[c].title || ''}`.trim(), wraps };
  });
  const byStatus = (s) => Object.keys(nodes).filter(id => parts[id].status === s);
  const events = fs.existsSync(path.join(obra.dir, 'events.jsonl')) ? fs.readFileSync(path.join(obra.dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).slice(-6).reverse().map(l => { try { const e = JSON.parse(l); return `${e.ts.slice(11, 16)} ${e.id} ${e.type}${e.msg ? ': ' + e.msg : ''}`.slice(0, 80); } catch { return null; } }).filter(Boolean) : [];
  const cards = [
    { dot: 'rose', title: 'Esperan al humano', items: byStatus('waiting_human').length ? byStatus('waiting_human') : ['nadie'] },
    { dot: 'amber', title: 'Bloqueados', items: byStatus('blocked').length ? byStatus('blocked') : ['nadie'] },
    { dot: 'cyan', title: 'En progreso', items: byStatus('in_progress').length ? byStatus('in_progress') : ['nadie'] },
    { dot: 'slate', title: 'Últimos eventos', items: events.length ? events : ['sin eventos'] },
  ];
  return {
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: `Symphony · ${obra.cfg.obra}`, subtitle: `actualizado ${now().slice(0, 16).replace('T', ' ')}`, output: 'score.html', quality_profile: 'standard', animation: 'none' },
    components, boundaries, connections, cards,
  };
}

function writeScore(obra) {
  try {
    fs.writeFileSync(path.join(obra.dir, 'score.archify.json'), JSON.stringify(buildScore(obra), null, 2) + '\n');
  } catch (e) { console.error(`sym: no pude regenerar score.archify.json: ${e.message}`); }
}

function cmdScore({ opt }) {
  const obra = loadObra(opt);
  writeScore(obra);
  const json = path.join(obra.dir, 'score.archify.json');
  console.log(`score.archify.json regenerado (${Object.keys(obra.registry.nodes).length} nodos)`);
  const archify = findArchify(obra);
  if (!archify) { console.log('archify no encontrado: instalalo con `npx skills add tt-a1i/archify -g` o seteá archify: <ruta> en symphony.yaml'); return; }
  if (opt.render || opt.open) {
    const r = spawnSync('node', [archify, 'deliver', 'architecture', json, path.join(obra.dir, 'score.html'), '--json', ...(opt.open ? ['--open'] : [])], { cwd: obra.dir, encoding: 'utf8' });
    if (r.status !== 0) { console.error((r.stdout + r.stderr).trim().split('\n').slice(-20).join('\n')); fail('archify deliver falló'); }
    console.log(`score.html entregado`);
  } else {
    const r = spawnSync('node', [archify, 'validate', 'architecture', json], { cwd: obra.dir, encoding: 'utf8' });
    console.log(r.status === 0 ? 'validación archify: OK (usá --render para generar score.html)' : (r.stdout + r.stderr).trim().split('\n').slice(-10).join('\n'));
  }
}

function cmdBoard({ opt }) {
  const obra = loadObra(opt);
  writeScore(obra);
  const archify = findArchify(obra) || fail('archify no encontrado (npx skills add tt-a1i/archify -g)');
  const json = path.join(obra.dir, 'score.archify.json');
  const html = path.join(obra.dir, 'score.html');
  const child = spawn('node', [archify, 'preview', 'architecture', json, html, '--no-open'], { cwd: obra.dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let opened = false;
  const onData = (buf) => {
    const s = buf.toString(); process.stdout.write(s);
    const m = s.match(/https?:\/\/127\.0\.0\.1:\d+[^\s"']*/);
    if (m && !opened) {
      opened = true;
      if (opt.wave && hasWsh()) spawnSync('wsh', ['web', 'open', m[0]], { stdio: 'inherit' });
      console.log(`\ntablero: ${m[0]}  (Ctrl-C para cerrar; cada \`sym event\` lo actualiza)`);
    }
  };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('exit', code => process.exit(code ?? 0));
}

// ---------- Wave ----------

function hasWsh() { return spawnSync('wsh', ['version'], { encoding: 'utf8' }).status === 0; }
function waveBadge(type, id) {
  if (!process.env.WAVETERM_BLOCKID || !hasWsh()) return;
  const badge = { waiting_human: ['triangle-exclamation', 'red', 20], blocked: ['flag', 'orange', 15], done: ['circle-check', 'green', 10], accepted: ['circle-check', 'green', 10], rejected: ['rotate', 'orange', 10], started: null, cleaned: null }[type];
  if (badge === undefined) return;
  const args = badge ? ['badge', badge[0], '--color', badge[1], '--priority', String(badge[2])] : ['badge', '--clear'];
  spawnSync('wsh', args, { stdio: 'ignore' });
  if (type === 'waiting_human') spawnSync('wsh', ['notify', `${id} espera una decisión tuya`, '-t', 'Symphony'], { stdio: 'ignore' });
}

// ---------- main ----------

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
const commands = { init: cmdInit, node: cmdNode, launch: cmdLaunch, event: cmdEvent, check: cmdCheck, merge: cmdMerge, blame: cmdBlame, status: cmdStatus, clean: cmdClean, doctor: cmdDoctor, score: cmdScore, board: cmdBoard };
if (!cmd || !commands[cmd]) {
  console.log(`sym — Symphony\n\n  init <obra> --repos a=/ruta,b=/ruta [--base main] [--root ./repertorio]\n  node create <padre> --kind atril|tutti|reparacion [--repos a,b] [--tier N] [--title ..] [--origin ID] [--depends A1.T1]\n  node show <ID>\n  launch <ID> [--exec | --wave [--magnified]] [--tier N] [--force]\n  event <ID> <tipo> [-m msg] [--approved]\n  check <ID>\n  merge <ID> [--force]\n  blame <repo>/<ruta>\n  status\n  clean <ID> | --all [--include-director]\n  score [--render | --open]      regenera score.archify.json (y score.html)\n  board [--wave]                  preview en vivo de archify; con --wave lo abre en un bloque web\n  doctor\n\nTodos aceptan --obra <ruta> (o SYMPHONY_OBRA); si no, se busca symphony.yaml hacia arriba desde el cwd.`);
  process.exit(cmd ? 1 : 0);
}
commands[cmd]({ pos, opt });
