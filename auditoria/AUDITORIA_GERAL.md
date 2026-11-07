# Auditoria geral — Radar de Investimentos

Data: 07/11/2026 · Versão auditada: commit `13a5335` · Correções no commit seguinte, mesmo branch.
Método: leitura do código, 43 testes novos com valores calculados à mão (`auditoria/testes/`), varredura no navegador (21 telas, vazio/carteira/celular), execução do robô de dados, `npm audit`, medição de desempenho com 10 mil operações. Nenhum dado real foi usado ou alterado.

## A. Resumo executivo

| Item | Quantidade |
|---|---|
| Requisitos identificados | **68** |
| Aprovados (validados com evidência) | 54 |
| Aprovados após correção nesta auditoria | 8 |
| Parciais | 2 (Análise 360° com partes manuais; nuvem: conflito entre 2 aparelhos não testado) |
| Não implementados | 2 (coluna "Opções", nota da Rico — aguardam exemplos seus) |
| Não validados | 2 (alerta por e-mail — falta o link; falha da importação atômica — não simulada) |
| Problemas encontrados | **22** (1 P0, 3 P1, 9 P2, 9 P3) |
| Corrigidos | **9** (o P0, os 3 P1 e 5 P2) |
| Pendentes | **13** (nenhum P0/P1; 4 P2: 3 dependem de material seu e 1 de melhoria de coleta; 9 P3) |

**Os problemas mais graves (todos corrigidos):**
1. **A-04 (P0):** quando um provento automático era recalculado (por exemplo, depois de corrigir uma compra), o antigo era estornado e o novo **não era criado**. Renda, DY e YoC caíam em silêncio.
2. **A-01 (P1):** o "Resultado acumulado" do Painel ignorava o caixa. No teste, mostrou −R$ 200,00 quando o correto era +R$ 699,98. Sem aportes lançados, mostrava o patrimônio inteiro como resultado.
3. **A-02 (P1):** reverter uma importação e reenviar o arquivo corrigido descartava as linhas como "duplicadas".

**Correção posterior (autorizada):** S-01 — token e senha da nuvem deixaram de ficar em texto claro no navegador.

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
| Nuvem | Sincronização segura | Criptografia; credenciais cifradas no aparelho (S-01 corrigido) | Conflito entre 2 aparelhos não testado | cloudsync, seguranca |

## D. Cálculos financeiros
Ver `AUDITORIA_FINANCEIRA.md`. Fórmulas conferidas com cálculo independente: preço médio, vendas, eventos, TWR, TIR, CDI, seis indicadores de DY, preço-teto, margem, régua, Central de aportes, IR. **Divergências:** A-01 e A-04, ambas corrigidas.

## E. Segurança
Ver `AUDITORIA_SEGURANCA.md`. S-01 corrigido. Dependências do site publicado atualizadas (react-router-dom 6.30.6); o que resta exige versões *major*, sobretudo em ferramentas de desenvolvimento.

## F. Desempenho
Ver `AUDITORIA_TECNICA.md`. Com 10 mil operações tudo fica abaixo de 130 ms, depois de corrigir o histórico do YoC (1,5 s → 43 ms). Todas as telas carregam em menos de 1 s.

## G. Correções
Ver `CORRECOES_EXECUTADAS.md` (9 correções, cada uma com teste de regressão).

## H. Pendências que impedem a aprovação integral
1. **REQ-03** — alerta de venda por e-mail ainda não ligado (falta o link do gist).
2. **REQ-01 / REQ-02** — coluna "Opções" e nota da Rico (faltam exemplos).
3. **DATA-01** — fundamentos anuais, sem os últimos 12 meses.
4. Itens P3 de segurança e qualidade (CSP, repositório público, lint, dependências *major*).

## I. Parecer final

**APROVADA COM RESSALVAS** (atualizado depois da correção do S-01; antes: aprovação condicional).

- **Problemas críticos e altos:** não há mais nenhum aberto. Os quatro encontrados (A-04, A-01, A-02 e S-01) foram corrigidos, cada um com teste de regressão.
- **Cálculos financeiros centrais:** conferem com o cálculo independente.
- **Consistência:** os módulos dão números iguais entre si.
- **O que falta:**
  - itens que dependem de material seu: o link do alerta (REQ-03), a coluna "Opções" (REQ-01) e a nota da Rico (REQ-02);
  - uma melhoria de coleta: fundamentos dos últimos 12 meses (DATA-01);
  - itens de baixa prioridade.
- **O que permitiria a aprovação integral:** fechar o REQ-03, que liga o alerta por e-mail, e entregar REQ-01 e REQ-02 assim que os exemplos chegarem.
