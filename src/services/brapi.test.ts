import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/brapi-itub4.json';
import { fetchBrapi } from './brapi';

describe('brapi.dev', () => {
  it('converte resposta real (amostra gravada) em cotação e proventos por unidade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => fixture })));
    const q = await fetchBrapi('ITUB4', '');
    expect(q.price).toBe(fixture.results[0].regularMarketPrice);
    expect(q.distributions.length).toBeGreaterThan(0);
    const d = q.distributions[0];
    expect(d.exDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(['dividendo', 'jcp', 'rendimento', 'amortizacao', 'outro']).toContain(d.type);
    expect(d.recurring).toBe(true);
    vi.unstubAllGlobals();
  });
});
