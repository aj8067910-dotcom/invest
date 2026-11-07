# Correções executadas

Regras seguidas: nenhum dado existente apagado ou sobrescrito; nenhuma funcionalidade removida; nenhuma validação desligada; cada correção relevante tem teste de regressão. Nenhuma migração de esquema foi necessária.

| ID | Prioridade | Arquivos | O que mudou | Teste de regressão | Resultado |
|---|---|---|---|---|---|
| A-04 | P0 | `src/domain/ledger.ts` (novas `liveFingerprints`, `uniqueFingerprints`); `src/store/store.ts` (`applyAutoPlan`, `addTransaction`, `commitImportChunk`) | Duplicidade avaliada só contra lançamentos válidos; os estornados no mesmo plano não bloqueiam a recriação; impressão digital continua única no livro inteiro (#2, #3…) | `persistencia.test.ts › [ACHADO A-04]`, `relançar operação estornada`, `duplicata ATIVA continua bloqueada` | passa |
| A-02 | P1 | `src/domain/opsheet.ts` (`buildRecords` usa só lançamentos válidos para duplicidade e conciliação); store como acima | Reimportação após reverter volta a gravar as linhas | `importacao.test.ts › [ACHADO A-02]`; `persistencia.test.ts › reimportação` | passa |
| A-01 | P1 | `src/domain/calc/positions.ts` (`portfolioTotals`: `accumulatedResult`, novo `netInvested`); `src/pages/Dashboard.tsx` | Resultado acumulado = valorização + vendas + proventos recebidos; sem aportes lançados o card mostra "Capital investido (compras − vendas)"; caixa estimado na legenda | `historico.test.ts › A-01, A-01b`; conferido no navegador (Painel = Rendimento: R$ 4.217,63) | passa |
| A-03 | P2 | `src/domain/calc/yoc.ts` (nova `realYield`); `src/components/YocPanel.tsx` | Card e coluna "DY médio real" (proventos recebidos ÷ capital × tempo, a.a.) na tela Dividendos | `integracao.test.ts › A-03` | passa |
| PERF-01 | P2 | `src/domain/calc/yoc.ts` (`yocHistory`) | Lê o custo do livro já calculado em vez de recalcular a carteira a cada mês | `yoc.test.ts › histórico` (mesmos valores); `desempenho.test.ts` (1.480 → 43 ms) | passa |
| D-01 | P2 | `scripts/fetch-market.ts` | Tempo-limite de 90 s por requisição | robô executado: 0 erros | passa |
| D-02 | P2 | `.github/workflows/deploy.yml` | Se o robô falhar por completo, republica o último `market-data.json` válido | deploy nº 26 no GitHub Actions concluído com o passo novo | passa |
| S-01 | P1 | `src/services/secureLocal.ts` (novo); `src/services/cloudsync.ts` (`toStored`, `fromStored`, `initConfig`, `unlock`, `setRemember`, estado `locked`); `src/components/CloudCard.tsx`; `src/App.tsx`; `src/styles.css` | Token sempre cifrado com chave não-exportável do aparelho; senha da nuvem só na memória da sessão, ou cifrada se você marcar "Lembrar neste aparelho"; migração automática do formato antigo | `seguranca.test.ts` (6); navegador: formato antigo regravado sem texto claro; sem senha → pede ao abrir | passa |
| SEC-02 | P2 | `package-lock.json` | `npm audit fix` sem `--force`: react-router-dom 6.28.0 → 6.30.6, vite 5.4.11 → 5.4.21, vitest 2.1.8 → 2.1.9, fflate 0.8.2 → 0.8.3 | typecheck, build, 127 testes | passa |

## Não executadas (exigem decisão ou dado seu)
- **REQ-01 / REQ-02** (coluna "Opções", nota da Rico): faltam exemplos.
- **REQ-03** (alerta por e-mail): falta o link do gist.
- **SEC-03** (vite/vitest *major*), **SEC-04** (CSP), **SEC-05** (visibilidade do repositório), **Q-01** (lint), **UX-01/UX-03**: baixa prioridade, ficam no plano.

## Efeito nos seus dados
- Proventos automáticos que tinham sido estornados por recálculo e não recriados (A-04) **voltam sozinhos** na próxima atualização do painel, com o motivo registrado na auditoria interna.
- Nenhum lançamento seu é alterado; o livro continua só de inclusão.
- Nuvem (S-01): na primeira abertura depois da atualização, a configuração antiga é regravada cifrada e a senha continua lembrada (você não precisa redigitar). Para mais segurança, desmarque "Lembrar a senha neste aparelho" em Dados & integrações: a senha passa a ser pedida a cada abertura.
