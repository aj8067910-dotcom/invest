// Sincronização em nuvem: os dados ficam num gist SECRETO da conta GitHub do próprio usuário,
// criptografados no navegador (AES-GCM 256, chave derivada da senha via PBKDF2).
// O GitHub só armazena texto cifrado; sem a senha ninguém lê o conteúdo.
import { create } from 'zustand';
import { makeBackup, useStore, type BackupData } from '../store/store';

const GIST_DESC = 'radar-de-investimentos-sync';
const FILE = 'radar-dados.enc.json';
const CFG_KEY = 'radar-cloud-config';
const API = 'https://api.github.com';

export interface CloudConfig {
  token: string;
  passphrase: string;
  gistId: string;
  lastRemoteAt: string | null; // updatedAt do último conteúdo sincronizado
  lastHash: string | null; // hash do estado local no último sync
}

type Status = 'off' | 'syncing' | 'ok' | 'error' | 'conflict';
interface CloudState {
  status: Status;
  message: string;
  lastSync: string | null;
  conflict: { remote: SyncPayload } | null;
  set: (p: Partial<Omit<CloudState, 'set'>>) => void;
}
export const useCloud = create<CloudState>((set) => ({ status: 'off', message: '', lastSync: null, conflict: null, set: (p) => set(p) }));

export interface SyncPayload extends BackupData {
  updatedAt: string;
  device: string;
}

