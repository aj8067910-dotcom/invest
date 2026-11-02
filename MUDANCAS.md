# MUDANÇAS — Etapas 1 a 10

Relatório das alterações feitas depois da auditoria (`AUDITORIA.md`). Cada item traz **módulo**, **antes**, **depois** e **fundamento**.
Nenhuma tela, menu ou módulo novo foi criado: tudo entrou nas telas que já existiam (Painel, Carteira, Ficha do ativo, Preço-teto, Ranking, Central de aportes, Dividendos, Alocação, Projeção, Central de Operações, Parâmetros, Dados & integrações).

> A plataforma classifica e explica. **Nenhuma classificação é ordem de compra**; a decisão é do investidor.

## Respostas adotadas para as perguntas da auditoria

| # | Decisão adotada | Observação |
|---|---|---|
| P1 | Mantido o nome "Radar de Investimentos" | Renomear é só texto; troco se você pedir |
| P2 | Importação **tudo ou nada** (uma gravação atômica), com registro do lote e reversão por estorno em lote | Falha no meio → nada é gravado |
| P3 | Campo "Opções" **pendente** | Preciso de um exemplo da sua planilha; os eventos já são reconhecidos pela coluna Tipo |
| P4 | Régua de 3 faixas por margem: Aguardar (< 0%), Manutenção (0–15%), Oportunidade (≥ 15%) | Margem exigida editável em Parâmetros |
| P5 | DY-alvo padrão 8% (ações e FIIs); DY de Bazin 6% exibido ao lado | Migração troca 6% → 8% só se você não tinha alterado |
| P6 | Proventos com data-com: **B3** (fonte primária) + Yahoo como reserva, marcado "estimada" | Antes de 01/11/2019 todo provento é "estimado" |
| P7 | `decimal.js` em todo cálculo de dinheiro e quantidade | Arredonda só na exibição e no dinheiro de fato retido (centavos) |
| P8 | "Editar" = **Corrigir** (estorno + novo lançamento); "Excluir" = **Estornar**; motivo obrigatório; "quem" = nome do aparelho | Não há login de usuário |
| P9 | Campo **peso-alvo** no cadastro do ativo; vazio = limite máximo por ativo | |
| P10 | Ativos marcados **"é reserva"** ficam fora da alocação e do patrimônio investido | |
| P11 | Day trade = compra e venda do mesmo ativo no mesmo pregão, em qualquer corretora | |
| P12 | Nota de corretagem da Rico **pendente** | Preciso de um exemplo (PDF com valores apagados) |
| P13 | Fonte Inter + tema claro, escuro ou do sistema | Parâmetros → Aparência |
| P14 | Indicadores sem fonte estruturada entram como campos manuais na Análise 360°, com fonte e data obrigatórias | |

## Etapa 1 — Fonte única da verdade e precisão

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Motor de posições (`domain/calc/positions.ts`) | Aritmética em ponto flutuante | Tudo em `decimal.js` (40 dígitos); posição, PM, resultado e renda saem só do livro | Precisão exigida pela especificação; PM pela regra da Receita (IN RFB 1.585/2015, art. 58) |
| Livro de lançamentos (`store/store.ts`, `domain/ledger.ts`) | Editar e excluir alteravam o histórico | Livro só de inclusão: correção = estorno + novo; exclusão = estorno; motivo e aparelho registrados na auditoria | Restrição "não alterar lançamentos históricos sem estorno registrado" |
| Chave de duplicidade | Data, ticker, tipo, quantidade, valor | Proventos: ativo + tipo + data-com + pagamento. Negócios: data + ticker + tipo + qtd + preço + corretora. ID externo tem prioridade | Etapa 2 |
| Custos | Um campo "taxas" | Corretagem, emolumentos e taxa de liquidação separados; somam no custo de aquisição | IN RFB 1.585/2015, art. 58 |
| Migração (versão 3) | — | Antes de migrar, cópia integral dos dados (`radar-backup-pre-v3`); botão "Restaurar dados anteriores à atualização" em Dados & integrações | Migração reversível |

