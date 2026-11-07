# Plano de correções — problemas identificados

Auditoria de 07/11/2026 sobre o commit `13a5335` (branch `claude/festive-cannon-p7n4ye`).
Classificação: **P0** crítico · **P1** alto · **P2** médio · **P3** baixo. Status: CORRIGIDO · PENDENTE (com motivo).

| ID | Prioridade | Módulo | Problema | Status |
|---|---|---|---|---|
| A-04 | **P0** | Proventos automáticos / livro | Provento recalculado era estornado e **não recriado** | CORRIGIDO |
| A-01 | **P1** | Painel | "Resultado acumulado" errado (ignorava caixa; sem aportes = patrimônio inteiro) | CORRIGIDO |
| A-02 | **P1** | Importação | Reimportar após reverter um lote descartava as linhas como "duplicadas" | CORRIGIDO |
| S-01 | **P1** | Nuvem | Token do GitHub e senha de criptografia em texto claro no `localStorage` | CORRIGIDO (autorizado em 07/11/2026) |
| A-03 | P2 | Dividendos | "DY médio real" (ponderado pelo tempo) não existia | CORRIGIDO |
| PERF-01 | P2 | Dividendos | Histórico do YoC levava 1,5 s com 10 mil operações | CORRIGIDO (43 ms) |
| D-01 | P2 | Robô | Requisições sem tempo-limite | CORRIGIDO |
| D-02 | P2 | Publicação | Falha total do robô publicava o site sem `market-data.json` | CORRIGIDO |
| SEC-02 | P2 | Dependências | react-router-dom 6.28 com avisos *high* (redirecionamento aberto) | CORRIGIDO (6.30.6); resta 1 *moderate* que exige a versão 7 |
| REQ-01 | P2 | Importação | Coluna "Opções" do modelo não existe | PENDENTE — aguardando exemplo da sua planilha |
| REQ-02 | P2 | Importação | Leitura da nota de corretagem da Rico | PENDENTE — aguardando exemplo (PDF) |
| REQ-03 | P2 | Alerta de venda | E-mail diário depende do link do gist | PENDENTE — você precisa enviar o link (botão "copiar link do alerta") |
| DATA-01 | P2 | Fundamentos | Indicadores anuais (DFP); sem últimos 12 meses trimestrais (ITR) | PENDENTE — melhoria de coleta |
| SEC-03 | P3 | Dependências (dev) | vite/vitest/esbuild/tinypool com avisos que só se resolvem em versões *major* | PENDENTE — afetam só o servidor de desenvolvimento local |
| SEC-04 | P3 | Site | Sem Content-Security-Policy | PENDENTE — requer teste de todas as fontes externas |
| SEC-05 | P3 | Repositório público | Lista de tickers da carteira em `src/domain/seed.ts`, `market/tickers.json` e README | PENDENTE — decisão sua (repositório privado ou cadastro sem tickers) |
| DATA-02 | P3 | Proventos | Proventos antigos (Yahoo) sem tipo: tratados como dividendo, marcados "estimada" | PENDENTE — limitação da fonte |
| DATA-03 | P3 | Fundamentos | Dívida líquida sem arrendamentos (IFRS 16) | PENDENTE — limitação documentada |
| Q-01 | P3 | Qualidade | Projeto sem ESLint | PENDENTE |
| Q-02 | P3 | Qualidade | Testes da pasta `auditoria/` fora do `tsc -b` (rodam no Vitest) | PENDENTE |
| UX-01 | P3 | Carteira | Parâmetro `?aba=` só é lido ao abrir a tela | PENDENTE |
| UX-03 | P3 | Oportunidade de Venda | Filtros de classe e busca aparecem, mas não filtram a tabela de venda | PENDENTE |

## Detalhe dos problemas