// ───────────── configuração local (fica só neste dispositivo, nunca vai para a nuvem) ─────────────
export function loadConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as CloudConfig) : null;
  } catch {
    return null;
  }
}
function saveConfig(c: CloudConfig | null) {
  try {
    if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}
const deviceName = () => {
  const ua = navigator.userAgent;
  return /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : 'Navegador';
};

// ───────────── criptografia ─────────────
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(data: unknown, pass: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
  return JSON.stringify({ app: 'radar-de-investimentos', v: 1, alg: 'AES-GCM-256/PBKDF2-SHA256-250k', salt: b64(salt), iv: b64(iv), data: b64(ct) });
}

export async function decrypt<T>(text: string, pass: string): Promise<T> {
  const o = JSON.parse(text);
  if (o.app !== 'radar-de-investimentos' || !o.data) throw new Error('Arquivo de sincronização inválido.');
  const key = await deriveKey(pass, unb64(o.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new Error('Senha de criptografia incorreta.');
  }
}

// ───────────── GitHub Gists ─────────────
async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('Token do GitHub inválido ou expirado.');
  if (res.status === 403 || res.status === 404) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.message?.includes('rate limit') ? 'Limite de requisições do GitHub atingido; tente em alguns minutos.' : 'O token não tem permissão para gists (marque a permissão "gist" ao criar o token).');
  }
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}.`);
  return res.json();
}

async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const list: any[] = await gh(token, `/gists?per_page=100&page=${page}`);
    const g = list.find((x) => x.description === GIST_DESC && x.files?.[FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  return null;
}

async function readGist(token: string, id: string): Promise<string | null> {
  const g = await gh(token, `/gists/${id}`);
  const f = g.files?.[FILE];
  if (!f) return null;
  if (f.truncated && f.raw_url) return (await fetch(f.raw_url, { cache: 'no-store' })).text();
  return f.content as string;
}

async function writeGist(token: string, id: string | null, content: string): Promise<string> {
  const body = JSON.stringify({ description: GIST_DESC, public: false, files: { [FILE]: { content } } });
  const g = id ? await gh(token, `/gists/${id}`, { method: 'PATCH', body }) : await gh(token, '/gists', { method: 'POST', body });
  return g.id;
}

// ───────────── estado local ─────────────
function localPayload(): { payload: SyncPayload; hash: string } {
  const b = makeBackup();
  const core = { assets: b.assets, transactions: b.transactions, settings: b.settings, macro: b.macro, snapshots: b.snapshots };
  const hash = hashStr(JSON.stringify(core));
  return { payload: { ...b, updatedAt: new Date().toISOString(), device: deviceName() }, hash };
}
function hashStr(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + s.length;
}
function applyRemote(p: SyncPayload, cfg: CloudConfig) {
  useStore.getState().restoreBackup(p);
  const { hash } = localPayload();
  saveConfig({ ...cfg, lastRemoteAt: p.updatedAt, lastHash: hash });
  useCloud.getState().set({ status: 'ok', message: `Dados recebidos da nuvem (${p.device}).`, lastSync: new Date().toISOString(), conflict: null });
}

/** Local tem alterações ainda não enviadas? */
const localDirty = (cfg: CloudConfig) => localPayload().hash !== cfg.lastHash;

// ───────────── API pública ─────────────

/**
 * Conecta este dispositivo. Se já existir um cofre na conta: com `prefer` indefinido e
 * dados locais com conteúdo, devolve 'escolher' para a interface perguntar o que manter.
 */
export async function connect(token: string, passphrase: string, prefer?: 'nuvem' | 'local'): Promise<'criado' | 'baixado' | 'enviado' | 'escolher'> {
  if (passphrase.length < 8) throw new Error('A senha de criptografia precisa ter ao menos 8 caracteres.');
  useCloud.getState().set({ status: 'syncing', message: 'Conectando ao GitHub…' });
  try {
    const gistId = await findGist(token);
    const base: CloudConfig = { token, passphrase, gistId: gistId || '', lastRemoteAt: null, lastHash: null };
    if (!gistId) {
      const { payload, hash } = localPayload();
      const id = await writeGist(token, null, await encrypt(payload, passphrase));
      saveConfig({ ...base, gistId: id, lastRemoteAt: payload.updatedAt, lastHash: hash });
      useCloud.getState().set({ status: 'ok', message: 'Cofre criado na nuvem com os dados deste dispositivo.', lastSync: new Date().toISOString() });
      return 'criado';
    }
    const text = await readGist(token, gistId);
    const remote = text ? await decrypt<SyncPayload>(text, passphrase) : null;
    const st = useStore.getState();
    const localHasData = st.transactions.length > 0 || st.assets.some((a) => a.quote.price !== null || a.distributions.length > 0);
    if (remote && (prefer === 'nuvem' || (!prefer && !localHasData))) {
      applyRemote(remote, base);
      return 'baixado';
    }
    if (remote && !prefer) {
      useCloud.getState().set({ status: 'conflict', message: 'Já existem dados na nuvem e neste dispositivo.', conflict: { remote } });
      saveConfig(base);
      return 'escolher';
    }
    const { payload, hash } = localPayload();
    await writeGist(token, gistId, await encrypt(payload, passphrase));
    saveConfig({ ...base, lastRemoteAt: payload.updatedAt, lastHash: hash });
    useCloud.getState().set({ status: 'ok', message: 'Dados deste dispositivo enviados para a nuvem.', lastSync: new Date().toISOString(), conflict: null });
    return 'enviado';
  } catch (e: any) {
    useCloud.getState().set({ status: 'error', message: e?.message || String(e) });
    throw e;
  }
}

export function disconnect() {
  saveConfig(null);
  useCloud.getState().set({ status: 'off', message: 'Sincronização desativada neste dispositivo. Os dados locais e a cópia na nuvem foram mantidos.', conflict: null });
}

/** Resolve um conflito apontado pela interface. */
export async function resolveConflict(keep: 'nuvem' | 'local') {
  const cfg = loadConfig();
  const c = useCloud.getState().conflict;
  if (!cfg) return;
  if (keep === 'nuvem' && c) return applyRemote(c.remote, cfg);
  useCloud.getState().set({ conflict: null });
  await push(true);
}

let busy = false;

/** Busca alterações feitas em outro dispositivo. */
export async function pull(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg || busy) return;
  busy = true;
  useCloud.getState().set({ status: 'syncing', message: 'Verificando a nuvem…' });
  try {
    const text = await readGist(cfg.token, cfg.gistId);
    if (!text) throw new Error('Cofre não encontrado na conta GitHub.');
    const remote = await decrypt<SyncPayload>(text, cfg.passphrase);
    if (remote.updatedAt !== cfg.lastRemoteAt) {
      if (localDirty(cfg)) useCloud.getState().set({ status: 'conflict', message: `Há alterações novas na nuvem (${remote.device}) e também neste dispositivo.`, conflict: { remote } });
      else applyRemote(remote, cfg);
    } else useCloud.getState().set({ status: 'ok', message: 'Tudo sincronizado.', lastSync: new Date().toISOString() });
  } catch (e: any) {
    useCloud.getState().set({ status: 'error', message: e?.message || String(e) });
  } finally {
    busy = false;
  }
}

/** Envia o estado local, verificando antes se outro dispositivo não gravou nesse meio-tempo. */
export async function push(force = false): Promise<void> {
  const cfg = loadConfig();
  if (!cfg || useCloud.getState().conflict) return;
  if (busy) {
    setTimeout(() => push(force), 2000); // outra operação em andamento: tenta de novo em seguida
    return;
  }
  const { payload, hash } = localPayload();
  if (!force && hash === cfg.lastHash) return;
  busy = true;
  useCloud.getState().set({ status: 'syncing', message: 'Salvando na nuvem…' });
  try {
    if (!force) {
      const text = await readGist(cfg.token, cfg.gistId);
      if (text) {
        const remote = await decrypt<SyncPayload>(text, cfg.passphrase);
        if (remote.updatedAt !== cfg.lastRemoteAt) {
          useCloud.getState().set({ status: 'conflict', message: `Outro dispositivo (${remote.device}) salvou alterações depois da sua última sincronização.`, conflict: { remote } });
          return;
        }
      }
    }
    await writeGist(cfg.token, cfg.gistId, await encrypt(payload, cfg.passphrase));
    saveConfig({ ...cfg, lastRemoteAt: payload.updatedAt, lastHash: hash });
    useCloud.getState().set({ status: 'ok', message: 'Salvo na nuvem.', lastSync: new Date().toISOString() });
  } catch (e: any) {
    useCloud.getState().set({ status: 'error', message: e?.message || String(e) });
  } finally {
    busy = false;
  }
}

/** Liga a sincronização automática: baixa ao abrir/voltar à aba e envia 3 s após cada alteração. */
let started = false;
export function startAutoSync() {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (loadConfig()) {
    useCloud.getState().set({ status: 'syncing', message: 'Conectando…' });
    pull();
  }
  useStore.subscribe((s, prev) => {
    if (!s.hydrated || !loadConfig()) return;
    if (s.assets === prev.assets && s.transactions === prev.transactions && s.settings === prev.settings && s.macro === prev.macro && s.snapshots === prev.snapshots) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => push(), 3000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && loadConfig()) pull();
    if (document.visibilityState === 'hidden' && loadConfig()) push();
  });
}
