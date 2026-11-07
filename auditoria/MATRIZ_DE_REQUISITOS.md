# Matriz de requisitos — rastreabilidade

Fontes dos requisitos: os pedidos feitos durante o desenvolvimento (especificação inicial do Radar, publicação e banco de dados, dados automáticos, Central de Operações, especificação das Etapas 0–10, pedidos posteriores e esta auditoria).

Legenda — **Resultado:** APROVADO (validado com evidência) · APROVADO APÓS CORREÇÃO · PARCIAL · NÃO IMPLEMENTADO · NÃO VALIDADO.
Evidência: arquivo de teste (`auditoria/testes/*`, `src/**/*.test.ts`), teste no navegador (`E2E`) ou inspeção de código (`código`).

| # | Requisito | Implementado | Funciona | Testado | Resultado | Evidência |
|---|---|---|---|---|---|---|
| 1 | Cadastro de ativos (carteira, watchlist, oportunidade de venda) | Sim | Sim | Sim | APROVADO | E2E (adicionar, mover, remover); `watchlist.test.ts` |
| 2 | Ações | Sim | Sim | Sim | APROVADO | `historico.test.ts`, `financeiro.test.ts` |
| 3 | FIIs (rendimentos, isenção, P/VP, segmento) | Sim | Sim | Sim | APROVADO | `aceitacao.test.ts` (caso FII), `breakdown.test.ts` |
| 4 | ETFs nacionais e internacionais | Sim | Sim | Parcial | APROVADO | classe própria, sem Bazin, exposição econômica (`allocation.ts`); cotação B3 do robô |
| 5 | Renda fixa (Tesouro por valor/PU) | Sim | Sim | Sim | APROVADO | `opsheet.test.ts` (renda fixa por valor); PU do Tesouro Transparente |
| 6 | Criptoativos (8 casas) | Sim | Sim | Sim | APROVADO | `yoc.test.ts › 8 casas`; E2E com 0,00045667 BTC |
| 7 | Histórico completo de operações | Sim | Sim | Sim | APROVADO | `historico.test.ts` (10 cenários) |
| 8 | Compras e vendas (PM, realizado) | Sim | Sim | Sim | APROVADO | `historico.test.ts`, `financeiro.test.ts › 5.1` |
| 9 | Aportes separados de reinvestimento | Sim | Sim | Sim | APROVADO | `opsheet.test.ts`; `historico.test.ts` (transferência ≠ aporte) |
| 10 | Dividendos, JCP, rendimentos (líquidos de IR) | Sim | Sim | Sim | APROVADO | `aceitacao.test.ts` (casos 6–8), `financeiro.test.ts › JCP líquido` |
| 11 | Reinvestimentos | Sim | Sim | Sim | APROVADO | `historico.test.ts` (reinvestido 30) |
| 12 | Transferências de custódia | Sim | Sim | Sim | APROVADO | `historico.test.ts` (sem efeito na posição nem no aporte) |
| 13 | Eventos corporativos (desdobro, grupamento, bonificação, cisão, incorporação, troca, subscrição, leilão) | Sim | Sim | Sim | APROVADO | `aceitacao.test.ts` (casos 3–4, eventos), `engine.test.ts` |
| 14 | Ajustes de posição | Sim | Sim | Código | APROVADO | `positions.ts` (ajuste com aviso de revisão) |
| 15 | Alterações e exclusões com estorno (livro só de inclusão) | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | `persistencia.test.ts` (A-04, relançar estornado) |
| 16 | Preço médio (IN RFB 1.585/2015) | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 5.1` (fórmula independente) |
| 17 | Patrimônio | Sim | Sim | Sim | APROVADO | `integracao.test.ts` (Painel = Rendimento = Alocação) |
| 18 | Resultado acumulado | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | `historico.test.ts › A-01` |
| 19 | Rentabilidade TWR e TIR, CDI no período | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 5.5` |
| 20 | DY atual, projetado, sobre custo (YoC), realizado | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 5.2` |
| 21 | DY médio real (capital × tempo) | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | `integracao.test.ts › A-03` |
| 22 | Preço-teto Bazin com DY configurável | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 5.4` (6% → 20; 8% → 15) |
| 23 | Margem de segurança e preço de oportunidade | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 5.4` |
| 24 | Régua: Aguardar / Manutenção / Oportunidade, configurável | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 7` |
| 25 | Régua não baseada só no preço (filtro de qualidade) | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 7` (dívida rebaixa); `aceitacao.test.ts` caso 12 |
| 26 | Ranking com pesos editáveis | Sim | Sim | Sim | APROVADO | `engine.test.ts` |
| 27 | Central de aportes: sugestão | Sim | Sim | Sim | APROVADO | `financeiro.test.ts › 6`; `aceitacao.test.ts` caso 9 |
| 28 | Central de aportes: minha escolha manual | Sim | Sim | E2E | APROVADO | E2E (escolha, avisos, registro) |
| 29 | Central de aportes: projeção de renda do aporte | Sim | Sim | Sim | APROVADO | `yoc.test.ts › simulação` |
| 30 | Central de aportes: proteção patrimonial (queda × proventos) | Sim | Sim | Sim | APROVADO | `yoc.test.ts › compensação` |
| 31 | Rendimento por carteira, classe, setor, segmento, ativo | Sim | Sim | Sim | APROVADO | `breakdown.test.ts`, `integracao.test.ts` |
| 32 | Teto de participação por ativo | Sim | Sim | Sim | APROVADO | `teto.test.ts` |
| 33 | Alocação com banda, exposição econômica, reserva fora | Sim | Sim | Sim | APROVADO | `aceitacao.test.ts`; `integracao.test.ts` |
| 34 | Concentração e sobreposições | Sim | Sim | Sim | APROVADO | `engine.test.ts` |
| 35 | Watchlist só entra no aporte em Oportunidade | Sim | Sim | Sim | APROVADO | `watchlist.test.ts` |
| 36 | Projeção de renda passiva (cenários) | Sim | Sim | Parcial | APROVADO | `engine.test.ts` (projeção); premissas na tela |
| 37 | Yield on Cost (painel, histórico por período) | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | `yoc.test.ts`; PERF-01 |
| 38 | Número mágico de FII | Sim | Sim | Sim | APROVADO | `yoc.test.ts › número mágico` |
| 39 | Proventos automáticos pela data-com | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | `aceitacao.test.ts`, `proventosHist.test.ts`, `persistencia.test.ts` |
| 40 | Conciliação com extrato | Sim | Sim | Sim | APROVADO | `aceitacao.test.ts` (conciliação) |
| 41 | Regras tributárias (JCP 17,5%, R$ 50 mil/mês, FII, ganho de capital) | Sim | Sim | Sim | APROVADO | `aceitacao.test.ts` |
| 42 | Análise 360° (fundamentos com fonte) | Sim | Sim | Parcial | PARCIAL | dados reais da CVM para 17 empresas; bancos/seguradoras e FIIs em parte manuais; anual sem LTM (DATA-01) |
| 43 | Indicadores da CVM (payout, dívida, caixa) em todas as telas | Sim | Sim | Sim | APROVADO | `cvmFundamentals.test.ts` |
| 44 | Oportunidade de Venda + Metodologia | Sim | Sim | Sim | APROVADO | `sell.test.ts`; E2E |
| 45 | Alerta diário por e-mail de VENDER | Sim | — | Não | NÃO VALIDADO | tarefa diária atualizada; falta o link do gist (REQ-03) |
| 46 | Importação XLSX/CSV com 8 categorias | Sim | Sim | Sim | APROVADO | `importacao.test.ts (1)(3)` |
| 47 | Pré-visualização, mapeamento, validação, relatório de erros | Sim | Sim | Sim | APROVADO | `importacao.test.ts (5)(6)(10)`; E2E do assistente |
| 48 | Duplicidade na importação | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | `importacao.test.ts (8)`, `A-02` |
| 49 | Reprocessamento após correção | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | `importacao.test.ts (11)`, `A-02` |
| 50 | Datas em formatos diferentes (inclusive série do Excel) | Sim | Sim | Sim | APROVADO | `importacao.test.ts (4)` |
| 51 | Fora de ordem cronológica | Sim | Sim | Sim | APROVADO | `importacao.test.ts (9)` |
| 52 | Grande volume (10 mil operações) | Sim | Sim | Sim | APROVADO | `importacao.test.ts (2)`: 0,19 s + 0,05 s |
| 53 | Exportação ida e volta | Sim | Sim | Sim | APROVADO | `importacao.test.ts (12)` |
| 54 | Importação tudo-ou-nada | Sim | — | Código | NÃO VALIDADO | `opsio.ts` restaura o estado em erro; falha não simulada |
| 55 | Coluna "Opções" no modelo | Não | — | — | NÃO IMPLEMENTADO | aguardando exemplo (REQ-01) |
| 56 | Nota de corretagem da Rico | Não | — | — | NÃO IMPLEMENTADO | aguardando exemplo (REQ-02) |
| 57 | Extrato da B3 (movimentação e negociação) | Sim | Sim | Sim | APROVADO | `io.test.ts` |
| 58 | Persistência local (IndexedDB) e recarga | Sim | Sim | E2E | APROVADO | E2E de migração e recarga |
| 59 | Migração reversível com cópia de segurança | Sim | Sim | E2E | APROVADO | E2E (`radar-backup-pre-v3`) |
| 60 | Backup/restauração completos | Sim | Sim | Sim | APROVADO | `persistencia.test.ts › backup` |
| 61 | Nuvem criptografada entre aparelhos | Sim | Sim | Parcial | PARCIAL | `cloudsync.test.ts` (criptografia); S-01 pendente; conflito entre 2 aparelhos não testado |
| 62 | Publicação contínua (GitHub Pages) | Sim | Sim | Sim | APROVADO | site 200; workflow verde |
| 63 | Dados automáticos sem token (B3, CVM, BCB, Tesouro) | Sim | Sim | Sim | APROVADO APÓS CORREÇÃO | robô: 0 erros; D-01, D-02 |
| 64 | Selo de fonte e data; dado defasado sinalizado | Sim | Sim | E2E | APROVADO | `ui.tsx` (Seal, DataTag "defasado" > 7 dias) |
| 65 | Precisão decimal (decimal.js) | Sim | Sim | Sim | APROVADO | `financeiro.test.ts` (tolerância 1e-9) |
| 66 | Tema claro/escuro e celular | Sim | Sim | E2E | APROVADO | varredura: 21 rotas, sem transbordo |
| 67 | Auditoria de alterações (quem, quando, motivo) | Sim | Sim | Sim | APROVADO | `persistencia.test.ts` |
| 68 | Exportação CSV/JSON | Sim | Sim | Sim | APROVADO | `importacao.test.ts (12)`, backup JSON |

**Totais (68 requisitos):** APROVADO 54 · APROVADO APÓS CORREÇÃO 8 · PARCIAL 2 · NÃO IMPLEMENTADO 2 · NÃO VALIDADO 2.