### A-04 (P0) — Provento automático estornado e não recriado
- **Módulo:** `src/store/store.ts` (`applyAutoPlan`), `src/domain/ledger.ts`.
- **Evidência:** teste `auditoria/testes/persistencia.test.ts › [ACHADO A-04]` falhava (`expected +0 to be 1`); no teste ponta a ponta anterior a auditoria registrou "0 lançado(s), 2 estornado(s)" após uma correção.
- **Reproduzir:** compra de 100 ações → provento automático criado → corrigir a compra para 150 → o provento de 100 é estornado e o de 150 não aparece.
- **Impacto:** renda, DY, YoC e IR somem em silêncio depois de qualquer correção anterior à data-com.
- **Causa:** a checagem de duplicidade comparava a impressão digital nova com a do lançamento que estava sendo estornado no mesmo passo.
- **Solução:** duplicidade só contra lançamentos válidos (`liveFingerprints`) e impressão digital única no livro inteiro (`uniqueFingerprints`).
- **Corrigido quando:** o teste A-04 passa e os proventos estornados anteriormente voltam sozinhos na próxima atualização (o plano recria o que falta).

### A-01 (P1) — Resultado acumulado do Painel
- **Módulo:** `src/domain/calc/positions.ts` (`portfolioTotals`), `src/pages/Dashboard.tsx`.
- **Evidência:** `auditoria/testes/historico.test.ts › [ACHADO A-01]`: com aporte de R$ 2.000, mostrava **−R$ 200,00**; correto **+R$ 699,98**. Sem aportes lançados mostrava **R$ 1.800,00** (o patrimônio inteiro).
- **Causa:** fórmula "patrimônio + retiradas − aportes" sem o caixa (proventos e vendas não reinvestidos).
- **Solução:** resultado econômico = valorização + resultado de vendas + proventos recebidos (soma do retorno de todas as posições, inclusive encerradas). Sem aportes lançados, o card mostra "Capital investido (compras − vendas)".
- **Corrigido quando:** Painel = "Rendimento da carteira" (verificado: R$ 4.217,63 nas duas telas).

### A-02 (P1) — Reimportação após reverter
- **Módulo:** `src/domain/opsheet.ts` (`buildRecords`), `src/store/store.ts` (`commitImportChunk`, `addTransaction`).
- **Evidência:** `importacao.test.ts › [ACHADO A-02]` e `persistencia.test.ts` falhavam (`expected +0 to be 2`).
- **Impacto:** perda silenciosa de linhas ao corrigir e reenviar um arquivo; relançar operação estornada era recusado como duplicada.
- **Solução:** mesma de A-04.

### S-01 (P1, CORRIGIDO) — Credenciais da nuvem em texto claro
- **Local:** `src/services/cloudsync.ts` (`CFG_KEY = 'radar-cloud-config'`, objeto `{ token, passphrase }`).
- **Risco:** quem tiver acesso ao navegador (extensão maliciosa, computador compartilhado, script injetado) lê o token com permissão de gist **e** a senha que protege todos os dados financeiros.
- **Opções:** (a) pedir a senha a cada abertura e guardar só uma chave derivada não-exportável (`CryptoKey` no IndexedDB) — mais seguro, exige digitar a senha; (b) manter "lembrar neste aparelho" como opção explícita, desligada por padrão; (c) token com escopo mínimo e validade curta (já é só "gist"; recomendar validade de 90 dias).
- **Correção aplicada (opção a + b):** token sempre cifrado com chave AES-GCM 256 não-exportável do aparelho (`src/services/secureLocal.ts`); senha **não** é guardada por padrão (pedida ao abrir, estado "Senha da nuvem"); "Lembrar neste aparelho" opcional, também cifrado. Configuração antiga migrada automaticamente, sem texto claro. Testes: `auditoria/testes/seguranca.test.ts` (6) e navegador.

### Demais
- **A-03:** `realYield()` em `src/domain/calc/yoc.ts` + coluna e card "DY médio real" na tela Dividendos.
- **PERF-01:** `yocHistory()` passou a ler o custo do livro já calculado (mesmo resultado; 1.480 ms → 43 ms).
- **D-01:** `AbortSignal.timeout(90000)` em `scripts/fetch-market.ts`.
- **D-02:** passo "Garantir market-data.json" em `.github/workflows/deploy.yml`.
- **SEC-02:** `npm audit fix` (sem `--force`): react-router-dom 6.30.6, vite 5.4.21, fflate 0.8.3.
