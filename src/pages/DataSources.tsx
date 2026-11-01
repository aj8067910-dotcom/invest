import { useRef, useState } from 'react';
import { useDerived } from '../store/derived';
import { hasPreMigrationBackup, makeBackup, restorePreMigrationBackup, useStore, type BackupData } from '../store/store';
import { Badge, Card, DataTag, Disclaimer, Field, Modal } from '../components/ui';
import { AssetLink, ClassBadge } from '../components/common';
import { ageDays, dateBR, dateTimeBR, num } from '../domain/format';
import { syncMacro, syncQuotes } from '../services/sync';
import { download } from '../services/io';
import { todayISO } from '../domain/util';
import { toast } from '../components/toast';
import { CloudCard } from '../components/CloudCard';
import { RobotCard } from '../components/RobotCard';

const SOURCES: { name: string; what: string; status: 'auto' | 'manual'; url: string }[] = [
  { name: '1. B3 — COTAHIST e listados', what: 'Fechamento oficial, liquidez (21 pregões), proventos com data-com, pagamento e tipo, eventos (bonificação, desdobramento) e segmento de listagem', status: 'auto', url: 'https://www.b3.com.br' },
  { name: '2. CVM — dados abertos', what: 'DFP consolidada de 5 anos (balanço, DRE, DFC) e Informe Mensal Estruturado de FII (VP/cota, cotistas, PL, taxa)', status: 'auto', url: 'https://dados.cvm.gov.br' },
  { name: '3. Relações com investidores', what: 'Perfil da dívida, indicadores de bancos/seguradoras, dados de FII de relatório gerencial (preenchimento manual com fonte e data)', status: 'manual', url: 'https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx' },
  { name: '4. Banco Central — SGS', what: 'Selic, CDI e IPCA (último valor e séries mensais para TWR × CDI e correção pelo IPCA), dólar PTAX', status: 'auto', url: 'https://www3.bcb.gov.br/sgspub' },
  { name: '5. Tesouro Nacional', what: 'PU e taxas do Tesouro Direto e NTN-B de referência (custo de oportunidade)', status: 'auto', url: 'https://www.tesourotransparente.gov.br' },
  { name: 'Fallback: Yahoo Finance', what: 'Só quando a B3 não traz o dado: preços diários (volatilidade, 52 semanas), proventos anteriores à janela da B3 (data-com = pregão anterior à data-ex, tipo não informado → confiabilidade estimada)', status: 'auto', url: 'https://finance.yahoo.com' },
  { name: 'Fallback: CoinGecko / brapi.dev', what: 'Cripto (CoinGecko); ativos fora da lista do robô (brapi, token opcional)', status: 'auto', url: 'https://www.coingecko.com' },
];