## Etapa 2 — Importação

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Assistente de importação | Gravação em lotes de 500 com retomada | Tudo ou nada; reversão do lote por estorno | P2 |
| Extrato B3 (`services/io.ts`) | Data da liquidação usada como data do negócio | Data do pregão recalculada (D+2 desde 29/05/2019, D+3 antes) pelo calendário B3; leilão de fração, bonificação, desdobro, grupamento e direitos reconhecidos | Calendário e prazos de liquidação da B3 |
| Validação | "32/13/2025" aceito; "3.000" lido como 3 | Datas validadas de verdade; separador de milhar brasileiro | |
| Conciliação | — | Proventos do extrato conferidos contra o calculado: "conferido" ou "pendente" com causa provável (arredondamento, outra corretora, aluguel, retificação) | Etapa 5.1 |

## Etapa 3 — Reconstrução com eventos e cestas

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Eventos | Desdobramento, grupamento, bonificação | + subscrição, direito de subscrição, troca de ticker, incorporação, cisão (custo transferido entre ativos), leilão de fração, amortização | Lei 6.404/1976; IN RFB 1.585/2015 |
| Cestas de apuração | Uma só | Ações, FII, ETF, cripto, renda fixa e **day trade** separados, com prejuízo a compensar por cesta | Lei 11.033/2004; Lei 8.981/1995; IN RFB 1.585/2015 |
| Ganho de capital (Operações → Aportes) | — | Apuração mensal com isenção de R$ 20 mil (ações), cripto R$ 35 mil, ETF sem isenção, FII 20%, day trade 20% | Lei 11.033/2004 art. 3º; Lei 13.259/2016; IN RFB 1.888/2019 |

## Etapa 4 — Painel

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Painel | Patrimônio e renda | Patrimônio, capital aportado (aportes externos − retiradas; reinvestimento não conta), resultado acumulado, **TWR** com cotização mensal, **TIR (XIRR)**, CDI do período, DY 12m, Yield on Cost, média mensal, crescimento só com 24 meses, renda estimada; cada card com selo de fonte e data | GIPS (TWR); CDI = SGS 4391 do BCB |

## Etapa 5 — Proventos automáticos pela data-com (5.1)

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Proventos (`domain/calc/proventos.ts`) | Lançados à mão | Lançados sozinhos: quantidade elegível = posição no **fechamento do pregão da data-com**; compra na data-ex não conta; venda na data-ex não tira o direito | Lei 6.404/1976, art. 205; manual da B3 |
| IR na fonte | — | JCP 17,5%; dividendos: 10% sobre o total do mês **por empresa** acima de R$ 50 mil, rateado; FII isento quando cumpre os requisitos | LC 224/2025; Lei 15.270/2025; Lei 14.754/2023 |
| Status | — | Provisionado (data-com passou, pagamento não) → recebido → conferido (bateu com o extrato) | |
| Retificação | — | Mudou valor, data ou posição: o lançamento antigo é estornado e um novo é criado, com motivo na auditoria. Rodar de novo não duplica | |
| Lançamento manual existente | — | Não duplica; diferença aparece em Dividendos → pendências | |
| Alerta | — | Data-com nos próximos 7 dias aparece no Painel | |

## Etapa 6 — Análise 360° (aba nova dentro da ficha existente)

Blocos: valuation, rentabilidade, qualidade do lucro, saúde financeira (Piotroski F-Score; Altman Z″ mercados emergentes), endividamento, perfil da dívida, crescimento, sustentabilidade do provento, armadilha de DY, governança, mercado e risco, ajustes setoriais (bancos, seguradoras, utilities, commodities, FIIs de papel e tijolo), tese e vigilância. Cada indicador mostra status (sem alerta / atenção / alerta / não se aplica / sem dado), limite usado e referência. Só os limites definidos na especificação geram atenção ou alerta; limites editáveis em Parâmetros.
Fundamento: Piotroski (2000), Altman (2005, Z″ EM), Graham, Bazin, normas CVM; citações no código (`REFS`) e na tela.

## Etapa 7 — Preço-teto (motor único)

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Preço-teto | Provento recorrente bruto ÷ DY-alvo | DPA de referência **líquido de IR** (12 meses, média de 3 ou 5 anos, ciclo completo) ÷ DY-alvo; padrão: ações 5 anos, FII 12 meses, commodities ciclo | Bazin, *Faça fortuna com ações*; ciclicidade de commodities |
| Margem | — | margem = (teto − preço) ÷ teto; preço de oportunidade = teto × (1 − margem exigida) | |
| Preço de interesse | — | Campo manual opcional, exige justificativa e data | |

