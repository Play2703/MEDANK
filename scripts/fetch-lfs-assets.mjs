#!/usr/bin/env node
/**
 * fetch-lfs-assets.mjs — Resolve Git LFS pointers WITHOUT the `git-lfs` binary.
 *
 * Por que isto existe:
 *   Ambientes de build gerenciados (Render, alguns CIs, containers com rootfs
 *   somente-leitura) NÃO permitem `apt-get install git-lfs` — o build quebra logo
 *   na primeira linha com:
 *       E: List directory /var/lib/apt/lists/partial is missing. - Acquire (30: Read-only file system)
 *
 *   Este script substitui `git lfs pull` usando apenas Node puro (sem dependências):
 *   lê os arquivos que ainda são ponteiros LFS, resolve os objetos pela Batch API
 *   do GitHub (https://<repo>.git/info/lfs/objects/batch) e baixa o conteúdo real,
 *   validando tamanho e SHA-256.
 *
 * Uso:
 *   node scripts/fetch-lfs-assets.mjs            # roda automaticamente no `npm run build`
 *   SKIP_LFS_FETCH=1 npm run build               # pula o download (build mais rápido)
 *   LFS_STRICT=1 node scripts/fetch-lfs-assets.mjs   # falha o build se o download falhar
 *
 * Variáveis de ambiente:
 *   SKIP_LFS_FETCH  - "1"/"true": não baixa nada (o app degrada de forma elegante).
 *   LFS_STRICT      - "1"/"true": erro de download derruba o build (default: só avisa).
 *   LFS_REMOTE_URL  - URL do repositório (default: `git remote get-url origin`).
 *   GITHUB_TOKEN /
 *   GIT_LFS_TOKEN   - token para repositórios privados (opcional; público não precisa).
 *
 * NUNCA derruba o build por padrão: `SeedLoaderService` já tolera o ponteiro LFS
 * (a biblioteca-base carrega; só a busca semântica fica vazia).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';
const MAX_POINTER_BYTES = 1024; // ponteiros LFS têm ~130 bytes; nunca chegam perto disso

const truthy = (v) => v === '1' || String(v).toLowerCase() === 'true';
const STRICT = truthy(process.env.LFS_STRICT);
const SKIP = truthy(process.env.SKIP_LFS_FETCH);

const log = (msg) => console.log(`[fetch-lfs-assets] ${msg}`);
const warn = (msg) => console.warn(`[fetch-lfs-assets] ⚠️  ${msg}`);

/** Lê os caminhos rastreados por LFS conforme .gitattributes (filter=lfs). */
async function trackedPaths() {
  const gitattributes = path.join(ROOT, '.gitattributes');
  if (!fs.existsSync(gitattributes)) return [];

  const patterns = (await fsp.readFile(gitattributes, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('filter=lfs'))
    .map((line) => line.split(/\s+/)[0]);

  // Os padrões deste repo são caminhos literais. Globs simples (*) também
  // são suportados para não surpreender quem adicionar novos assets depois.
  const resolved = new Set();
  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      resolved.add(pattern);
      continue;
    }
    const dir = path.dirname(pattern);
    const rx = new RegExp(`^${path.basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const absDir = path.join(ROOT, dir);
    if (!fs.existsSync(absDir)) continue;
    for (const entry of await fsp.readdir(absDir)) {
      if (rx.test(entry)) resolved.add(path.posix.join(dir, entry));
    }
  }
  return [...resolved];
}

/** Se o arquivo ainda for um ponteiro LFS, devolve {oid, size}; senão, null. */
async function readPointer(relPath) {
  const abs = path.join(ROOT, relPath);
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    return null; // arquivo ausente: nada a resolver
  }
  if (!stat.isFile() || stat.size > MAX_POINTER_BYTES) return null;

  const text = await fsp.readFile(abs, 'utf8');
  if (!text.startsWith(POINTER_PREFIX)) return null;

  const oid = text.match(/^oid sha256:([a-f0-9]{64})$/m)?.[1];
  const size = Number(text.match(/^size (\d+)$/m)?.[1]);
  if (!oid || !Number.isFinite(size)) return null;
  return { relPath, abs, oid, size };
}

function remoteUrl() {
  if (process.env.LFS_REMOTE_URL) return process.env.LFS_REMOTE_URL;
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** github.com/user/repo(.git) | git@github.com:user/repo.git -> https://github.com/user/repo.git */
function lfsEndpoint(url) {
  if (!url) return null;
  let https = url.trim();
  const ssh = https.match(/^git@([^:]+):(.+)$/);
  if (ssh) https = `https://${ssh[1]}/${ssh[2]}`;
  https = https.replace(/^ssh:\/\/git@/, 'https://');
  if (!https.startsWith('http')) return null;
  https = https.replace(/\/+$/, '');
  if (!https.endsWith('.git')) https += '.git';
  return `${https}/info/lfs/objects/batch`;
}

function authHeaders() {
  const token = process.env.GIT_LFS_TOKEN || process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function resolveDownloadUrls(endpoint, objects) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      operation: 'download',
      transfers: ['basic'],
      objects: objects.map(({ oid, size }) => ({ oid, size })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Batch API respondeu ${res.status} ${res.statusText} (${endpoint})`);
  }

  const body = await res.json();
  const byOid = new Map();
  for (const obj of body.objects ?? []) {
    if (obj.error) {
      warn(`objeto ${obj.oid?.slice(0, 12)} indisponível: ${obj.error.message ?? obj.error.code}`);
      continue;
    }
    const action = obj.actions?.download;
    if (action?.href) byOid.set(obj.oid, action);
  }
  return byOid;
}

async function download({ relPath, abs, oid, size }, action) {
  const res = await fetch(action.href, { headers: action.header ?? {} });
  if (!res.ok || !res.body) {
    throw new Error(`download de ${relPath} falhou: HTTP ${res.status}`);
  }

  const tmp = `${abs}.lfs-download`;
  const hash = createHash('sha256');
  let written = 0;
  let lastLoggedPct = 0;

  const out = fs.createWriteStream(tmp);
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      written += chunk.length;
      if (!out.write(chunk)) {
        await new Promise((resolve) => out.once('drain', resolve));
      }
      const pct = Math.floor((written / size) * 100);
      if (pct >= lastLoggedPct + 25 && pct < 100) {
        lastLoggedPct = pct;
        log(`  ${relPath}: ${pct}%`);
      }
    }
    await new Promise((resolve, reject) => out.end(resolve).on('error', reject));

    if (written !== size) throw new Error(`tamanho inesperado (${written} != ${size})`);
    const digest = hash.digest('hex');
    if (digest !== oid) throw new Error(`checksum divergente (${digest.slice(0, 12)} != ${oid.slice(0, 12)})`);

    await fsp.rename(tmp, abs);
    log(`✔ ${relPath} (${(size / 1024 / 1024).toFixed(1)} MB) resolvido`);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

async function main() {
  if (SKIP) {
    log('SKIP_LFS_FETCH ativo — mantendo os ponteiros LFS como estão.');
    return;
  }

  const paths = await trackedPaths();
  if (paths.length === 0) {
    log('Nenhum caminho rastreado por LFS em .gitattributes. Nada a fazer.');
    return;
  }

  const pointers = (await Promise.all(paths.map(readPointer))).filter(Boolean);
  if (pointers.length === 0) {
    log('Todos os arquivos LFS já estão materializados. Nada a baixar.');
    return;
  }

  const endpoint = lfsEndpoint(remoteUrl());
  if (!endpoint) {
    warn('Não foi possível determinar o endpoint LFS (defina LFS_REMOTE_URL). Pulando.');
    return;
  }

  const totalMb = (pointers.reduce((acc, p) => acc + p.size, 0) / 1024 / 1024).toFixed(1);
  log(`${pointers.length} ponteiro(s) LFS a resolver (~${totalMb} MB) via ${endpoint}`);

  const actions = await resolveDownloadUrls(endpoint, pointers);
  for (const pointer of pointers) {
    const action = actions.get(pointer.oid);
    if (!action) {
      warn(`sem URL de download para ${pointer.relPath} — repositório privado? defina GITHUB_TOKEN.`);
      continue;
    }
    await download(pointer, action);
  }
}

try {
  await main();
} catch (err) {
  const message = `${err?.message ?? String(err)}${err?.cause?.message ? ` (${err.cause.message})` : ""}`;
  if (STRICT) {
    console.error(`[fetch-lfs-assets] ✖ ${message}`);
    process.exit(1);
  }
  warn(`${message}`);
  warn(
    'Seguindo com os ponteiros LFS. O app carrega normalmente (catálogo, entidades e grafo); ' +
      'apenas a busca semântica/híbrida fica vazia até os embeddings estarem disponíveis.'
  );
}
