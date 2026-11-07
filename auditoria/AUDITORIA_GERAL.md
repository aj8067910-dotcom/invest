# Auditoria geral — Radar de Investimentos

Data: 07/11/2026 · Versão auditada: commit `13a5335` · Correções no commit seguinte, mesmo branch.
Método: leitura do código, 43 testes novos com valores calculados à mão (`auditoria/testes/`), varredura no navegador (21 telas, vazio/carteira/celular), execução do robô de dados, `npm audit`, medição de desempenho com 10 mil operações. Nenhum dado real foi usado ou alterado.

## A. Resumo executivo

| Item | Quantidade |
|---|---|
| Requisitos identificados | **68** |
| Aprovados (validados com evidência) | 54 |
| Aprovados após correção nesta auditoria | 8 |
| Parciais | 2 (Análise 360° com partes manuais; nuvem com S-01) |
| Não implementados | 2 (coluna "Opções", nota da Rico — aguardam exemplos seus) |
| Não validados | 2 (alerta por e-mail — falta o link; falha da importação atômica — não simulada) |
| Problemas encontrados | **22** (1 P0, 3 P1, 9 P2, 9 P3) |
| Corrigidos | **8** (o P0, 2 dos 3 P1 e 5 P2) |
| Pendentes | **14** (1 P1 que exige decisão; 4 P2: 3 dependem de material seu e 1 de melhoria de coleta; 9 P3) |

**Os problemas mais graves (todos corrigidos):**
1. **A-04 (P0):** quando um provento automático era recalculado (por exemplo, depois de corrigir uma compra), o antigo era estornado e o novo **não era criado**. Renda, DY e YoC caíam em silêncio.
2. **A-01 (P1):** o "Resultado acumulado" do Painel ignorava o caixa. No teste, mostrou −R$ 200,00 quando o correto era +R$ 699,98. Sem aportes lançados, mostrava o patrimônio inteiro como resultado.
3. **A-02 (P1):** reverter uma importação e reenviar o arquivo corrigido descartava as linhas como "duplicadas".

**O pendente mais importante:** S-01 — o token do GitHub e a senha da nuvem ficam em texto claro no navegador.

## B. Matriz de conformidade
Ver `MATRIZ_DE_REQUISITOS.md` (68 linhas, com evidência por requisito).

## C. Relatório por módulo

| Módulo | Solicitado | Funciona | Não funciona / a melhorar | Testes |
|---|---|---|---|---|
| Central de Operações (livro) | Histórico completo, estorno, eventos, transferências | PM, vendas, day trade, eventos, reinvestimento, transferência, correção | (corrigido A-02/A-04) | 9 + 6 auditoria |
| Importação | XLSX/CSV, 8 abas, validação, duplicidade, reprocesso | Tudo, inclusive datas do Excel e 10 mil linhas | Coluna "Opções" e nota da Rico (aguardam exemplo); falha atômica não simulada | 10 auditoria + 13 |
| Painel | Patrimônio, aportes, resultado, rentabilidade, DY | Patrimônio, TWR, TIR, CDI, DY | (corrigido A-01) | integração |
| Dividendos e YoC | Recebido × projetado, YoC, DY médio real | Tudo | (implementado A-03; PERF-01) | 8 + 4 |
| Preço-teto e régua | Bazin com DY configurável, 3 faixas, qualidade | Tudo, não depende só de preço | — | 13 financeiro + aceitação |
| Central de aportes | Sugestão, escolha manual, projeção, proteção, rendimento por nível | Tudo; reage a preço, valor, DY e alocação | — | financeiro › 6, yoc, breakdown |
| Análise 360° / fundamentos | Indicadores com fonte | CVM real para 17 empresas, Piotroski, Altman | Bancos/FIIs parte manual; sem LTM (DATA-01) | cvmFundamentals |
| Oportunidade de Venda | Critérios, status, alerta | Tudo no painel | Alerta por e-mail depende do link (REQ-03) | sell |
| Dados de mercado | B3, CVM, BCB, Tesouro sem token | 0 erros | (corrigidos D-01, D-02) | robô executado |
| Nuvem | Sincronização segura | Criptografia correta | S-01 pendente | cloudsync |

## D. Cálculos financeiros
Ver `AUDITORIA_FINANCEIRA.md`. Fórmulas conferidas com cálculo independente: preço médio, vendas, eventos, TWR, TIR, CDI, seis indicadores de DY, preço-teto, margem, régua, Central de aportes, IR. **Divergências:** A-01 e A-04, ambas corrigidas.

## E. Segurança
Ver `AUDITORIA_SEGURANCA.md`. Pendente principal: S-01. Dependências do site publicado atualizadas (react-router-dom 6.30.6); o que resta exige versões *major*, sobretudo em ferramentas de desenvolvimento.

## F. Desempenho
Ver `AUDITORIA_TECNICA.md`. Com 10 mil operações tudo fica abaixo de 130 ms, depois de corrigir o histórico do YoC (1,5 s → 43 ms). Todas as telas carregam em menos de 1 s.

## G. Correções
Ver `CORRECOES_EXECUTADAS.md` (8 correções, cada uma com teste de regressão).

## H. Pendências que impedem a aprovação integral
1. **S-01** — credenciais da nuvem em texto claro (P1, decisão sua).
2. **REQ-03** — alerta de venda por e-mail ainda não ligado (falta o link do gist).
3. **REQ-01 / REQ-02** — coluna "Opções" e nota da Rico (faltam exemplos).
4. **DATA-01** — fundamentos anuais, sem os últimos 12 meses.
5. Itens P3 de segurança e qualidade (CSP, repositório público, lint, dependências *major*).

## I. Parecer final

**APROVAÇÃO CONDICIONAL.**

Os cálculos financeiros centrais estão corretos e conferem com o cálculo independente: preço médio, posição, eventos, rentabilidade, DY, Bazin e régua. Os módulos dão números consistentes entre si, e o código publicado não tem erros.

A auditoria encontrou um problema crítico e dois altos que distorciam números usados em decisões. Os três foram corrigidos e cobertos por testes. Continua pendente uma falha alta de segurança (S-01), cuja correção muda o uso da nuvem e por isso depende da sua decisão. Também há funcionalidades pedidas que aguardam material seu.

Resolvidos S-01 e REQ-03, a plataforma passa a **APROVADA COM RESSALVAS** (restariam apenas itens P2/P3 de melhoria).
