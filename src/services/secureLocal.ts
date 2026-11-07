// Guarda segredos do aparelho (token do GitHub, senha da nuvem se você pedir para lembrar) CIFRADOS
// com uma chave AES-GCM 256 gerada no navegador e marcada como NÃO-EXPORTÁVEL (fica no IndexedDB).
// Assim nada fica em texto claro no localStorage (achado S-01 da auditoria). Quem roda código na
// própria página ainda consegue USAR a chave, mas não copiá-la nem ler os segredos direto do disco/armazenamento.
import { get, set } from 'idb-keyval';

export interface Sealed { iv: string; data: string }
const KEY_NAME = 'radar-device-key';
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let cached: Promise<CryptoKey> | null = null;
/** Chave do aparelho: criada uma vez, não-exportável. */
export function deviceKey(): Promise<CryptoKey> {
  cached ||= (async () => {
    const k = (await get(KEY_NAME)) as CryptoKey | undefined;
    if (k) return k;
    const nk = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await set(KEY_NAME, nk);
    return nk;
  })();
  return cached;
}

export async function seal(text: string, key?: CryptoKey): Promise<Sealed> {
  const k = key || (await deviceKey());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text)));
  return { iv: b64(iv), data: b64(ct) };
}

export async function unseal(s: Sealed, key?: CryptoKey): Promise<string> {
  const k = key || (await deviceKey());
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, k, unb64(s.data));
  return new TextDecoder().decode(pt);
}
