import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './cloudsync';

describe('criptografia da nuvem', () => {
  it('ida e volta com a senha correta; senha errada é recusada', async () => {
    const data = { a: 1, txt: 'ITUB4 ação' };
    const box = await encrypt(data, 'senha-forte-123');
    expect(box).not.toContain('ITUB4');
    expect(await decrypt(box, 'senha-forte-123')).toEqual(data);
    await expect(decrypt(box, 'outra-senha-1')).rejects.toThrow('Senha');
  });
});