export default function DataSources() {
  const d = useDerived();
  const { updateSettings, syncLog, macro, restoreBackup, resetAll } = useStore();
  const [token, setToken] = useState(d.settings.integrations.brapiToken);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupData | null>(null);
  const [reset, setReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Integrações</div>
          <h1>Dados & integrações</h1>
          <p>Todo dado exibe sua origem e data. O sistema nunca inventa cotações, proventos ou indicadores: sem integração disponível, o campo fica marcado como <DataTag kind="ausente" /> e aceita preenchimento manual <DataTag kind="manual" />.</p>
        </div>
      </div>
      <CloudCard />
      <RobotCard />
      <div className="grid g2">
        <Card title="brapi.dev — token opcional" sub="Não é necessário para os ativos cadastrados: eles vêm do robô diário. O token só serve para ativos novos que você adicionar e que não estejam na lista do robô. Com a nuvem ativa, o token vai junto (criptografado) para os outros aparelhos.">
          <div className="row">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="cole seu token" style={{ flex: 1 }} />
            <button className="btn" onClick={() => { updateSettings((s) => ({ ...s, integrations: { ...s.integrations, brapiToken: token.trim() } })); toast('Token salvo.'); }}>Salvar</button>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!!busy} onClick={() => run(async () => { const r = await syncQuotes({ onProgress: setBusy }); toast(`${r.ok.length} atualizados, ${r.failed.length} falhas, ${r.dividendsAdded} proventos novos.`, r.ok.length === 0 && r.failed.length > 0); }, 'Cotações…')}>
              {busy?.startsWith('brapi') || busy === 'Cotações…' ? busy : 'Atualizar cotações e proventos'}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => run(async () => { const r = await syncMacro(); toast(`${r.ok} séries do Banco Central atualizadas.`, r.failed.length > 0); }, 'Banco Central…')}>
              Atualizar Banco Central
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Proventos importados entram como recorrentes; pagamentos atípicos (&gt; 2,5× a mediana) são marcados como extraordinários automaticamente — revise na ficha de cada ativo.</p>
        </Card>
        <Card title="Indicadores macroeconômicos" sub="Fonte primária: Banco Central do Brasil">
          <table className="tbl">
            <tbody>
              {macro.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td className="num">{m.value === null ? '—' : m.key === 'usd' ? 'R$ ' + num(m.value, 4) : num(m.value, 2) + '%'}</td>
                  <td>{m.value === null ? <DataTag kind="ausente" /> : <DataTag kind="real" date={m.date} source={m.source} />}</td>
                  <td className="dim" style={{ fontSize: 12 }}>{m.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Fontes de dados">
        <table className="tbl">
          <thead><tr><th>Fonte</th><th>Uso</th><th>Modo</th></tr></thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name}>
                <td><a href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a></td>
                <td className="muted">{s.what}</td>
                <td>{s.status === 'auto' ? <Badge tone="good">integrado</Badge> : <Badge tone="info">manual</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Cobertura e atualização por ativo">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Ativo</th><th>Classe</th><th>Cotação</th><th>Fonte</th><th className="num">Proventos</th><th>Fundamentos</th></tr></thead>
            <tbody>
              {d.assets.map((a) => (
                <tr key={a.id}>
                  <td><AssetLink a={a} sub={false} /></td>
                  <td><ClassBadge c={a.class} /></td>
                  <td>{a.quote.price === null ? <DataTag kind="ausente" /> : <DataTag kind={a.quote.kind === 'manual' ? 'manual' : 'real'} date={a.quote.date} source={a.quote.source} />}{ageDays(a.quote.date) > 7 && a.quote.date && <span className="warn-t" style={{ fontSize: 11 }}> desatualizada</span>}</td>
                  <td className="dim" style={{ fontSize: 12 }}>{a.quote.source || '—'}</td>
                  <td className="num">{a.class === 'acao' || a.class === 'fii' ? a.distributions.length || <span className="neg">0</span> : <span className="dim">n/a</span>}</td>
                  <td>{a.class === 'cripto' ? <span className="dim">n/a</span> : a.fundamentals.updatedAt ? <DataTag kind="manual" date={a.fundamentals.updatedAt} source={a.fundamentals.source} /> : a.class === 'acao' || a.class === 'fii' ? <DataTag kind="ausente" /> : <span className="dim">ficha</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Backup e restauração" sub="Cópia local extra. Com a nuvem ativa, o backup JSON é opcional.">
          <div className="row">
            <button className="btn primary" onClick={() => download(`radar-backup-${todayISO()}.json`, JSON.stringify(makeBackup(), null, 2), 'application/json')}>Baixar backup completo (JSON)</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const b = JSON.parse(await f.text());
                if (b.app !== 'radar-de-investimentos' || !Array.isArray(b.assets)) throw new Error('arquivo não é um backup do Radar');
                setPending(b);
              } catch (err: any) {
                toast('Backup inválido: ' + err.message, true);
              }
              e.target.value = '';
            }} />
            <button className="btn" onClick={() => fileRef.current?.click()}>Restaurar backup</button>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />
          <div className="row">
            <button className="btn sm" onClick={async () => { if (!(await hasPreMigrationBackup())) return toast('Não há cópia de segurança de migração neste aparelho.', true); const r = await restorePreMigrationBackup(); if (r) { toast(`Cópia de ${dateTimeBR(r.at)} (esquema v${r.version}) restaurada. Recarregando…`); setTimeout(() => location.reload(), 1200); } }}>Restaurar cópia anterior à migração</button>
            <button className="btn danger sm" onClick={() => setReset(true)}>Restaurar cadastro inicial (apaga tudo)</button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Antes de cada migração de esquema, o sistema guarda uma cópia integral dos dados neste aparelho; o backup JSON baixado acima é o JSON consolidado (livro, ativos, parâmetros, auditoria, importações e conciliações).</p>
        </Card>
        <Card title="Log de atualizações">
          {syncLog.length ? (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table className="tbl"><tbody>{syncLog.slice(0, 40).map((l, i) => (
                <tr key={i}><td className="nowrap dim" style={{ fontSize: 12 }}>{dateTimeBR(l.at)}</td><td>{l.ok ? <Badge tone="good">ok</Badge> : <Badge tone="warn">parcial</Badge>}</td><td style={{ fontSize: 12 }}><b>{l.source}</b> — {l.message}</td></tr>
              ))}</tbody></table>
            </div>
          ) : (
            <p className="muted">Nenhuma atualização ainda.</p>
          )}
        </Card>
      </div>

      <Modal open={!!pending} onClose={() => setPending(null)} title="Restaurar backup?">
        {pending && <p>Backup de {dateTimeBR(pending.exportedAt)} com {pending.assets.length} ativos e {pending.transactions.length} operações. Os dados atuais serão substituídos.</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setPending(null)}>Cancelar</button>
          <button className="btn primary" onClick={() => { restoreBackup(pending!); setPending(null); toast('Backup restaurado.'); }}>Restaurar</button>
        </div>
      </Modal>
      <Modal open={reset} onClose={() => setReset(false)} title="Apagar tudo?">
        <p>Todos os ativos, operações, proventos e parâmetros voltarão ao cadastro inicial. Baixe um backup antes. Esta ação não pode ser desfeita.</p>
        <Field label="Última atualização do patrimônio"><span>{dateBR(todayISO())}</span></Field>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn ghost" onClick={() => setReset(false)}>Cancelar</button>
          <button className="btn danger" onClick={() => { resetAll(); setReset(false); toast('Dados reiniciados.'); }}>Apagar e reiniciar</button>
        </div>
      </Modal>
      <Disclaimer />
    </div>
  );
}
