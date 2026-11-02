import { useState } from 'react';
import type { Asset, AssetClass, FiiType } from '../domain/types';
import { CLASS_LABEL, CLASS_ORDER, EXPOSURE_LABEL, FII_TYPE_LABEL, type Exposure } from '../domain/types';
import { isNum } from '../domain/util';
import { Field, NumInput } from './ui';

export function AssetForm({ initial, onSave, onCancel, isNew }: { initial: Asset; onSave: (a: Asset) => void; onCancel?: () => void; isNew?: boolean }) {
  const [a, setA] = useState<Asset>(initial);
  const up = (p: Partial<Asset>) => setA((x) => ({ ...x, ...p }));
  const setClass = (c: AssetClass) => {
    const p: Partial<Asset> = { class: c };
    if (c === 'etf' && !a.etf) p.etf = { index: '', geography: '', sectorFocus: '', fee: null, liquidity: null, exposureTags: [], overlapTickers: [], distributes: false };
    if (c === 'tesouro' && !a.fixed) p.fixed = { indexer: 'IPCA+', maturity: '', contractedRate: null, marketRate: null, marketRateDate: null, coupons: false };
    if (c === 'cripto' && !a.crypto) p.crypto = { role: '', coingeckoId: '', custody: '' };
    up(p);
  };
  const valid = a.ticker.trim().length >= 2 && (!isNum(a.interestPrice) || !!a.interestNote?.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...a, ticker: a.ticker.trim().toUpperCase() });
      }}
      className="stack"
    >
      <div className="form-grid">
        <Field label="Ticker / código">
          <input value={a.ticker} onChange={(e) => up({ ticker: e.target.value.toUpperCase() })} required disabled={!isNew && false} />
        </Field>
        <Field label="Nome" wide={false}>
          <input value={a.name} onChange={(e) => up({ name: e.target.value })} />
        </Field>
        <Field label="Classe">
          <select value={a.class} onChange={(e) => setClass(e.target.value as AssetClass)}>
            {CLASS_ORDER.map((c) => (
              <option key={c} value={c}>{CLASS_LABEL[c]}</option>
            ))}
          </select>
        </Field>
        <Field label="Lista">
          <select value={a.status} onChange={(e) => up({ status: e.target.value as Asset['status'] })}>
            <option value="carteira">Carteira</option>
            <option value="watchlist">Watchlist</option>
          </select>
        </Field>
        <Field label="Setor">
          <input value={a.sector} onChange={(e) => up({ sector: e.target.value })} />
        </Field>
        <Field label="Emissor / grupo econômico" hint="Ativos do mesmo grupo somam na concentração">
          <input value={a.issuer} onChange={(e) => up({ issuer: e.target.value })} />
        </Field>
        {a.class === 'fii' && (
          <>
            <Field label="Tipo de FII">
              <select value={a.fiiType || ''} onChange={(e) => up({ fiiType: (e.target.value || undefined) as FiiType })}>
                <option value="">—</option>
                {Object.entries(FII_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Segmento">
              <input value={a.fiiSegment || ''} onChange={(e) => up({ fiiSegment: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Moeda de exposição">
          <select value={a.currency} onChange={(e) => up({ currency: e.target.value as Asset['currency'] })}>
            <option value="BRL">Real</option>
            <option value="USD">Dólar / global</option>
          </select>
        </Field>
        <Field label="Exposição">
          <select value={a.international ? '1' : '0'} onChange={(e) => up({ international: e.target.value === '1' })}>
            <option value="0">Brasil</option>
            <option value="1">Internacional</option>
          </select>
        </Field>
        <Field label="Prioridade manual (1–5)" hint="Ajuste leve no ranking (±4 pts)">
          <NumInput value={a.priority} onChange={(v) => up({ priority: Math.max(1, Math.min(5, Math.round(v ?? 3))) })} />
        </Field>
        <Field label="Risco (1 baixo – 5 alto)" hint="≥4 impede prioridade de compra">
          <NumInput value={a.riskLevel} onChange={(v) => up({ riskLevel: Math.max(1, Math.min(5, Math.round(v ?? 3))) })} />
        </Field>
        <Field label="Status da tese">
          <select value={a.thesisStatus} onChange={(e) => up({ thesisStatus: e.target.value as Asset['thesisStatus'] })}>
            <option value="valida">Válida</option>
            <option value="observacao">Em observação</option>
            <option value="deteriorada">Deteriorada</option>
          </select>
        </Field>
        {a.class === 'etf' && a.etf && (
          <>
            <Field label="Índice de referência"><input value={a.etf.index} onChange={(e) => up({ etf: { ...a.etf!, index: e.target.value } })} /></Field>
            <Field label="Exposição geográfica"><input value={a.etf.geography} onChange={(e) => up({ etf: { ...a.etf!, geography: e.target.value } })} /></Field>
            <Field label="Foco setorial"><input value={a.etf.sectorFocus} onChange={(e) => up({ etf: { ...a.etf!, sectorFocus: e.target.value } })} /></Field>
            <Field label="Taxa de administração"><NumInput value={a.etf.fee} suffix="%" onChange={(v) => up({ etf: { ...a.etf!, fee: v } })} /></Field>
            <Field label="Liquidez média (R$ mil/dia)"><NumInput value={a.etf.liquidity} onChange={(v) => up({ etf: { ...a.etf!, liquidity: v } })} /></Field>
            <Field label="Tags de exposição" hint="Separadas por vírgula; tags iguais indicam sobreposição">
              <input value={a.etf.exposureTags.join(', ')} onChange={(e) => up({ etf: { ...a.etf!, exposureTags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } })} />
            </Field>
            <Field label="Ações locais no índice" wide hint="Tickers da carteira contidos no índice (sobreposição)">
              <input value={a.etf.overlapTickers.join(', ')} onChange={(e) => up({ etf: { ...a.etf!, overlapTickers: e.target.value.toUpperCase().split(',').map((x) => x.trim()).filter(Boolean) } })} />
            </Field>
          </>
        )}
        {a.class === 'tesouro' && a.fixed && (
          <>
            <Field label="Indexador">
              <select value={a.fixed.indexer} onChange={(e) => up({ fixed: { ...a.fixed!, indexer: e.target.value as any } })}>
                <option>IPCA+</option>
                <option>Selic</option>
                <option>Prefixado</option>
              </select>
            </Field>
            <Field label="Vencimento"><input type="date" value={a.fixed.maturity} onChange={(e) => up({ fixed: { ...a.fixed!, maturity: e.target.value } })} /></Field>
            <Field label="Taxa contratada média"><NumInput value={a.fixed.contractedRate} suffix="%" onChange={(v) => up({ fixed: { ...a.fixed!, contractedRate: v } })} /></Field>
          </>
        )}
        {a.class === 'cripto' && a.crypto && (
          <>
            <Field label="Papel na carteira"><input value={a.crypto.role} onChange={(e) => up({ crypto: { ...a.crypto!, role: e.target.value } })} /></Field>
            <Field label="ID CoinGecko" hint="ex.: bitcoin, usd-coin"><input value={a.crypto.coingeckoId} onChange={(e) => up({ crypto: { ...a.crypto!, coingeckoId: e.target.value.trim() } })} /></Field>
            <Field label="Custódia"><input value={a.crypto.custody} onChange={(e) => up({ crypto: { ...a.crypto!, custody: e.target.value } })} /></Field>
          </>
        )}
        <Field label="Peso-alvo na carteira" hint="Vazio = limite máximo por ativo (Parâmetros)">
          <NumInput value={a.targetWeight ?? null} suffix="%" onChange={(v) => up({ targetWeight: v })} />
        </Field>
        <Field label="Teto na carteira" hint="Participação máxima deste ativo. Vazio = máximo geral por ativo (Parâmetros)">
          <NumInput value={a.maxWeight ?? null} suffix="%" onChange={(v) => up({ maxWeight: v && v > 0 ? Math.min(100, v) : null })} />
        </Field>
        <Field label="Exposição econômica" hint="Ex.: BOVX11 = ações Brasil">
          <select value={a.exposure || ''} onChange={(e) => up({ exposure: (e.target.value || null) as Exposure | null })}>
            <option value="">automática</option>
            {Object.entries(EXPOSURE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Reserva de emergência" hint="Fica fora do cálculo de alocação">
          <label className="chk" style={{ padding: '7px 0' }}><input type="checkbox" checked={!!a.isReserve} onChange={(e) => up({ isReserve: e.target.checked })} /> é reserva</label>
        </Field>
        {a.class === 'fii' && (
          <Field label="Isenção de IR do rendimento" hint="Lei 14.754/2023: ≥ 100 cotistas, cotas em bolsa, sua participação < 10%">
            <select value={a.fiiTaxExempt === false ? 'nao' : 'sim'} onChange={(e) => up({ fiiTaxExempt: e.target.value === 'sim' })}>
              <option value="sim">cumpre os requisitos (isento)</option>
              <option value="nao">não cumpre (tributado)</option>
            </select>
          </Field>
        )}
        <Field label="Preço de interesse (manual)" hint="Vazio = preço de oportunidade calculado">
          <NumInput value={a.interestPrice ?? null} onChange={(v) => up({ interestPrice: v, interestDate: v ? a.interestDate || new Date().toISOString().slice(0, 10) : null })} />
        </Field>
        {isNum(a.interestPrice) && (
          <>
            <Field label="Justificativa do preço de interesse"><input value={a.interestNote || ''} onChange={(e) => up({ interestNote: e.target.value })} required /></Field>
            <Field label="Data do preço de interesse"><input type="date" value={a.interestDate || ''} onChange={(e) => up({ interestDate: e.target.value })} /></Field>
          </>
        )}
        <Field label="Tese de investimento" wide>
          <textarea value={a.thesis} onChange={(e) => up({ thesis: e.target.value })} placeholder="Por que tenho este ativo? O que me faria vender?" />
        </Field>
        <Field label="Riscos" wide>
          <textarea value={a.risks || ''} onChange={(e) => up({ risks: e.target.value })} placeholder="O que pode dar errado?" />
        </Field>
        <Field label="Catalisadores" wide>
          <textarea value={a.catalysts || ''} onChange={(e) => up({ catalysts: e.target.value })} placeholder="O que pode destravar valor?" />
        </Field>
        <Field label="Gatilhos de revisão (data e descrição)" wide hint="Um por linha: aaaa-mm-dd descrição">
          <textarea defaultValue={(a.triggers || []).map((t) => `${t.date} ${t.text}`).join('\n')} onBlur={(e) => up({ triggers: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ id: l, date: (l.match(/^\d{4}-\d{2}-\d{2}/) || [''])[0], text: l.replace(/^\d{4}-\d{2}-\d{2}\s*/, '') })).filter((t) => t.date) })} />
        </Field>
        <Field label="Notas" wide>
          <textarea value={a.notes} onChange={(e) => up({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>}
        <button className="btn primary" disabled={!valid}>Salvar</button>
      </div>
    </form>
  );
}
