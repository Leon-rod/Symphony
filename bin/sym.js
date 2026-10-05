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
  upgraded: 'in_progress', merged: 'merged', cleaned: 'cleaned', message: null, sleep: null,
};
// Un nodo está despierto (tiene sesión viva) entre `started` y el siguiente de estos eventos.
const SLEEP_EVENTS = new Set(['sleep', 'done', 'blocked', 'waiting_human', 'accepted', 'merged', 'cleaned']);

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
  git(repoPath, ['worktree', 'prune'], { allowFail: true }); // registros de worktrees borrados a mano
  const exists = git(repoPath, ['rev-parse', '--verify', '--quiet', branch], { allowFail: true }).status === 0;
  if (exists) { console.error(`sym: aviso: la rama ${branch} ya existía en ${repo}; la reutilizo`); git(repoPath, ['worktree', 'add', wt, branch]); }
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
  if (type === 'started') obra.registry.nodes[id].awake = true;
  else if (SLEEP_EVENTS.has(type)) obra.registry.nodes[id].awake = false;
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

function createNodeFiles(obra, id, { kind, parent, repos, tier, title, origin, fromBranch, dependsOn = [], tipo = null }) {
  const ts = now();
  fs.mkdirSync(nodeDir(obra, id), { recursive: true });
  const tpl = fs.readFileSync(path.join(TEMPLATES, 'partichela.md'), 'utf8');
  fs.writeFileSync(partPath(obra, id), fill(tpl, {
    id, obra: obra.cfg.obra, parent: parent ?? 'null', kind, mode: KIND_MODE[kind], tier, repos: `[${repos.join(', ')}]`,
    branch: branchOf(obra, id), origin: origin || 'null', created_at: ts, title: title || id, tipo: tipo || 'null',
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
  if (sub === 'show') { cmdShow({ pos: pos.slice(1), opt }); return; }
  if (sub !== 'create') fail('uso: sym node create <padre> --kind atril|tutti|reparacion --repos api[,web] [--tier N] [--tipo mecanica|local|transversal|investigativa] [--title "..."] [--origin ID] [--depends A1.T1,A1.T2]');
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
  if (opt.tipo && !TIPOS[opt.tipo]) fail(`tipo inválido: ${opt.tipo} (${Object.keys(TIPOS).join('|')})`);
  createNodeFiles(obra, id, { kind, parent: parentId, repos, tier, title: opt.title, origin: opt.origin, fromBranch: parent.branch, dependsOn, tipo: opt.tipo });
  console.log(`nodo ${id} creado · partichela: ${partPath(obra, id)}`);
  console.log(`completá Objetivo, Territorio, Contratos y Criterios antes de: sym launch ${id}`);
}

function partReady(obra, id) {
  const { front, text } = readPart(obra, id);
  const problems = [];
  if (!front.territorio?.length && front.kind !== 'director') problems.push('territorio vacío');
  if (!front.criterios?.length && front.kind !== 'director') problems.push('criterios vacíos');
  if (front.kind === 'tutti' || front.kind === 'reparacion') {
    if (!TIPOS[front.tipo]) problems.push(`tipo inválido o vacío (${Object.keys(TIPOS).join('|')})`);
    const ubi = sectionOf(text, 'Ubicaciones');
    if (!ubi && front.tipo !== 'investigativa') problems.push('Ubicaciones vacías (obligatorias salvo tipo investigativa)');
  }
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
  const prompt = `Sos el nodo ${id} de la obra ${obra.cfg.obra}. Corré sym node show ${id} y seguí el skill symphony.`.replace(/"/g, "'");
  const le = obra.cfg.launch_extra || {};
  const extra = le[front.tipo] ?? le[front.kind] ?? '';
  const vars = { model: tier.model, reasoning: tier.reasoning || 'medium', extra, prompt, cwd, id, obra: obra.cfg.obra, obra_dir: obra.dir, repo_dir: obra.cfg.repos[front.repos[0]] };
  // Compatibilidad con templates viejos que traían "{prompt}" entre comillas.
  const tpl = String(runnerTpl).replace(/["']\{(\w+)\}["']/g, '{$1}');
  const argv = tokenize(tpl).flatMap(tok => tok === '{extra}' ? tokenize(extra) : [tok.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))]);
  if (!argv.length) fail(`el template del runner "${tier.runner}" está vacío`);
  return { argv, display: argv.map(quoteArg).join(' '), cwd, tier };
}

function cmdLaunch({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym launch <ID> [--exec | --wave [--magnified]] [--tier N] [--force]');
  const problems = obra.registry.nodes[id].status === 'planned' ? partReady(obra, id) : [];
  if (problems.length && !opt.force) fail(`${id} no está listo para lanzar: ${problems.join('; ')}. (--force para ignorar)`);
  const { argv, display, cwd, tier } = buildLaunch(obra, id, opt);
  console.log(`# ${id} · tier ${tier.id} (${tier.label || tier.runner}/${tier.model}) · cwd: ${cwd}`);
  console.log(display);
  const win = process.platform === 'win32';
  if (opt.exec && !process.stdin.isTTY) {
    // Un agente (sin terminal interactiva) no puede ejecutar un runner interactivo adentro suyo.
    if (hasWsh()) { console.error(`sym: sin terminal interactiva; lo abro en un bloque de Wave (--wave)`); opt.wave = true; }
    else { console.log(`\nsym: --exec necesita una terminal interactiva y acá no hay (ni wsh). Pedile al humano que abra el comando de arriba en una pestaña de Wave: \`sym tab ${parentOf(id) || id}\` le da el bloque completo para pegar.`); return; }
  }
  if (opt.wave) {
    if (!hasWsh()) fail('wsh no está disponible: corré esto desde un bloque de Wave (o instalá wsh en la conexión WSL/SSH)');
    const wargs = ['run', '--cwd', cwd, ...(opt.magnified ? ['-m'] : []), '--', ...argv];
    // En Windows los runners suelen ser shims .cmd que solo cmd.exe sabe resolver; ahí sí va por shell, citado a mano.
    const r = win ? spawnSync([wshBin(), ...wargs].map(quoteArg).join(' '), { stdio: 'inherit', shell: true })
                  : spawnSync(wshBin(), wargs, { stdio: 'inherit' });
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
  if (type === 'sleep') {
    const pend = pending(obra, id);
    if (pend.length) { console.log(`${id}: no te duermas, tenés pendientes:\n  ` + pend.join('\n  ')); process.exit(1); }
  }
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

function buildScore(obra, focus = null) {
  const all = obra.registry.nodes;
  let keep = null;
  if (focus) {
    keep = new Set([focus, ...all[focus].children]);
    for (let p = all[focus].parent; p; p = all[p].parent) keep.add(p);
  }
  // Vista filtrada del registro: mismos objetos, pero los hijos fuera del linaje no existen.
  const nodes = {};
  for (const id of Object.keys(all)) if (!keep || keep.has(id)) nodes[id] = { ...all[id], children: all[id].children.filter(c => !keep || keep.has(c)) };
  const parts = {};
  for (const id of Object.keys(nodes)) parts[id] = readPart(obra, id).front;
  // Layout en árbol: x por hojas (orden de creación), y por profundidad.
  const CELL_W = 160, CELL_H = 64, GAP_X = 50, X0 = 40, Y0 = 60, DEP_DIP = 22, DEP_STEP = 16, LABEL_PAD = 60;
  let cursor = 0; const slot = {};
  const walk = (id) => {
    const ch = nodes[id].children;
    if (!ch.length) { slot[id] = cursor; cursor += 1; return 1; }
    const first = cursor; let n = 0;
    for (const c of ch) n += walk(c);
    slot[id] = first + (n - 1) / 2; return n;
  };
  walk('D');
  const xOf = (id) => X0 + slot[id] * (CELL_W + GAP_X);
  const cxOf = (id) => xOf(id) + CELL_W / 2;
  // Dependencias entre hermanos: van por debajo de la fila como un puente ortogonal, para no cruzar
  // a los hermanos intermedios ni pisarlos con la etiqueta. Varias en la misma fila se apilan por
  // niveles (coloreo de intervalos), y la separación entre filas crece si hacen falta más niveles.
  const deps = [];
  for (const id of Object.keys(nodes)) for (const d of parts[id].depends_on || []) {
    if (!nodes[d] || nodes[d].parent !== nodes[id].parent) continue;
    deps.push({ from: d, to: id, depth: depthOf(id), lo: Math.min(cxOf(d), cxOf(id)) - LABEL_PAD, hi: Math.max(cxOf(d), cxOf(id)) + LABEL_PAD });
  }
  const byRow = {};
  for (const e of deps) (byRow[e.depth] ||= []).push(e);
  let maxLevels = 0;
  for (const row of Object.values(byRow)) {
    row.sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo));
    const used = [];
    for (const e of row) {
      let L = 0;
      while ((used[L] || []).some(o => e.lo < o.hi && o.lo < e.hi)) L++;
      (used[L] ||= []).push(e); e.level = L;
    }
    maxLevels = Math.max(maxLevels, used.length);
  }
  const LEVEL_H = Math.max(150, CELL_H + DEP_DIP + DEP_STEP * maxLevels + 30);
  const yOf = (id) => Y0 + depthOf(id) * LEVEL_H;
  const components = Object.keys(nodes).map(id => {
    const f = parts[id]; const n = nodes[id];
    const c = {
      id: compId(id), type: KIND_TYPE[n.kind] || 'external', label: id,
      sublabel: (n.title && n.title !== id ? n.title : n.kind).slice(0, 28),
      tag: `${f.status} · t${f.tier} · i${f.iteration}`,
      pos: [xOf(id), yOf(id)], size: [CELL_W, CELL_H],
    };
    if (STATUS_ICON[f.status]) c.icon = STATUS_ICON[f.status];
    else if (id === focus) c.icon = 'active';
    return c;
  });
  const connections = [];
  for (const id of Object.keys(nodes)) {
    const f = parts[id];
    if (nodes[id].parent) connections.push({ id: `e-${compId(nodes[id].parent)}-${compId(id)}`, from: compId(nodes[id].parent), to: compId(id), fromSide: 'bottom', toSide: 'top',
      variant: ['in_progress', 'blocked', 'waiting_human'].includes(f.status) || id === focus || nodes[id].parent === focus ? 'emphasis' : f.status === 'planned' ? 'dashed' : 'default' });
  }
  for (const e of deps) {
    const y = yOf(e.to) + CELL_H + DEP_DIP + DEP_STEP * e.level;
    const ax = cxOf(e.from), bx = cxOf(e.to);
    connections.push({ id: `dep-${compId(e.from)}-${compId(e.to)}`, from: compId(e.from), to: compId(e.to), variant: 'dashed', label: 'depende',
      fromSide: 'bottom', toSide: 'bottom', via: [[ax, y], [bx, y]], labelAt: [(ax + bx) / 2, y] });
  }
  const boundaries = focus
    ? (nodes[focus].children.length ? [{ kind: 'region', label: `foco ${focus}`, wraps: [compId(focus), ...nodes[focus].children.map(compId)] }] : [])
    : nodes.D.children.filter(c => nodes[c].kind === 'atril' && nodes[c].children.length).map(c => {
      const wraps = []; const collect = (id) => { wraps.push(compId(id)); nodes[id].children.forEach(collect); }; collect(c);
      return { kind: 'region', label: `${c} · ${nodes[c].title || ''}`.trim(), wraps };
    });
  const byStatus = (s) => Object.keys(nodes).filter(id => parts[id].status === s);
  const events = fs.existsSync(path.join(obra.dir, 'events.jsonl')) ? fs.readFileSync(path.join(obra.dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e && (!keep || keep.has(e.id) || keep.has(e.to))).slice(-6).reverse().map(e => `${e.ts.slice(11, 16)} ${e.id} ${e.type}${e.to ? ' → ' + e.to : ''}${e.msg ? ': ' + e.msg : ''}`.slice(0, 80)) : [];
  const cards = focus ? [
    { dot: 'cyan', title: `Nodo ${focus}`, items: [`${parts[focus].status} · modo ${parts[focus].mode}`, `tier ${parts[focus].tier} · iteración ${parts[focus].iteration}`, `padre: ${nodes[focus].parent || 'humano'}`] },
    { dot: 'amber', title: 'Hijos', items: nodes[focus].children.length ? nodes[focus].children.map(c => `${c} · ${parts[c].status}`) : ['sin hijos'] },
    { dot: 'slate', title: 'Últimos eventos del linaje', items: events.length ? events : ['sin eventos'] },
  ] : [
    { dot: 'rose', title: 'Esperan al humano', items: byStatus('waiting_human').length ? byStatus('waiting_human') : ['nadie'] },
    { dot: 'amber', title: 'Bloqueados', items: byStatus('blocked').length ? byStatus('blocked') : ['nadie'] },
    { dot: 'cyan', title: 'En progreso', items: byStatus('in_progress').length ? byStatus('in_progress') : ['nadie'] },
    { dot: 'slate', title: 'Últimos eventos', items: events.length ? events : ['sin eventos'] },
  ];
  return {
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: `Symphony · ${obra.cfg.obra}${focus ? ' · foco ' + focus : ''}`, subtitle: `actualizado ${now().slice(0, 16).replace('T', ' ')}`, output: focus ? `score.${focus}.html` : 'score.html', quality_profile: 'standard', animation: 'none' },
    components, boundaries, connections, cards,
  };
}

function writeScore(obra) {
  try {
    fs.writeFileSync(path.join(obra.dir, 'score.archify.json'), JSON.stringify(buildScore(obra), null, 2) + '\n');
    // Tableros enfocados que estén abiertos (score.<ID>.archify.json) se regeneran también.
    for (const f of fs.readdirSync(obra.dir)) {
      const m = f.match(/^score\.(.+)\.archify\.json$/);
      if (m && obra.registry.nodes[m[1]]) fs.writeFileSync(path.join(obra.dir, f), JSON.stringify(buildScore(obra, m[1]), null, 2) + '\n');
    }
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
    if (r.status !== 0) { console.error((r.stdout + r.stderr).trim().split('\n').slice(-20).join('\n')); fail('archify deliver falló; score.html NO se actualizó (si existe, es de una corrida anterior)'); }
    console.log(`score.html entregado`);
  } else {
    const r = spawnSync('node', [archify, 'validate', 'architecture', json], { cwd: obra.dir, encoding: 'utf8' });
    if (r.status !== 0) { console.error((r.stdout + r.stderr).trim().split('\n').slice(-12).join('\n')); fail('la validación de archify falló; corregí buildScore o reportalo'); }
    console.log('validación archify: OK (usá --render para generar score.html)');
  }
}

function boardFiles(obra, focus) {
  const stem = focus ? `score.${focus}` : 'score';
  return { json: path.join(obra.dir, `${stem}.archify.json`), html: path.join(obra.dir, `${stem}.html`), log: path.join(obra.dir, `.${stem}.board.log`), pid: path.join(obra.dir, `.${stem}.board.pid`) };
}
function cmdBoard({ opt }) {
  const obra = loadObra(opt);
  const focus = opt.focus || null;
  if (focus && !obra.registry.nodes[focus]) fail(`${focus} no existe`);
  const f = boardFiles(obra, focus);
  if (opt.stop) {
    if (fs.existsSync(f.pid)) { try { process.kill(Number(fs.readFileSync(f.pid, 'utf8'))); } catch { /* ya no corre */ } fs.rmSync(f.pid, { force: true }); console.log('board detenido'); }
    else console.log('no hay board corriendo para ese foco');
    return;
  }
  if (focus) fs.writeFileSync(f.json, JSON.stringify(buildScore(obra, focus), null, 2) + '\n'); else writeScore(obra);
  const archify = findArchify(obra) || fail('archify no encontrado (npx skills add tt-a1i/archify -g)');
  const args = [archify, 'preview', 'architecture', f.json, f.html, '--no-open'];
  const urlRe = /https?:\/\/127\.0\.0\.1:\d+[^\s"']*/;
  const announce = (url) => {
    if (opt.wave && hasWsh()) wsh(['web', 'open', url], { stdio: 'inherit' });
    console.log(`tablero${focus ? ' (foco ' + focus + ')' : ''}: ${url}  — se actualiza con cada sym event`);
  };
  if (opt.detach) {
    const out = fs.openSync(f.log, 'w');
    const child = spawn('node', args, { cwd: obra.dir, detached: true, stdio: ['ignore', out, out], windowsHide: true });
    fs.writeFileSync(f.pid, String(child.pid));
    child.unref();
    for (let i = 0; i < 40; i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      const m = fs.readFileSync(f.log, 'utf8').match(urlRe);
      if (m) { announce(m[0]); console.log(`corre en segundo plano (pid ${child.pid}); para pararlo: sym board --stop${focus ? ' --focus ' + focus : ''}`); return; }
    }
    fail(`el preview no arrancó en 10s; mirá ${f.log}`);
  }
  const child = spawn('node', args, { cwd: obra.dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let opened = false;
  const onData = (buf) => { const s = buf.toString(); process.stdout.write(s); const m = s.match(urlRe); if (m && !opened) { opened = true; announce(m[0]); console.log('(Ctrl-C para cerrar)'); } };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('exit', code => process.exit(code ?? 0));
}


// ---------- presupuestos por tipo de tarea ----------

// El tier dice qué modelo; el tipo dice qué loop puede ejecutar el nodo.
const TIPOS = {
  mecanica:      { archivos: 2, rango: true,  explorar: false, tests: 'sym check', reasoning: 'low',    desc: 'cambio literal o conocido: leé solo los rangos de Ubicaciones, editá, sym diff, sym check' },
  local:         { archivos: 4, rango: true,  explorar: false, tests: 'sym check', reasoning: 'medium', desc: 'un componente o servicio: leé los rangos de Ubicaciones y como mucho 4 archivos, editá, sym check' },
  transversal:   { archivos: 8, rango: false, explorar: true,  tests: 'sym check', reasoning: 'medium', desc: 'varios archivos con contrato entre ellos: explorá dentro del territorio, hasta 8 archivos' },
  investigativa: { archivos: 15, rango: false, explorar: true, tests: 'sym check', reasoning: 'high',   desc: 'causa desconocida: hipótesis → evidencia; hasta 15 archivos; registrá cada hipótesis en la bitácora' },
};
function budgetLine(tipo) {
  const b = TIPOS[tipo]; if (!b) return '';
  return `presupuesto (${tipo}): ${b.desc}. Archivos máx ${b.archivos}${b.rango ? ', por rango' : ''}; explorar fuera de Ubicaciones: ${b.explorar ? 'sí, dentro del territorio' : 'NO (si hace falta → spec)'}; tests: solo ${b.tests}.`;
}

// ---------- pendientes y paquete de arranque ----------

function unreadInbox(obra, id) {
  const lines = inboxLines(obra, id);
  const read = obra.registry.nodes[id]?.inbox_read || 0;
  return lines.slice(read);
}
function pending(obra, id) {
  const out = [];
  for (const c of obra.registry.nodes[id].children) {
    const st = readPart(obra, c).front.status;
    if (NEEDS_PARENT.has(st)) { const ev = lastEventOf(obra, c); out.push(`${c} está ${st}${ev?.msg ? ' — ' + ev.msg : ''}`); }
  }
  for (const l of unreadInbox(obra, id)) out.push(`mensaje ${l.slice(2)}`);
  return out;
}
function compactBody(text) {
  // Cuerpo de la partichela sin comentarios ni secciones vacías; títulos como "-- Sección".
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const chunk of body.split(/\n(?=## )/)) {
    const m = chunk.match(/^## ([^\n]+)\n?([\s\S]*)$/);
    if (!m) { const h = chunk.trim(); if (h && !h.startsWith('# ')) out.push(h); continue; }
    const content = m[2].trim();
    if (!content || content === 'Sin empezar.') continue;
    out.push(`-- ${m[1].trim()}\n${content}`);
  }
  return out.join('\n');
}
function cmdShow({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym node show <ID> [--raw]');
  const part = readPart(obra, id);
  if (opt.raw) { console.log(part.text); return; }
  const f = part.front; const n = obra.registry.nodes[id];
  const lim = obra.cfg.limits || {};
  const L = [];
  L.push(`== ${id}${n.title && n.title !== id ? ' · ' + n.title : ''} · ${f.kind} · modo ${f.mode} · status ${f.status} · iter ${f.iteration}/${lim.max_iterations_per_node ?? '∞'} · tier ${f.tier}${f.tipo ? ' · tipo ' + f.tipo : ''}`);
  L.push(`padre: ${f.parent ?? 'humano'} · repos: ${(f.repos || []).join(', ')} · rama: ${f.branch} · worktree: ${wtPath(obra, id, (f.repos || [])[0])}${f.origin && f.origin !== 'null' ? ' · origen: ' + f.origin : ''}`);
  if (f.tipo) L.push(budgetLine(f.tipo));
  if (f.kind !== 'tutti') L.push(`límites: hijos ≤ ${lim.max_children ?? '∞'} · profundidad ≤ ${lim.circuit_breaker_depth ?? '∞'} · suite completa ≤ ${lim.max_global_suite_runs ?? '∞'} (solo D) · afinación: mismo criterio ${obra.cfg.afinacion?.same_criterion_iterations ?? 2} veces → sube, auto hasta tier ${obra.cfg.afinacion?.auto_upgrade_up_to_tier ?? '∞'}`);
  if (f.territorio?.length) L.push('-- Territorio\n' + f.territorio.map(x => Object.entries(x).map(([r, g]) => `${r}: ${g}`).join(', ')).join('\n'));
  if (f.criterios?.length) L.push('-- Criterios\n' + f.criterios.map(c => `${c.id} [${c.repo}] ${c.cmd}`).join('\n'));
  if (f.depends_on?.length) L.push('-- Dependencias\n' + f.depends_on.map(d => `${d} (${obra.registry.nodes[d]?.status ?? '?'})`).join(', '));
  if (f.evaluaciones?.length) L.push('-- Evaluaciones\n' + f.evaluaciones.map(e => `iter ${e.iteration}: ${e.met}/${e.total} · fallas: ${(e.fallas || []).join(', ') || 'ninguna'}`).join('\n'));
  L.push(compactBody(part.text));
  const fb = path.join(nodeDir(obra, id), `feedback-${(f.iteration || 1) - 1}.md`);
  if (f.status === 'rejected' && fs.existsSync(fb)) L.push(`-- Feedback vigente (${path.basename(fb)})\n` + fs.readFileSync(fb, 'utf8').trim());
  const unread = unreadInbox(obra, id);
  if (unread.length) L.push('-- Inbox nuevo\n' + unread.map(l => l.slice(2)).join('\n'));
  if (n.children.length) {
    L.push('-- Hijos\n' + n.children.map(c => { const cf = readPart(obra, c).front; const ev = lastEventOf(obra, c); return `${c} · ${cf.status}${NEEDS_PARENT.has(cf.status) ? ' ← TE ESPERA' : ''} · iter ${cf.iteration} · tier ${cf.tier}${ev?.msg ? ' — ' + ev.msg : ''}`; }).join('\n'));
    for (const c of n.children) if (NEEDS_PARENT.has(readPart(obra, c).front.status)) { const est = sectionOf(readPart(obra, c).text, 'Estado actual'); if (est) L.push(`-- Estado actual de ${c}\n${est}`); }
  }
  console.log(L.join('\n'));
  // Lo mostrado cuenta como leído.
  obra.registry.nodes[id].inbox_read = inboxLines(obra, id).length;
  saveRegistry(obra);
}

// ---------- diff acotado ----------

function cmdDiff({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym diff <ID> [--max 200] [--stat]');
  const { front } = readPart(obra, id);
  const max = Number(opt.max ?? 200);
  const base = front.parent ? branchOf(obra, front.parent) : obra.cfg.base_branch;
  for (const repo of front.repos) {
    const cwd = wtPath(obra, id, repo);
    if (!fs.existsSync(cwd)) continue;
    const ex = ['--', '.', ':(exclude)CLAUDE.md', ':(exclude)AGENTS.md'];
    console.log(`== ${id} · ${repo} · contra ${base}`);
    console.log(git(cwd, ['diff', '--stat', base, ...ex]).stdout.trim() || '(sin cambios)');
    if (opt.stat) continue;
    const lines = git(cwd, ['diff', base, ...ex]).stdout.split('\n');
    console.log(lines.slice(0, max).join('\n'));
    if (lines.length > max) console.log(`… ${lines.length - max} líneas más (usá --max N o pedí un archivo: git -C ${cwd} diff ${base} -- <ruta>)`);
  }
}

// ---------- conduct: el que despierta a los nodos (sin modelo) ----------

function cmdConduct({ opt }) {
  const obra = loadObra(opt);
  const focus = opt.focus || null;
  if (focus && !obra.registry.nodes[focus]) fail(`${focus} no existe`);
  const inScope = (id) => { if (!focus) return true; for (let x = id; x; x = obra.registry.nodes[x]?.parent) if (x === focus) return true; return false; };
  const launching = {}; // id → ts del relanzamiento, hasta que emita `started`
  const evPath = path.join(obra.dir, 'events.jsonl');
  let offset = fs.existsSync(evPath) ? fs.statSync(evPath).size : 0;
  const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);
  const reload = () => { obra.registry = JSON.parse(fs.readFileSync(path.join(obra.dir, 'registry.json'), 'utf8')); };
  const wake = (id, why) => {
    reload();
    const n = obra.registry.nodes[id];
    if (!n || n.status === 'cleaned') return;
    if (n.awake) { log(`${id} está despierto; verá "${why}" en su próximo sym wait o sym node show`); return; }
    if (launching[id] && Date.now() - launching[id] < 10 * 60 * 1000) { log(`${id} ya fue relanzado hace ${Math.round((Date.now() - launching[id]) / 1000)}s; espero su started`); return; }
    const problems = n.status === 'planned' ? partReady(obra, id) : []; // relanzar un nodo en curso no pasa por la puerta de entrada
    if (problems.length) { log(`${id} necesita atención (${why}) pero no está listo para lanzar: ${problems.join('; ')}`); return; }
    const { argv, display, cwd } = buildLaunch(obra, id, {});
    launching[id] = Date.now();
    if (hasWsh()) {
      const win = process.platform === 'win32';
      const wargs = ['run', '--cwd', cwd, '--', ...argv];
      const r = win ? spawnSync([wshBin(), ...wargs].map(quoteArg).join(' '), { stdio: 'ignore', shell: true }) : spawnSync(wshBin(), wargs, { stdio: 'ignore' });
      log(`relancé ${id} en un bloque de Wave (${why})${r.status ? ' — wsh devolvió ' + r.status : ''}`);
    } else {
      log(`${id} necesita relanzarse (${why}). Sin wsh no puedo abrirlo; pegá esto en una pestaña:\n    cd ${quoteArg(cwd)} && ${display}`);
      if (hasWsh()) wsh(['notify', `${id} necesita relanzarse`, '-t', 'Symphony'], { stdio: 'ignore' });
    }
  };
  const handle = (e) => {
    if (e.type === 'started') { delete launching[e.id]; return; }
    const parent = obra.registry.nodes[e.id]?.parent;
    if (['done', 'blocked'].includes(e.type) && parent && inScope(parent)) return wake(parent, `${e.id} ${e.type}${e.msg ? ': ' + e.msg : ''}`);
    if (['rejected', 'upgraded'].includes(e.type) && inScope(e.id)) return wake(e.id, `${e.type}${e.msg ? ': ' + e.msg : ''}`);
    if (e.type === 'message' && e.to && e.to !== 'humano' && inScope(e.to)) return wake(e.to, `mensaje de ${e.id}`);
    if (e.type === 'waiting_human' && inScope(e.id)) { log(`${e.id} espera al humano${e.msg ? ': ' + e.msg : ''}`); if (hasWsh()) wsh(['notify', `${e.id} espera una decisión tuya`, '-t', 'Symphony'], { stdio: 'ignore' }); }
  };
  log(`conduct${focus ? ' · foco ' + focus : ''} · obra ${obra.cfg.obra} · ${hasWsh() ? 'relanzo en bloques de Wave' : 'sin wsh: solo aviso'}`);
  // Arranque: lo que ya está pendiente de un padre dormido.
  for (const id of Object.keys(obra.registry.nodes)) {
    if (!inScope(id)) continue;
    const pend = pending(obra, id);
    if (pend.length && !obra.registry.nodes[id].awake) wake(id, pend[0]);
  }
  const tick = () => {
    try {
      if (!fs.existsSync(evPath)) return;
      const size = fs.statSync(evPath).size;
      if (size < offset) offset = 0;
      if (size === offset) return;
      const fd = fs.openSync(evPath, 'r'); const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, size - offset, offset); fs.closeSync(fd); offset = size;
      reload();
      for (const line of buf.toString('utf8').split('\n').filter(Boolean)) { try { handle(JSON.parse(line)); } catch { /* línea parcial */ } }
    } catch (e) { log(`error: ${e.message}`); }
  };
  if (opt.once) { tick(); return; }
  setInterval(tick, Number(opt.interval ?? 2) * 1000);
}


// ---------- cost: tokens por nodo, leyendo los logs de sesión de los runners ----------

function* walkObj(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return;
  yield o;
  for (const v of Object.values(o)) if (v && typeof v === 'object') yield* walkObj(v, depth + 1);
}
function* jsonlFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p); else if (e.name.endsWith('.jsonl')) yield p;
  }
}
function readSession(file, runner) {
  let cwd = null; let codexTotal = null; const claudeSeen = new Set();
  const u = { input: 0, cached: 0, reasoning: 0, output: 0 };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    for (const x of walkObj(o)) {
      if (!cwd && typeof x.cwd === 'string') cwd = x.cwd;
      if (runner === 'codex' && x.total_token_usage && typeof x.total_token_usage === 'object') codexTotal = x.total_token_usage;
      if (runner === 'claude' && x.usage && typeof x.usage.input_tokens === 'number') {
        const key = x.id || x.message?.id || line.slice(0, 80);
        if (claudeSeen.has(key)) continue; claudeSeen.add(key);
        u.input += x.usage.input_tokens || 0;
        u.cached += (x.usage.cache_read_input_tokens || 0) + (x.usage.cache_creation_input_tokens || 0);
        u.output += x.usage.output_tokens || 0;
      }
    }
  }
  if (runner === 'codex' && codexTotal) {
    const c = codexTotal.cached_input_tokens || 0;
    u.input = Math.max(0, (codexTotal.input_tokens || 0) - c); u.cached = c;
    u.reasoning = codexTotal.reasoning_output_tokens || 0; u.output = codexTotal.output_tokens || 0;
  }
  return { file, runner, cwd, usage: u, turns: lines.length };
}
function cmdCost({ opt }) {
  const obra = loadObra(opt);
  const wtRoot = path.resolve(obra.dir, 'wt');
  const nodeOfCwd = (cwd) => {
    if (!cwd) return null;
    const rel = path.relative(wtRoot, path.resolve(cwd));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(/[\\/]/)[0];
  };
  const home = os.homedir();
  const sources = [
    { runner: 'codex', dir: path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'sessions') },
    { runner: 'claude', dir: path.join(home, '.claude', 'projects') },
  ];
  const sessions = [];
  for (const s of sources) for (const f of jsonlFiles(s.dir)) { try { sessions.push(readSession(f, s.runner)); } catch { /* archivo raro */ } }
  const byNode = {}; let matched = 0;
  for (const s of sessions) {
    const id = nodeOfCwd(s.cwd); if (!id || !obra.registry.nodes[id]) continue;
    matched++;
    const b = (byNode[id] ||= { sessions: 0, input: 0, cached: 0, reasoning: 0, output: 0 });
    b.sessions++; for (const k of ['input', 'cached', 'reasoning', 'output']) b[k] += s.usage[k];
  }
  if (!matched) { console.log(`no encontré sesiones cuyo cwd sea un worktree de esta obra (revisé ${sessions.length} archivos en ${sources.map(s => s.dir).join(' y ')}). Si tu runner guarda los logs en otro lado, decímelo.`); return; }
  const eff = (b) => Math.round(b.input + b.cached * 0.1 + (b.reasoning + b.output) * 8); // misma escala que la estimación: input-equivalentes
  const fmt = (n) => n.toLocaleString('es-AR');
  console.log(`obra ${obra.cfg.obra} · ${matched} sesiones de ${sessions.length} encontradas\n`);
  console.log('nodo        kind       tier status      ses   input      cached     reasoning  output     equiv*');
  const ids = Object.keys(byNode).sort();
  const byTier = {};
  for (const id of ids) {
    const b = byNode[id]; const n = obra.registry.nodes[id]; const f = readPart(obra, id).front;
    console.log(`${id.padEnd(11)} ${n.kind.padEnd(10)} ${String(f.tier).padEnd(4)} ${String(f.status).padEnd(11)} ${String(b.sessions).padStart(3)}   ${fmt(b.input).padEnd(10)} ${fmt(b.cached).padEnd(10)} ${fmt(b.reasoning).padEnd(10)} ${fmt(b.output).padEnd(10)} ${fmt(eff(b))}`);
    const tb = (byTier[f.tier] ||= { nodes: 0, ok: 0, equiv: 0, sessions: 0 });
    tb.nodes++; tb.sessions += b.sessions; tb.equiv += eff(b); if (['accepted', 'merged'].includes(f.status)) tb.ok++;
  }
  console.log('\ntier  nodos  aceptados  sesiones  equiv total   equiv por nodo aceptado');
  for (const [tier, tb] of Object.entries(byTier)) console.log(`${String(tier).padEnd(5)} ${String(tb.nodes).padEnd(6)} ${String(tb.ok).padEnd(10)} ${String(tb.sessions).padEnd(9)} ${fmt(tb.equiv).padEnd(13)} ${tb.ok ? fmt(Math.round(tb.equiv / tb.ok)) : '—'}`);
  console.log('\n* equiv = input + 0,1·cached + 8·(reasoning+output): tokens de input equivalentes, la misma escala de la estimación. Ajustá los factores a tu tarifa.');
  const total = ids.reduce((a, id) => a + eff(byNode[id]), 0);
  console.log(`total obra: ${fmt(total)} equiv`);
}

// ---------- comunicación: wait / tell ----------

function sectionOf(text, title) {
  const m = text.split(`## ${title}`)[1];
  return m ? m.split(/\n## /)[0].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
}
function inboxPath(obra, id) { return id === 'humano' ? path.join(obra.dir, 'inbox-humano.md') : path.join(nodeDir(obra, id), 'inbox.md'); }
function inboxLines(obra, id) { const p = inboxPath(obra, id); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(l => l.startsWith('- ')) : []; }
function lastEventOf(obra, id) {
  const p = path.join(obra.dir, 'events.jsonl');
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) { try { const e = JSON.parse(lines[i]); if (e.id === id && e.type !== 'message' && e.type !== 'checkpoint') return e; } catch { /* línea rota */ } }
  return null;
}
function snapshot(obra, id) {
  const self = readPart(obra, id).front;
  const children = {};
  for (const c of obra.registry.nodes[id].children) children[c] = readPart(obra, c).front.status;
  return { status: self.status, iteration: self.iteration, tier: self.tier, children, inbox: inboxLines(obra, id).length };
}
const NEEDS_PARENT = new Set(['done', 'blocked']);

function cmdWait({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym wait <ID> [--timeout 100] [--interval 2] [--once]');
  if (!obra.registry.nodes[id]) fail(`${id} no existe`);
  const timeout = Number(opt.timeout ?? process.env.SYMPHONY_WAIT_TIMEOUT ?? obra.cfg.wait_timeout ?? 100) * 1000, interval = Number(opt.interval ?? 2) * 1000;
  const t0 = Date.now();
  const base = snapshot(obra, id);
  const report = (snap, prevInbox) => {
    const out = [];
    for (const [c, st] of Object.entries(snap.children)) {
      if (NEEDS_PARENT.has(st) || st !== base.children[c]) {
        const ev = lastEventOf(obra, c);
        out.push(`${c} → ${st}${ev?.msg ? ` — ${ev.msg}` : ''}${ev ? ` (iter ${ev.iteration}, tier ${ev.tier})` : ''}`);
        if (NEEDS_PARENT.has(st)) { const est = sectionOf(readPart(obra, c).text, 'Estado actual'); if (est) out.push('  Estado actual de ' + c + ':\n    ' + est.split('\n').join('\n    ')); }
      }
    }
    if (snap.status !== base.status || snap.iteration !== base.iteration || snap.tier !== base.tier) {
      const ev = lastEventOf(obra, id);
      out.push(`${id} (vos) → ${snap.status}, iter ${snap.iteration}, tier ${snap.tier}${ev?.msg ? ` — ${ev.msg}` : ''}`);
      const fb = path.join(nodeDir(obra, id), `feedback-${snap.iteration - 1}.md`);
      if (snap.status === 'rejected' && fs.existsSync(fb)) out.push(`  leé ${fb}`);
    }
    for (const l of inboxLines(obra, id).slice(prevInbox)) out.push(`mensaje ${l.slice(2)}`);
    obra.registry.nodes[id].inbox_read = inboxLines(obra, id).length; saveRegistry(obra);
    return out;
  };
  const attention = (snap) => Object.values(snap.children).some(st => NEEDS_PARENT.has(st));
  let snap = base;
  // Primero: lo que ya está esperando al padre (hijos en done/blocked) se devuelve sin esperar.
  if (attention(snap)) { console.log(`== ${id}: hijos que te esperan`); console.log(report(snap, snap.inbox).join('\n')); return; }
  if (opt.once) { console.log(`== ${id}: sin novedades`); return; }
  const deadline = t0 + timeout;
  while (Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, interval);
    obra.registry = JSON.parse(fs.readFileSync(path.join(obra.dir, 'registry.json'), 'utf8'));
    snap = snapshot(obra, id);
    if (JSON.stringify(snap) !== JSON.stringify(base)) {
      console.log(`== ${id}: novedades (${Math.round((Date.now() - t0) / 1000)}s)`);
      console.log(report(snap, base.inbox).join('\n'));
      return;
    }
  }
  console.log(`== ${id}: sin novedades en ${Math.round(timeout / 1000)}s. Volvé a correr: sym wait ${id}`);
}

function cmdTell({ pos, opt }) {
  const obra = loadObra(opt);
  const to = pos[0] || fail('uso: sym tell <ID|humano> -m "mensaje" --from <tuID>');
  if (to !== 'humano' && !obra.registry.nodes[to]) fail(`${to} no existe`);
  const from = opt.from || process.env.SYMPHONY_NODE || 'humano';
  if (!opt.m) fail('falta -m "mensaje"');
  const line = `- ${now()} · de ${from}: ${String(opt.m).replace(/\n/g, ' ')}\n`;
  fs.appendFileSync(inboxPath(obra, to), line);
  fs.appendFileSync(path.join(obra.dir, 'events.jsonl'), JSON.stringify({ ts: now(), id: from, type: 'message', to, msg: opt.m }) + '\n');
  if (to === 'humano' && hasWsh()) {
    wsh(['notify', String(opt.m).slice(0, 120), '-t', `Symphony · ${from}`], { stdio: 'ignore' });
    if (process.env.WAVETERM_BLOCKID) wsh(['badge', 'envelope', '--color', 'blue', '--priority', '12'], { stdio: 'ignore' });
  }
  console.log(`mensaje de ${from} para ${to} guardado en ${inboxPath(obra, to)}${to === 'humano' ? '' : ` (lo ve con sym wait ${to})`}`);
}

// ---------- tab: bloque de comandos para una pestaña de Wave ----------

function cmdTab({ pos, opt }) {
  const obra = loadObra(opt);
  const id = pos[0] || fail('uso: sym tab <ID>');
  const node = obra.registry.nodes[id] || fail(`${id} no existe`);
  const lines = [`# ── Pestaña ${id}${node.title && node.title !== id ? ' · ' + node.title : ''} ─ pegá todo esto en un bloque de una pestaña nueva de Wave`,
    `cd ${quoteArg(obra.dir)}`,
    `sym board --wave --detach --focus ${id}`,
    `${hasWsh() ? '' : '# '}wsh view ${quoteArg(path.relative(obra.dir, partPath(obra, id)))}`];
  const launchLine = (nid) => {
    const st = readPart(obra, nid).front.status;
    if (['merged', 'cleaned', 'accepted'].includes(st)) return `# ${nid}: ya está ${st}`;
    const problems = partReady(obra, nid);
    return problems.length ? `# ${nid}: todavía no (${problems.join('; ')}) → cuando esté: sym launch ${nid} --wave` : `sym launch ${nid} --wave`;
  };
  lines.push(launchLine(id));
  for (const c of node.children) lines.push(launchLine(c));
  lines.push(`sym conduct --focus ${id} --wave   # queda corriendo: relanza nodos de este linaje cuando hace falta`);
  console.log(lines.join('\n'));
}

// ---------- Wave ----------

let _wsh;
function wshBin() {
  if (_wsh !== undefined) return _wsh;
  const cands = ['wsh', path.join(os.homedir(), '.waveterm', 'bin', 'wsh')];
  _wsh = cands.find(c => spawnSync(c, ['version'], { encoding: 'utf8' }).status === 0) || null;
  return _wsh;
}
function hasWsh() { return !!wshBin(); }
function wsh(args, opts = {}) { return spawnSync(wshBin(), args, { encoding: 'utf8', ...opts }); }
function waveBadge(type, id) {
  if (!process.env.WAVETERM_BLOCKID || !hasWsh()) return;
  const badge = { waiting_human: ['triangle-exclamation', 'red', 20], blocked: ['flag', 'orange', 15], done: ['circle-check', 'green', 10], accepted: ['circle-check', 'green', 10], rejected: ['rotate', 'orange', 10], started: null, cleaned: null }[type];
  if (badge === undefined) return;
  const args = badge ? ['badge', badge[0], '--color', badge[1], '--priority', String(badge[2])] : ['badge', '--clear'];
  wsh(args, { stdio: 'ignore' });
  if (type === 'waiting_human') wsh(['notify', `${id} espera una decisión tuya`, '-t', 'Symphony'], { stdio: 'ignore' });
}

// ---------- main ----------

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
const commands = { init: cmdInit, node: cmdNode, launch: cmdLaunch, event: cmdEvent, check: cmdCheck, merge: cmdMerge, blame: cmdBlame, status: cmdStatus, clean: cmdClean, doctor: cmdDoctor, score: cmdScore, board: cmdBoard, wait: cmdWait, tell: cmdTell, tab: cmdTab, diff: cmdDiff, conduct: cmdConduct, cost: cmdCost };
if (!cmd || !commands[cmd]) {
  console.log(`sym — Symphony\n\n  init <obra> --repos a=/ruta,b=/ruta [--base main] [--root ./repertorio]\n  node create <padre> --kind atril|tutti|reparacion [--repos a,b] [--tier N] [--tipo mecanica|local|transversal|investigativa] [--title ..] [--origin ID] [--depends A1.T1]\n  node show <ID> [--raw]          paquete de arranque compacto (--raw: el archivo entero)\n  launch <ID> [--exec | --wave [--magnified]] [--tier N] [--force]\n  event <ID> <tipo> [-m msg] [--approved]   tipos: started checkpoint done blocked waiting_human accepted rejected upgraded merged cleaned sleep\n  check <ID>\n  merge <ID> [--force]\n  blame <repo>/<ruta>\n  status\n  clean <ID> | --all [--include-director]\n  score [--render | --open]      regenera score.archify.json (y score.html)\n  board [--wave] [--focus ID] [--detach | --stop]   preview en vivo; --focus muestra solo el linaje de ID\n  wait <ID> [--timeout 100] [--once]   espera novedades de tus hijos, de tu estado o de tu inbox\n  tell <ID|humano> -m msg --from <tuID>   deja un mensaje en el inbox de otro nodo\n  tab <ID>                        bloque de comandos para abrir ese nodo y sus hijos en una pestaña de Wave\n  diff <ID> [--max 200] [--stat]  diff del nodo contra su padre, acotado\n  conduct [--focus ID] [--wave]   proceso sin modelo: relanza nodos dormidos cuando un hijo termina/bloquea, los rechazan o les escriben\n  cost [--by node|tier]           tokens por nodo leyendo los logs de sesión de Codex y Claude Code\n  doctor\n\nTodos aceptan --obra <ruta> (o SYMPHONY_OBRA); si no, se busca symphony.yaml hacia arriba desde el cwd.`);
  process.exit(cmd ? 1 : 0);
}
commands[cmd]({ pos, opt });
