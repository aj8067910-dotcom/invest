import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Badge, Empty, NumInput } from './ui';
import { AssetLink, ClassBadge } from './common';
import { brl, pct, priceFmt, qtyFmt, signedPct } from '../domain/format';
import { SELL_STATUS, type Crit, type SellEval } from '../domain/calc/sell';
import { useAlert } from '../services/sellAlert';
import type { Asset } from '../domain/types';
import { toast } from './toast';

const SHORT: Record<Crit['key'], string> = { bazin: '1 Bazin', graham: '2 Graham', multiplos: '3 Múltiplos', oportunidade: '4 Oportunidade', sustentabilidade: '5 Dividendos', meta: '6 Meta' };
const dot = (c: Crit) => (c.signal === true ? <span className="neg" title="indica venda">▲</span> : c.signal === false ? <span className="pos" title="não indica">●</span> : <span className="dim" title="sem dado / não se aplica">○</span>);

/** Aba "Oportunidade de Venda": só os ativos que você moveu para cá. */
export function SellPanel({ onMoveBack }: { onMoveBack: (a: Asset) => void }) {
  const d = useDerived();
  const updateAsset = useStore((s) => s.updateAsset);
  const alert = useAlert();
  const [open, setOpen] = useState<string | null>(null);
  const rows = d.sell;
  const count = (k: SellEval['status']) => rows.filter((r) => r.status === k).length;
  if (!rows.length)
    return (
      <Empty>
        Nenhum ativo aqui. Na aba Carteira, use <b>→ Venda</b> no ativo que você quer avaliar para venda. O preço médio, a cotação, os proventos recebidos e os indicadores aparecem automaticamente.
      </Empty>
    );
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <Badge tone="good">VENDER {count('vender')}</Badge>
        <Badge tone="warn">AGUARDAR {count('aguardar')}</Badge>
        <Badge tone="bad">NÃO VENDER {count('nao_vender')}</Badge>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          Alerta por e-mail: {alert.url ? <>publicado {alert.at ? new Date(alert.at).toLocaleString('pt-BR') : '—'} · <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(alert.url!); toast('Link do alerta copiado.'); }}>copiar link do alerta</button></> : alert.error ? <span className="neg">{alert.error}</span> : <>ative a nuvem em <Link to="/dados">Dados & integrações</Link></>}
        </span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Ativo</th><th className="num">Qtd</th><th className="num">Preço médio</th><th className="num">Cotação</th><th className="num">Proventos recebidos</th><th className="num">Retorno total</th>
              <th title="1 Bazin · 2 Graham · 3 Múltiplos · 4 Oportunidade · 5 Dividendos" style={{ textAlign: 'center' }}>Critérios 1·2·3·4·5</th>
              <th className="num" style={{ minWidth: 96 }}>Meta (%)</th><th>Status</th><th className="num">Vira VENDER em</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = r.asset;
              const st = SELL_STATUS[r.status];
              return (
                <Fragment key={a.id}>
                  <tr onClick={() => setOpen(open === a.id ? null : a.id)} style={{ cursor: 'pointer' }}>
                    <td><AssetLink a={a} /> <ClassBadge c={a.class} /></td>
                    <td className="num">{r.qty ? qtyFmt(r.qty, a.class) : '—'}</td>
                    <td className="num">{r.qty ? priceFmt(r.avgPrice, a.class) : '—'}</td>
                    <td className="num">{priceFmt(r.price, a.class)}</td>
                    <td className="num pos">{brl(r.income)}</td>
                    <td className={`num ${(r.totalReturnPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{r.totalReturnPct === null ? '—' : <>{signedPct(r.totalReturnPct)}<div className="dim" style={{ fontSize: 11 }}>{brl(r.totalReturn)}</div></>}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', letterSpacing: 4 }}>{r.criteria.filter((c) => c.key !== 'meta').map((c) => <span key={c.key} title={`${SHORT[c.key]}: ${c.value} — ${c.detail}`}>{dot(c)}</span>)}</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <NumInput value={a.sellTarget ?? null} suffix="%" onChange={(v) => updateAsset(a.id, { sellTarget: v })} />
                    </td>
                    <td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {r.reviewThesis && <div><Badge tone="warn" title="Retorno negativo com piora de payout, lucro, dívida ou proventos. Segurar perdedores só por causa do prejuízo é um viés caro (Odean, 1998; Fisher).">⚠ revisar tese</Badge></div>}
                      <div className="dim" style={{ fontSize: 11 }}>{r.signals} sinal(is){r.metaHit ? ' · meta atingida' : ''}</div>
                    </td>
                    <td className="num">{r.status === 'vender' ? '—' : r.triggerPrice ? priceFmt(r.triggerPrice, a.class) : <span className="dim" title="Os critérios de preço não chegam a 2 sinais nesta faixa de cotação; só a meta pessoal ou novos sinais de balanço levariam a VENDER">só pela meta</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}><button className="btn ghost sm" onClick={() => onMoveBack(a)} title="Voltar para a carteira">→ Carteira</button></td>
                  </tr>
                  {open === a.id && (
                    <tr>
                      <td colSpan={11} style={{ background: 'var(--bg2)', whiteSpace: 'normal' }}>
                        <SellDetail r={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        ▲ indica venda · ● não indica · ○ sem dado ou não se aplica. <b>VENDER</b>: retorno total positivo e {d.settings.sell.minSignals} ou mais sinais (critérios 1 a 5) ou meta atingida. <b>AGUARDAR</b>: retorno positivo sem esses critérios. <b>NÃO VENDER</b>: retorno negativo. Clique na linha para ver o cálculo. Classificação para sua análise; a decisão é sua.
      </p>
    </div>
  );
}

function SellDetail({ r }: { r: SellEval }) {
  const d = useDerived();
  const f = d.fund[r.asset.id];
  const fv = f?.asset.fundamentals || {};
  return (
    <div className="grid g2" style={{ padding: '6px 0', maxWidth: 1180 }}>
      <div>
        <b style={{ fontSize: 12.5 }}>Critérios</b>
        <table className="tbl"><tbody>
          {r.criteria.map((c) => (
            <tr key={c.key}><td style={{ width: 24 }}>{dot(c)}</td><td style={{ whiteSpace: 'nowrap' }}>{c.label}</td><td><b>{c.value}</b><div className="muted" style={{ fontSize: 12 }}>{c.detail}</div></td></tr>
          ))}
        </tbody></table>
      </div>
      <div>
        <b style={{ fontSize: 12.5 }}>Posição e indicadores</b>
        <table className="tbl"><tbody>
          <tr><td className="muted">Custo da posição</td><td>{brl(r.cost)}</td></tr>
          <tr><td className="muted">Valor de mercado</td><td>{brl(r.marketValue)}</td></tr>
          <tr><td className="muted">Proventos recebidos</td><td>{brl(r.income)}</td></tr>
          <tr><td className="muted">Retorno total</td><td>{brl(r.totalReturn)} ({signedPct(r.totalReturnPct)})</td></tr>
          <tr><td className="muted">No mesmo período</td><td>CDI {signedPct(r.cdiPct)} · IPCA+ {signedPct(r.ipcaPlusPct)}</td></tr>
          <tr><td className="muted">DY projetado</td><td>{pct(r.dyProjected, 2)}</td></tr>
          <tr><td className="muted">Preço de saída ({pct(d.settings.sell.exitDy, 0)}) · livro (4%)</td><td>{priceFmt(r.exitPrice, r.asset.class)} · {priceFmt(r.bookExitPrice, r.asset.class)}</td></tr>
          <tr><td className="muted">Número de Graham</td><td>{r.graham ? `${brl(r.graham)} (prêmio ${signedPct(r.premium, 0)})` : '—'}</td></tr>
          <tr><td className="muted">P/L · P/VP</td><td>{r.pl ? r.pl.toFixed(1).replace('.', ',') : '—'} · {r.pvp ? r.pvp.toFixed(2).replace('.', ',') : '—'}</td></tr>
          <tr><td className="muted">Payout · ROE</td><td>{pct(fv.payout, 0)} · {pct(fv.roe, 1)}</td></tr>
          <tr><td className="muted">Dív. líq./EBITDA</td><td>{fv.netDebtEbitda !== undefined && fv.netDebtEbitda !== null ? `${fv.netDebtEbitda.toFixed(2).replace('.', ',')}x` : '—'}</td></tr>
          <tr><td className="muted">Fonte dos indicadores</td><td>{f?.cvm ? `CVM — DFP ${f.cvm.year}` : 'manual / sem dado'}</td></tr>
          <tr><td className="muted">IR estimado na venda</td><td>{r.taxEstimate === null ? '—' : brl(r.taxEstimate)} <span className="muted" style={{ fontSize: 12 }}>{r.taxNote}</span></td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

/** Aba "Metodologia de Venda": fontes e regras (docs/METODOLOGIA_VENDA.md). */
export function SellMethodology() {
  const d = useDerived();
  const R = d.settings.sell;
  const refs: [string, string, string][] = [
    ['Décio Bazin — Faça Fortuna com Ações', '6% de DY é o piso para comprar (preço-teto = DPA ÷ 0,06). Para vender, o livro (p. 136) indica o DY de 4%, cerca de 50% acima do teto.', 'Critério 1 — você escolheu sinalizar em 6%; o preço pela regra do livro (4%) aparece ao lado.'],
    ['Benjamin Graham — O Investidor Inteligente (cap. 14)', 'Valor intrínseco conservador: √(22,5 × LPA × VPA), ou seja, P/L ≤ 15 e P/VP ≤ 1,5. Regra de venda atribuída a ele: alta de 50% ou 2 anos.', 'Critério 2.'],
    ['Philip Fisher — Ações Comuns, Lucros Extraordinários', 'Se a compra foi bem feita, vender "quase nunca". Só três motivos: a compra foi um erro, a empresa deixou de cumprir os critérios, há oportunidade claramente melhor.', 'Critérios 4 e 5.'],
    ['Peter Lynch — O Jeito Peter Lynch de Investir', 'Empresas grandes e estáveis: realizar após 30–50% de alta se ficaram caras. Saber por que comprou define quando vender.', 'Critério 6 (meta pessoal).'],
    ['Luiz Barsi Filho', '"Quando está cara, eu não realizo lucro, simplesmente deixo de comprar." O objetivo é viver da renda.', 'Por isso VENDER exige 2 sinais, não 1.'],
    ['Odean (1998), Journal of Finance 53(5); Shefrin e Statman (1985)', 'Efeito disposição: vende-se ganhador cedo demais e segura-se perdedor; isso reduz o retorno.', 'Aviso "⚠ revisar tese" com retorno negativo e deterioração.'],
    ['Barber e Odean (2000), Journal of Finance 55(2)', 'Quem mais negocia rende menos: 11,4% contra 17,9% a.a. do mercado.', 'Sinais múltiplos; IR e custos mostrados.'],
    ['Campbell e Shiller (1998), Journal of Portfolio Management 24(2)', 'Múltiplos altos preveem retornos menores; a volta à média é pelo preço.', 'Critério 3.'],
    ['Lintner (1956); Benartzi, Michaely e Thaler (1997)', 'Empresas suavizam dividendos e só cortam com piora persistente do lucro.', 'Critério 5.'],
    ['Lei 11.033/2004, art. 3º; IN RFB 1.585/2015; Lei 8.668/1993', 'Ações: 15% sobre o ganho, isenção de R$ 20 mil de vendas no mês. FII: 20%, sem isenção.', 'IR estimado na venda (informativo).'],
  ];
  const crit: [string, string, string][] = [
    ['1. Preço de saída Bazin', 'DPA de referência líquido (sem extraordinários) ÷ DY de saída', `cotação ≥ preço de saída (DY projetado < ${R.exitDy}%)`],
    ['2. Prêmio sobre Graham', 'cotação ÷ √(22,5 × LPA × VPA) − 1', `prêmio > ${R.grahamPremium}% (FII e lucro ≤ 0: não se aplica)`],
    ['3. P/L e P/VP vs. 5 anos', 'hoje vs. média dos últimos 5 anos (preço médio do ano ÷ LPA/VPA da CVM)', `os dois acima da média e um deles ≥ ${R.multiplesPct}% acima`],
    ['4. Custo de oportunidade', 'retorno total vs. cada compra aplicada no CDI e em IPCA + taxa da NTN-B da data', 'rendeu menos que o CDI e o DY projetado é menor que a NTN-B de hoje'],
    ['5. Sustentabilidade dos dividendos', 'payout de 3 anos e tendência, lucro, DL/EBITDA (bancos: ROE), corte do provento 12m', `2 ou mais: payout > ${R.payoutMax}% ou subindo 3 anos acima de ${R.payoutRising}%; lucro caindo 2 anos; DL/EBITDA > ${R.ndEbitdaMax}x ou +${R.ndEbitdaRise}x em 2 anos; provento ${R.dividendCut}% menor`],
    ['6. Meta pessoal', 'coluna editável na aba', 'retorno total ≥ meta'],
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="note">A plataforma classifica e explica; a decisão de vender é sua. Limiares editáveis em <Link to="/config">Parâmetros → Critérios de venda</Link>.</div>
      <div>
        <b>Status</b>
        <ul className="reasons">
          <li><Badge tone="good">VENDER</Badge> retorno total positivo e {R.minSignals} ou mais sinais dos critérios 1 a 5, ou meta atingida.</li>
          <li><Badge tone="warn">AGUARDAR</Badge> retorno positivo, critérios ainda não atingidos.</li>
          <li><Badge tone="bad">NÃO VENDER</Badge> retorno negativo. Com deterioração (critério 5), aparece "⚠ revisar tese".</li>
        </ul>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Critério</th><th>Cálculo</th><th>Indica venda quando</th></tr></thead>
          <tbody>{crit.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Referência</th><th>O que diz sobre vender</th><th>Como entra aqui</th></tr></thead>
          <tbody>{refs.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td className="muted">{c}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Fontes consultadas: Suno e UFPel (Bazin, p. 136), Investidor10; Graham number (Wikipedia), Stingy Investor e AAII (Graham); Safal Niveshak e MOI Global (Fisher); GuruFocus (Lynch); IstoÉ Dinheiro e Cortes Investimentos (Barsi); CFA Institute (Odean 1998); artigo de Barber e Odean (Berkeley, RePEc); NBER w8221 (Campbell e Shiller). Parte das citações de livros foi confirmada em resumos de terceiros. Texto completo com links em docs/METODOLOGIA_VENDA.md no repositório.
      </p>
    </div>
  );
}
