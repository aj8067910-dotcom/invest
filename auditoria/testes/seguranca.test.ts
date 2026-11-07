// AUDITORIA — S-01: credenciais da nuvem nunca em texto claro no armazenamento do navegador.
import { describe, expect, it } from 'vitest';
import { fromStored, toStored, type CloudConfig } from '../../src/services/cloudsync';
import { seal, unseal } from '../../src/services/secureLocal';

const key = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const TOKEN = 'ghp_EXEMPLO_DE_TESTE_123';
const PASS = 'senha-de-teste-forte';
const cfg = (remember: boolean): CloudConfig => ({ token: TOKEN, passphrase: PASS, remember, gistId: 'g1', lastRemoteAt: null, lastHash: null });

describe('[ACHADO S-01] configuração da nuvem cifrada', () => {
  it('a chave do aparelho não pode ser exportada', async () => {
    const k = await key();
    await expect(crypto.subtle.exportKey('raw', k)).rejects.toThrow();
  });
  it('seal/unseal ida e volta; texto cifrado não contém o segredo', async () => {
    const k = await key();
    const s = await seal(TOKEN, k);
    expect(JSON.stringify(s)).not.toContain(TOKEN);
    expect(await unseal(s, k)).toBe(TOKEN);
  });
  it('sem "lembrar": a senha NÃO é gravada; o token vai cifrado', async () => {
    const k = await key();
    const st = await toStored(cfg(false), k);
    const json = JSON.stringify(st);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain(PASS);
    expect(st.pass).toBeNull();
    const back = await fromStored(JSON.parse(json), k);
    expect(back.cfg.token).toBe(TOKEN);
    expect(back.cfg.passphrase).toBeNull(); // será pedida ao abrir
  });
  it('com "lembrar": senha gravada só cifrada', async () => {
    const k = await key();
    const json = JSON.stringify(await toStored(cfg(true), k));
    expect(json).not.toContain(PASS);
    expect((await fromStored(JSON.parse(json), k)).cfg.passphrase).toBe(PASS);
  });
  it('formato antigo em texto claro é migrado (mantém "lembrar") e regravado cifrado', async () => {
    const k = await key();
    const old = { token: TOKEN, passphrase: PASS, gistId: 'g1', lastRemoteAt: '2026-01-01', lastHash: 'h' };
    const { cfg: c, migrated } = await fromStored(old, k);
    expect(migrated).toBe(true);
    expect(c.remember).toBe(true);
    const json = JSON.stringify(await toStored(c, k));
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain(PASS);
  });
  it('chave errada não abre (outro aparelho/navegador)', async () => {
    const s = await seal(TOKEN, await key());
    await expect(unseal(s, await key())).rejects.toThrow();
  });
});