## Etapa 8 — Classificação

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Ranking e Régua | 4 faixas por % do teto | Aguardar / Manutenção / Oportunidade pela margem; **filtro de qualidade** (sem alerta em endividamento, perfil da dívida e sustentabilidade; F-Score ≥ 5; Altman fora da zona de risco; tese válida) | Etapa 8 |
| Rebaixamentos | — | 1 alerta → Aguardar; 2 atenções → Manutenção; acima do peso-alvo ou sobreposição com o mesmo emissor → uma faixa abaixo; risco 5 → Aguardar | |
| ETF, Tesouro, cripto | Pontuação | Classificação pela banda de alocação (±5 p.p.) | |
| Central de aportes | Arredondamento para baixo | Quantidade arredondada para cima quando cabe no valor (ex.: 19 cotas) | |

## Etapa 9 — Alocação

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Alocação | Limite fixo | Banda ±5 p.p. editável; **exposição econômica** (ex.: BOVX11 conta como ações Brasil); reserva de emergência fora | Markowitz (1952); prática de rebalanceamento por bandas |

## Etapa 10 — Fontes, robô e interface

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Robô (`scripts/fetch-market.ts`) | Yahoo para tudo | Hierarquia **B3 → CVM → RI → BCB → Tesouro**; agregadores só como reserva. B3: proventos com data-com, eventos de ações, segmento, código CVM; COTAHIST (fechamento e volume); CVM DFP (6 anos) e Informe Mensal de FII; BCB SGS; Tesouro Transparente | Hierarquia de fontes da especificação |
| Calendário de proventos | — | Histórico preservado entre execuções (o robô mescla com a última publicação) | |
| Interface | Fonte do sistema, só tema escuro | Inter; tema claro, escuro ou automático; selos de fonte e "por quê?" nos números | P13 |
| Exportação | JSON | JSON e CSV, incluindo conciliações | |

## Teto de participação por ativo (pedido posterior)

| Módulo | Antes | Depois | Fundamento |
|---|---|---|---|
| Cadastro do ativo e Parâmetros → **Teto por ativo** | Só um limite geral por ativo (12%) | Cada ativo pode ter seu teto (ex.: BBSE3 8%). Vazio = limite geral. Tabela em Parâmetros com peso atual, teto, quanto ainda cabe (R$) e situação | Diversificação reduz o risco específico (Markowitz, 1952) |
| Ranking | — | No teto ou acima → **Aguardar**, com o motivo | Etapa 8 (peso acima do alvo rebaixa) |
| Central de aportes | Limite geral | Valor limitado ao que cabe até o teto; nesse caso a quantidade é arredondada para baixo para não passar do teto | |
| Carteira e Concentração | — | Peso mostra o teto ao lado; alerta usa o teto de cada ativo | |

Regras: com a carteira em formação (patrimônio menor que 10 aportes mensais) os tetos não bloqueiam compras, como já acontecia com o limite geral. ETFs e Tesouro sem teto próprio seguem só a alocação da classe.

## Testes de aceitação

`src/domain/aceitacao.test.ts` cobre os 18 casos da especificação e mais: idempotência dos proventos automáticos, retificação, limite de R$ 50 mil por empresa e livro só de inclusão. Total: 59 testes passando (`npm test`).

## Limitações conhecidas

- Proventos antigos vindos do Yahoo não dizem o tipo: entram como dividendo, marcados "estimada".
- Indicadores usam o balanço anual (DFP); os últimos 12 meses (LTM) ainda não são calculados.
- Bancos e seguradoras: Basileia, índice combinado e afins são manuais (a CVM não traz esses dados em formato estruturado).
- Feriados da B3 calculados por regra (nacionais + Páscoa); feriados extraordinários precisam de ajuste.
- Desfazer a migração restaura a cópia feita antes dela; o que foi lançado depois se perde nessa restauração.
- P3 (campo "Opções") e P12 (nota da Rico) aguardam exemplos.
