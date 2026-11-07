import { useState } from 'react';
import { Badge, Card, Field, Modal } from './ui';
import { connect, disconnect, loadConfig, pull, push, resolveConflict, setRemember, unlock, useCloud } from '../services/cloudsync';
import { dateTimeBR } from '../domain/format';
import { toast } from './toast';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Radar%20de%20Investimentos';

export function CloudCard() {
  const cloud = useCloud();
  const cfg = loadConfig();
  const [token, setToken] = useState('');
  const [pass, setPass] = useState('');
  const [remember, setRem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const doUnlock = async () => {
    setBusy(true);
    try {
      await unlock(pass, remember);
      setPass('');
      toast('Nuvem desbloqueada.');
    } catch (e: any) {
      toast(e?.message || String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const go = async (prefer?: 'nuvem' | 'local') => {
    setBusy(true);
    try {
      const r = await connect(token.trim() || cfg?.token || '', pass || cfg?.passphrase || '', prefer, remember);
      if (r !== 'escolher') {
        toast({ criado: 'Nuvem ativada. Seus dados foram salvos no cofre.', baixado: 'Dados baixados da nuvem.', enviado: 'Dados deste aparelho enviados à nuvem.' }[r]);
        setToken('');
        setPass('');
      }
    } catch (e: any) {
      toast(e?.message || String(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Banco de dados na nuvem"
      sub="Cadastre uma vez e use em qualquer computador ou celular. Os dados são criptografados no seu navegador e guardados num gist secreto da sua conta GitHub."
      className="hl"
      right={cfg ? <Badge tone={cloud.status === 'ok' ? 'good' : cloud.status === 'error' || cloud.status === 'conflict' ? 'bad' : 'info'}>{cloud.status === 'ok' ? 'Ativa' : cloud.status === 'syncing' ? 'Sincronizando' : cloud.status === 'conflict' ? 'Conflito' : cloud.status === 'error' ? 'Erro' : cloud.status === 'locked' ? 'Senha necessária' : 'Ativa'}</Badge> : <Badge tone="warn">Desativada</Badge>}
    >
      {cfg && !cfg.passphrase ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="note warn">A senha da nuvem não fica guardada neste aparelho. Digite-a para sincronizar; até lá, suas alterações ficam só aqui.</div>
          <div className="form-grid">
            <Field label="Senha de criptografia">
              <input id="cloud-unlock" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pass && doUnlock()} />
            </Field>
            <Field label="Neste aparelho">
              <label className="chk" style={{ padding: '7px 0' }}><input type="checkbox" checked={remember} onChange={(e) => setRem(e.target.checked)} /> lembrar a senha (cifrada)</label>
            </Field>
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy || !pass} onClick={doUnlock}>{busy ? 'Conferindo…' : 'Desbloquear'}</button>
            <button className="btn ghost" onClick={disconnect}>Desativar neste aparelho</button>
          </div>
        </div>
      ) : cfg ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="note">
            {cloud.message || 'Sincronização ativa.'} {cloud.lastSync && <span className="dim">Última sincronização: {dateTimeBR(cloud.lastSync)}.</span>}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Cada alteração é salva na nuvem cerca de 3 segundos depois. Ao abrir o Radar ou voltar para a aba, ele busca o que você mudou em outro aparelho.
          </p>
          <div className="row">
            <button className="btn" disabled={cloud.status === 'syncing'} onClick={() => pull()}>Buscar da nuvem agora</button>
            <button className="btn" disabled={cloud.status === 'syncing'} onClick={() => push(true)}>Enviar este aparelho agora</button>
            <button className="btn ghost" onClick={disconnect}>Desativar neste aparelho</button>
          </div>
          <label className="chk" style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={cfg.remember} onChange={(e) => { setRemember(e.target.checked); force((x) => x + 1); toast(e.target.checked ? 'A senha fica guardada neste aparelho, cifrada.' : 'A senha deixa de ficar guardada: será pedida na próxima abertura.'); }} />
            Lembrar a senha neste aparelho (cifrada com uma chave que não sai do navegador). Desligado: a senha é pedida a cada abertura — mais seguro em aparelho compartilhado.
          </label>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 13 }}>
            <li>
              Crie um token no GitHub com <b>apenas</b> a permissão <span className="mono">gist</span>:{' '}
              <a href={TOKEN_URL} target="_blank" rel="noreferrer">abrir página de criação do token ↗</a>. Em “Expiration”, escolha “No expiration” para não precisar refazer.
            </li>
            <li>Escolha uma senha de criptografia (mín. 8 caracteres). Ela não é enviada a lugar nenhum: guarde-a, sem ela os dados da nuvem não podem ser lidos.</li>
            <li>Nos outros aparelhos, abra o Radar e informe o mesmo token e a mesma senha. Os dados aparecem automaticamente.</li>
          </ol>
          <div className="form-grid">
            <Field label="Token do GitHub (gist)">
              <input id="cloud-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" />
            </Field>
            <Field label="Senha de criptografia">
              <input id="cloud-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </Field>
            <Field label="Neste aparelho" hint="Desligado: a senha é pedida a cada abertura">
              <label className="chk" style={{ padding: '7px 0' }}><input type="checkbox" checked={remember} onChange={(e) => setRem(e.target.checked)} /> lembrar a senha (cifrada)</label>
            </Field>
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy || !token.trim() || pass.length < 8} onClick={() => go()}>
              {busy ? 'Conectando…' : 'Ativar sincronização'}
            </button>
            {cloud.status === 'error' && <span className="neg" style={{ fontSize: 12.5 }}>{cloud.message}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Pergunta qual versão manter quando nuvem e aparelho mudaram ao mesmo tempo. */
export function ConflictModal() {
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  const c = cloud.conflict;
  const choose = async (k: 'nuvem' | 'local') => {
    setBusy(true);
    try {
      const cfg = loadConfig();
      // conflito na primeira conexão deste aparelho: refaz a conexão com a escolha
      if (cfg && !cfg.lastRemoteAt && cfg.passphrase) await connect(cfg.token, cfg.passphrase, k);
      else await resolveConflict(k);
      toast(k === 'nuvem' ? 'Versão da nuvem aplicada.' : 'Versão deste aparelho enviada à nuvem.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!c} onClose={() => {}} title="Qual versão dos dados manter?">
      {c && (
        <div className="stack">
          <p style={{ margin: 0 }}>{cloud.message}</p>
          <div className="grid g2">
            <div className="note">
              <b>Nuvem</b>
              <br />
              Salva em {dateTimeBR(c.remote.updatedAt)} ({c.remote.device})
              <br />
              {c.remote.assets.length} ativos · {c.remote.transactions.length} operações
            </div>
            <div className="note">
              <b>Este aparelho</b>
              <br />
              Dados abertos agora
            </div>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>A versão descartada é substituída. Se tiver dúvida, baixe um backup JSON antes.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" disabled={busy} onClick={() => choose('local')}>Manter este aparelho</button>
            <button className="btn primary" disabled={busy} onClick={() => choose('nuvem')}>Usar a da nuvem</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
