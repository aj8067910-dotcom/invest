# AUDITORIA — Etapa 0

**Data:** 01/11/2026  
**Escopo:** código em `main` do branch `claude/festive-cannon-p7n4ye` (commit `583f6e3`), banco local (IndexedDB, versão 2 do esquema), robô de dados (`scripts/fetch-market.mjs`) e todas as telas.  
**Método:** leitura do código, execução dos 35 testes existentes e execução dos casos de aceitação 1, 2, 3, 4, 5, 9 e 12 contra o motor atual (os demais exigem funcionalidades ausentes). **Nenhum código foi alterado nesta etapa.**

Legenda: ✅ implementado e correto · ⚠️ implementado com erro ou divergente da nova especificação · 🟡 parcial · ❌ ausente

---

## 1. Resumo executivo

1. **O núcleo de cálculo de posição está correto.** Os casos 1 a 4 (preço médio com custos, venda, desdobramento, bonificação com custo atribuído) já passam no motor atual.
2. **A régua de compra e o preço-teto seguem outra especificação.** Hoje a régua usa faixas de preço ÷ teto (85% / 75% / 65%) com quatro faixas; a nova pede margem (0% / 15%) com três faixas e filtro de qualidade. O DPA de referência hoje é **bruto** e só dos últimos 12 meses.
3. **Não há tributação.** JCP, dividendos acima de R$ 50 mil/mês, FII e ganho de capital não são calculados; um texto e uma conferência ainda usam **IRRF de 15% no JCP** (desatualizado segundo sua especificação: 17,5%).
4. **Não existe lançamento automático de proventos pela data-com** (Etapa 5.1), nem TWR/XIRR, nem Piotroski/Altman/accruals.
5. **Erro de dados encontrado:** o robô grava a **data-ex** do Yahoo no campo exibido como **"data-com"**. Diferença de um pregão, irrelevante para o preço-teto atual, mas **errada para elegibilidade** (Etapa 5.1).
6. **Erro de dados encontrado:** na importação do extrato de **Movimentação** da B3, compras e vendas entram pela **data de liquidação** (D+2), não pela data do pregão.
7. **Arquitetura:** valores em ponto flutuante (`0,1 + 0,2 = 0,30000000000000004`), livro **editável** (com auditoria, mas sem estorno), dados de mercado **misturados** ao cadastro do ativo.
8. **Fonte:** cotações e proventos vêm do **Yahoo Finance** (agregador) como fonte principal, invertendo a hierarquia pedida (B3 primeiro).

---

## 2. Mapa dos módulos da especificação para as telas existentes

A especificação cita 12 módulos com nomes diferentes dos atuais. Pela regra "sem telas ou menus novos", proponho **manter as telas existentes** e corrigir o conteúdo:

| Módulo da especificação | Tela existente | Observação |
|---|---|---|
| Dashboard | **Painel** (`/`) | — |
| Central de operações | **Central de Operações** (`/operacoes`) | — |
| Minha carteira | **Carteira & Watchlist** (`/carteira`), filtro "Carteira" | mesma tela da Watchlist |
| Análise de ativos | **Ficha do ativo** (`/ativo/:id`), aberta pelo ticker | não tem item próprio no menu |
| Calculadora de preço-teto | **Preço-teto & Régua** (`/preco-teto`), bloco "Calculadora rápida" | mesma tela do Método Bazin |
| Método Bazin | **Preço-teto & Régua** + aba "Preço-teto & régua" da ficha | já usa um único motor (`computeBazin`) |
| Oportunidades de compra | **Ranking de aportes** (`/ranking`) + **Central de aportes** (`/aportes`) | — |
| Aportes | **Central de aportes** (planejamento) + aba **Aportes** da Central de Operações (histórico) | — |
| Dividendos e renda passiva | **Dividendos** (`/dividendos`) + **Projeção** (`/projecao`) | — |
| Alocação patrimonial | **Alocação** (`/alocacao`) + **Concentração** (`/concentracao`) | — |
| Watchlist | **Carteira & Watchlist**, filtro "Watchlist" | — |
| Configurações | **Parâmetros** (`/config`) + **Dados & integrações** (`/dados`) | — |

> **Pergunta P1:** o nome da plataforma hoje é "Radar de Investimentos"; a especificação diz "Central de Investimentos". Renomeio (só texto)?

---

## 3. Classificação por módulo

### 3.1 Painel (Dashboard)

| Item | Status | Evidência |
|---|---|---|
| Patrimônio a mercado | ✅ | `portfolioTotals.marketValue`; ativos sem cotação entram a custo e são sinalizados |
| Capital aportado = aportes − retiradas (sem reinvestimento) | 🟡 | `totals.deposits` exclui reinvestimento ✅, mas o Painel não mostra o líquido de retiradas |
| Resultado acumulado = patrimônio + retiradas − aportes | ⚠️ | Painel mostra "Retorno total" = valorização + realizado + proventos (outra definição) |
| Rentabilidade TWR e TIR/XIRR com CDI do período | ❌ | inexistente |
| DY da carteira = proventos líquidos 12m ÷ patrimônio | ⚠️ | hoje "Renda mensal estimada" usa provento por unidade × quantidade (estimativa futura), não recebido |
| Yield on Cost ao lado do DY | ❌ no Painel | existe só no histórico por ativo (Central de Operações) |
| Média mensal de proventos = 12m ÷ 12 | ⚠️ | `dividends.ts:218` divide por `min(12, meses com histórico)` |
| Crescimento da renda = 12m ÷ 12m anteriores − 1 | ⚠️ | `dividends.ts:230` cai para "3 últimos vs 3 primeiros meses" quando falta histórico |
| Selo "Fonte · atualizado em" em todo card | 🟡 | `DataTag` em parte dos cards; sem horário em vários |
| Proibido valor fictício | ✅ | cadastro inicial só com metadados; nenhum dado de exemplo |
| Evolução patrimonial | 🟡 | custo reconstruído + valor de mercado diário desde o primeiro uso; sem série de mercado histórica |

### 3.2 Central de Operações

| Item | Status | Evidência |
|---|---|---|
| Livro único alimentando todos os módulos | ✅ | `computePositions` deriva tudo do livro |
| Posição, PM, custo e resultado derivados e não editáveis | ✅ | não há campo editável de posição |
| Livro só de inclusão (estorno + novo, com motivo) | ⚠️ | `updateTransaction`/`removeTransaction` alteram o registro; a auditoria guarda o "antes", mas não há estorno nem campo "motivo" |
| Decimal em vez de ponto flutuante | ❌ | todo o código usa `number` (float) |
| Reprocessamento idempotente | ✅ | cálculo é função pura do livro |
| Corretagem, emolumentos e taxa de liquidação separados | 🟡 | um campo único "Taxas e emolumentos" |
| Data do pregão | 🟡 | modelo usa "Data do lançamento"; ⚠️ extrato de Movimentação da B3 usa a data de **liquidação** (`io.ts:207`) |
| Campo fonte (B3, nota, manual) | 🟡 | só `importId` e texto em observação |
| Total e Quantidade total como conferência | ✅ | recalculados; divergências viram aviso |
| Layout B3 (Movimentação e Negociação) | ✅ / ⚠️ | reconhecidos; ver data de liquidação acima |
| Layout de nota de corretagem da Rico | ❌ | precisa de um arquivo-exemplo (PDF ou exportação) |
| Posição inicial obrigatória antes de 01/11/2019 | 🟡 | tipo "Saldo inicial" existe; não é exigido nem marcado como "estimado" |
| Duplicidade por data, ticker, tipo, qtd, preço, corretora + hash do arquivo | 🟡 | impressão digital usa esses campos + valor; o hash do arquivo é registrado, mas só serve para retomada |
| Mostrar duplicatas antes de confirmar | ✅ | etapa 3 do assistente |
| Importação tudo ou nada | ⚠️ | grava em lotes de 500 com retomada (atendia o pedido anterior); ver **P2** |
| Relatório por linha e correção antes de gravar | ✅ | — |
| Campo "Opções" como evento estruturado | ❓ | não existe campo "Opções" na plataforma; ver **P3** |

### 3.3 Reconstrução da carteira (motor `positions.ts`)

| Item | Status | Evidência |
|---|---|---|
| PM ponderado com custos (Receita) | ✅ | caso 1: PM R$ 11,01 |
| Venda não altera PM; realizado com custos | ✅ | caso 2: R$ 238,80; 90 a R$ 11,01 |
| Desdobramento/grupamento | ✅ | caso 3: 180 a R$ 5,505, custo R$ 990,90 |
| Bonificação com custo atribuído | ✅ | caso 4: 198, custo R$ 1.062,90, PM R$ 5,37 |
| Subscrição por preço de emissão | 🟡 | soma quantidade e custo; sem cadeia direito → recibo → cota (MXRF12 → MXRF13 → MXRF11) |
| Amortização de FII reduz custo | ✅ | — |
| Troca de ticker, incorporação, cisão | ❌ | sem tipo de evento; TRPL4→ISAE4 e ELET3→AXIA3 hoje exigiriam ajustes manuais |
| Frações em leilão geram realizado | 🟡 | grupamento com fração vai para revisão; leilão precisa ser lançado como venda comum |
| Cestas de compensação (swing, day trade, FII, ETF) | ❌ | resultado realizado é um total por ativo |
| Separação aporte / compra / venda / provento / reinvestimento / transferência | ✅ | tipos distintos; reinvestimento não conta como aporte; transferência sem efeito |

### 3.4 Carteira & Watchlist

| Item | Status | Evidência |
|---|---|---|
| Cadastro, transferência carteira ⇄ watchlist | ✅ | — |
| Watchlist usa o mesmo motor da carteira | ✅ | mesmo `scoreAsset` / `computeBazin` |
| Preço de interesse (calculado ou manual com justificativa e data) | ❌ | — |
| Aviso quando alerta muda de cor | ❌ | alertas não guardam estado anterior |
| Classe (veículo) × exposição econômica | ❌ | BOVX11 conta como ETF; não como "ações Brasil" |

### 3.5 Ficha do ativo (Análise de ativos)

| Bloco da Etapa 6 | Status | O que existe hoje |
|---|---|---|
| 6.1.1 Valuation | 🟡 | cotação, PM, P/L, P/VP, EV/EBITDA (manuais), DY 12m, teto, Gordon genérico, FCD, múltiplos, Graham; sem Asness-Frazzini-Pedersen, sem "preço de oportunidade" pela margem |
| 6.1.2 Rentabilidade | 🟡 | ROE, ROIC, margem líquida e EBITDA (manuais, um valor só); sem margem bruta/EBIT, lucro bruto ÷ ativos, série de 5 anos |
| 6.1.3 Qualidade do lucro (FCO ÷ lucro, accruals) | ❌ | — |
| 6.1.4 Piotroski F-Score e Altman Z″ | ❌ | — |
| 6.1.5 Endividamento | 🟡 | só Dív. Líq./EBITDA (alerta em 3,5x); sem Dív. Bruta/PL, cobertura de juros, liquidez corrente |
| 6.1.6 Perfil da dívida | ❌ | — |
| 6.1.7 Crescimento e investimento | 🟡 | CAGR de receita e lucro (manual), CAGR de proventos (calculado); sem capex ÷ depreciação, crescimento do ativo |
| 6.1.8 Sustentabilidade do provento | 🟡 | payout, anos seguidos pagando, % extraordinário, FCF yield vs DY; sem cobertura FCL, volatilidade do DPA, proporção JCP/dividendo |
| 6.1.9 Armadilha de DY | 🟡 | só "DY > 2× o alvo"; sem DY atual ÷ DY médio 5a com variação de preço |
| 6.1.10 Governança | 🟡 | nota manual 1–5; sem segmento de listagem, tag along, free float, controlador |
| 6.1.11 Mercado e risco | ❌ | preços diários são baixados pelo robô e descartados |
| 6.1.12 Tese e vigilância | 🟡 | tese em texto + status; sem catalisadores, gatilhos com data; tese não é exigida para "Oportunidade" |
| Ícone "por que isso importa" com referência | ❌ | — |
| Verde / amarelo / vermelho por indicador | 🟡 | só nos alertas de tese |
| 6.2 Bancos | 🟡 | ROIC, margem EBITDA, Dív./EBITDA e FCF desligados para financeiras; sem Basileia, eficiência, inadimplência 90d, cobertura |
| 6.2 Seguradoras, elétricas/saneamento, commodities, holdings | ❌ / 🟡 | holdings: só sobreposição ITSA4 × ITUB4 |
| 6.3 FIIs | 🟡 | P/VP, DY, vacância física/financeira, inadimplência, concentração, WALT, gestão, alavancagem (manuais); sem spread sobre NTN-B, resultado caixa/reserva, papel (LTV, high grade/yield), cotistas, emissões abaixo do VP |

### 3.6 Preço-teto & Régua (Calculadora + Método Bazin)

| Item | Status | Evidência |
|---|---|---|
| Um único motor para as duas telas | ✅ | `computeBazin` em todas as telas |
| Teto = DPA de referência **líquido** ÷ DY | ⚠️ | DPA **bruto** (JCP sem IR) |
| DPA selecionável 12m / 3a / 5a / ciclo | ❌ | só 12 meses recorrentes ou estimativa manual |
| Oportunidade = Teto × (1 − margem), margem aplicada uma vez | ⚠️ | "Preço ideal" = teto × 75% (faixa da régua) |
| Proventos extraordinários marcáveis | ✅ | marcação manual + sugestão automática |
| DY de Bazin (6%) ao lado do DY-alvo (8%) | 🟡 | cenários 6/8/9/10% na tabela; sem destaque lado a lado |
| Selic e NTN-B como custo de oportunidade | ❌ na tela | Selic coletada; NTN-B não |
| Projeção de renda = qtd × DPA líquido | ⚠️ | usa DPA bruto |
| Caso 5 | ⚠️ | teto R$ 25,00 ✅; R$ 22,00 dá "Aguardar" (esperado "Manutenção 12%"); R$ 20,50 dá "Manutenção" (esperado "Oportunidade 18%"); preço ideal R$ 18,75 (esperado R$ 21,25) |

### 3.7 Ranking de aportes (Oportunidades de compra)

| Item | Status | Evidência |
|---|---|---|
| Régua por margem (Aguardar < 0; Manutenção 0–15%; Oportunidade ≥ 15% + qualidade) | ⚠️ | régua por preço ÷ teto em 4 faixas |
| Um vermelho → Aguardar; dois amarelos → Manutenção | ⚠️ | alerta grave → "Revisar tese"; qualquer amarelo → teto em "Monitoramento" |
| Acima do peso-alvo cai uma faixa | ⚠️ | penaliza a nota; não há peso-alvo por ativo (só máximo por ativo) |
| Sobreposição econômica (ITSA4, BOVX11) | 🟡 | apontada em Concentração; não entra na classificação |
| Motivo por escrito | ✅ | lista de justificativas por ativo |
| Caso 12 (Dív./EBITDA 3,8x) | ⚠️ | classificado "Revisar tese" com motivo genérico, não "Aguardar — endividamento acima de 3,5x" |

### 3.8 Central de aportes

| Item | Status | Evidência |
|---|---|---|
| Distribuição, aguardar quando não há oportunidade | ✅ | — |
| Quantidade arredondada **para cima** | ⚠️ | `allocator.ts:47` arredonda para baixo; caso 9 dá 18 cotas (R$ 382,50), esperado 19 (R$ 403,75) |
| Cruzar maior déficit de classe com a régua | 🟡 | ajusta nota por desvio da classe; banda fixa de ±2 p.p. |

### 3.9 Dividendos e renda passiva (+ Projeção)

| Item | Status | Evidência |
|---|---|---|
| Recebido × estimado separados | ✅ | — |
| Provento com tipo, data-com, pagamento, valor/cota, bruto, IR, líquido | 🟡 | tipo, data-com, pagamento, valor/cota e líquido existem na Central; **sem bruto e IR** |
| Renda recebida pela data de pagamento | ✅ | — |
| Provisionada pela data-com | ❌ | — |
| Lançamento automático pela data-com (5.1, casos 14–18) | ❌ | — |
| Ranking de contribuição com valores líquidos | ✅ | — |
| Capital necessário para renda-alvo (caso 8) | 🟡 | Projeção mostra quando a meta é atingida; não mostra "capital necessário = renda × 12 ÷ DY" |
| Alerta de data-com nos próximos 7 dias | ❌ | — |
| Média mensal de aportes sobre todos os meses + meses sem aporte | ❌ | — |
| Evolução acumulada corrigida pelo IPCA | ❌ | IPCA 12m é coletado; série histórica não |

### 3.10 Alocação + Concentração

| Item | Status | Evidência |
|---|---|---|
| Metas padrão 30/30/25/10/5 | ✅ | — |
| Banda configurável (padrão ±5 p.p.) | ⚠️ | fixa em ±2 p.p. (`allocation.ts:23`, `Allocation.tsx:80`) |
| Exposição econômica (BOVX11 = ações Brasil; ACWI11/IVVB11 = internacional) | 🟡 | Concentração tem "internacional" e "moeda"; alocação usa só o veículo |
| Nunca sugerir venda | ✅ | — |
| Reserva de emergência fora da alocação | ❌ | não existe o conceito (a "reserva" da Central de aportes é por aporte) |

### 3.11 Parâmetros (Configurações) + Dados & integrações

| Item | Status | Evidência |
|---|---|---|
| Parâmetros de decisão editáveis | 🟡 | régua, DY-alvo, pesos, limites, gatilhos editáveis; muitos limites ainda fixos no código (seção 5) |
| Regras tributárias como parâmetros | ❌ | — |
| Dados de mercado com fonte, data-base e horário de coleta | 🟡 | cotação tem fonte e data; proventos têm fonte, sem data de coleta; fundamentos têm data e fonte manuais |
| Hierarquia de fontes B3 → CVM → RI → BCB → Tesouro | ⚠️ | Yahoo como principal para cotação e proventos; B3 e CVM não integradas |
| Alerta de dado defasado | 🟡 | selo tracejado após 7 dias (fixo); robô "desatualizado" após 30 h (fixo) |
| Backup e exportação JSON + CSV | ✅ | — |

### 3.12 Interface

| Item | Status |
|---|---|
| Formato brasileiro (R$, %, dd/mm/aaaa) | 🟡 — números e moeda ✅; os campos de data usam o seletor nativo, que segue o idioma do navegador (aparece mm/dd/aaaa em navegador em inglês) |
| Algarismos tabulares à direita | ✅ |
| Verde/vermelho sempre com sinal ou ícone | 🟡 — vários valores coloridos sem sinal |
| Temas claro e escuro | ⚠️ — só escuro |
| Fonte Inter ou Manrope | ⚠️ — IBM Plex Sans + JetBrains Mono |
| Responsivo | ✅ — sem rolagem horizontal em 390 px |

---

## 4. Métricas calculadas em mais de um lugar

| Métrica | Onde | Divergência |
|---|---|---|
| **DY** | `computeBazin.dyCurrent` (12m recorrente ÷ cotação); `annualHistory.dy` (recorrente do ano ÷ preço médio do ano); Projeção "DY estimado da carteira" (renda estimada ÷ patrimônio) | três definições; nenhuma é "proventos líquidos recebidos 12m ÷ patrimônio" pedida |
| **Renda mensal** | Painel "Renda mensal (média 12m)" = recebido ÷ min(12, meses); Painel "Renda mensal estimada" = Σ qtd × provento/unidade ÷ 12; Dividendos "Renda do último mês" = penúltimo mês da série | divisor diferente de 12 |
| **Crescimento da renda** | `incomeSummary.growthPct` | troca de definição conforme o histórico disponível |
| **Retorno** | Painel "Retorno total" (valorização + realizado + proventos); Histórico por ativo "Retorno total %" (÷ total comprado) | nenhum é TWR/XIRR; não bate com "resultado acumulado" da especificação |
| **Capital aportado** | `totals.deposits` (bruto); aba Aportes "capital aportado acumulado" (aportes − retiradas) | um bruto, outro líquido |
| **Preço "bom para comprar"** | Régua: "Preço ideal de entrada" = teto × 75%; Valuation: mediana dos métodos; Central de aportes: elegibilidade por faixa | três referências; a especificação pede uma (teto × (1 − margem)) |
| **Peso do ativo** | `concentration.weights` e `exposure` | mesma fórmula ✅ |
| **Posição/PM** | `computePosition` usado por todas as telas, formulário e importação | única ✅ |
| **Preço-teto** | `computeBazin` em todas as telas | único ✅ |

---

## 5. Valores fixos no código que deveriam ser parâmetros

| Valor | Onde | Uso |
|---|---|---|
| **IRRF de JCP 15%** | `opsheet.ts:386` (fator 0,85) e textos em `Dividends.tsx:151`, `Projection.tsx:78` | conferência de proventos e textos; **desatualizado** segundo a especificação (17,5%) |
| IR regressivo da renda fixa 22,5 / 20 / 17,5 / 15% | `AssetDetail.tsx:578` | exibição na ficha do Tesouro |
| Banda de alocação ±2 p.p. | `allocation.ts:23`, `Allocation.tsx:80` | sub/sobrealocada |
| Necessidade de classe `55 − desvio × 5,5` | `allocation.ts:58` | nota de alocação |
| Selo de dado defasado: 7 dias | `ui.tsx:45` | DataTag |
| Robô desatualizado: 30 h | `RobotCard.tsx:22` | status do robô |
| Fundamentos desatualizados: 200 dias | `thesis.ts:56` | alerta |
| Evento negativo recente: 90 dias | `thesis.ts:52` | alerta |
| Extraordinário relevante: 30% | `thesis.ts:51`, `scoring.ts:242` | alerta e trava |
| Detecção de extraordinário: 2,5× mediana, 3 anos, ±75 dias | `dividends.ts:151–153` | sugestão automática |
| Teto de nota de cripto 65 e de ETF 75 | `scoring.ts:211–212` | ranking |
| Ajuste por prioridade manual ±2 por nível | `scoring.ts:209` | ranking |
| Faixas de pontuação de cada critério (ROE 5–25%, ROIC 4–20%, margem 0–25%, EBITDA 5–40%, payout 30–75/90/100%, FCF yield 0–12%, Dív./EBITDA 0–4x, alavancagem de FII 0–40%, vacância 0–20/25%, inadimplência 0–8%, P/VP 0,8–1,3, WALT 1–8 anos, DY ÷ alvo 0,5–1,3 e 2×, preço ÷ teto 60–110%, margem 0–40%, CAGR −5 a 12%) | `scoring.ts` | notas 0–100 |
| "Carteira em formação": patrimônio < 10 aportes | `allocator.ts:55` | flexibiliza limites |
| Modo automático: diferença de 10 pontos | `allocator.ts:134` | concentrar × distribuir |
| Bônus/penalidades do aporte (+5 máxima, +8 classe prioritária, −10 setor, até −15 classe sobre o alvo) | `allocator.ts` | distribuição |
| Veredito "parcial" se sobrar > 25% | `allocator.ts:176` | Central de aportes |
| Tolerâncias de conferência (R$ 0,02 / 0,5% / R$ 0,05) | `opsheet.ts` | divergência de Total |
| Lista de ações do Ibovespa para sobreposição com BOVX11 | `seed.ts` | sobreposição |

**Já são parâmetros:** DY-alvo por classe, cenários de DY, faixas da régua, pesos do ranking, limites de concentração, gatilhos de tese (payout, Dív./EBITDA, corte, vacância, inadimplência, alavancagem de FII), limiares de classificação, metas de alocação, metas de renda e premissas de projeção.

---

## 6. Dados necessários para a Etapa 6 e situação da coleta

| Dado | Situação | Fonte primária possível |
|---|---|---|
| Cotação diária | ✅ coletado (Yahoo, agregador) | B3 — arquivo COTAHIST (histórico oficial, público) |
| Histórico de preços (volatilidade, 52 semanas, maior queda) | 🟡 baixado pelo robô e descartado | idem |
| Volume / liquidez média diária | ❌ | B3 COTAHIST |
| Proventos: valor/unidade | 🟡 Yahoo (sem tipo, sem data de pagamento) | B3 (proventos em dinheiro) |
| Proventos: tipo, aprovação, data-com, pagamento | ❌ (o Yahoo só fornece a **data-ex**) | B3; brapi (exige token) como alternativa |
| Eventos (desdobramento, grupamento, bonificação, subscrição, troca de ticker) | ❌ | B3 |
| DFP/ITR: receita, lucro bruto, EBIT, lucro líquido, ativo, passivo, PL, capital de giro, lucros retidos, FCO, capex, depreciação, despesa financeira, dívida bruta/líquida, ações em circulação | ❌ (só campos manuais resumidos) | CVM dados abertos (DFP/ITR) |
| Perfil da dívida (cronograma, custo, moeda, indexador) | ❌ | notas explicativas / RI (estrutura não padronizada: preenchimento manual) |
| Governança (segmento, tag along, free float, controlador) | ❌ | B3 / formulário de referência CVM |
| Bancos (Basileia, eficiência, inadimplência 90d) | ❌ | RI / BCB IF.data |
| Seguradoras (índice combinado, sinistralidade) | ❌ | SUSEP / RI |
| FIIs: VP/cota, cotistas, rendimento, PL | ❌ (P/VP manual) | CVM — Informe Mensal Estruturado |
| FIIs: vacância, inadimplência, contratos, LTV, devedores | 🟡 manual | relatório gerencial / informe trimestral CVM |
| Selic, CDI, IPCA 12m, dólar | ✅ coletado (BCB SGS) | — |
| Séries históricas de CDI e IPCA (TWR × CDI, correção pelo IPCA) | ❌ (só o último valor) | BCB SGS |
| NTN-B (spread de FIIs, custo de oportunidade) | ❌ (só 2 títulos IPCA+ da carteira) | Tesouro Transparente (mesmo arquivo já baixado) |

---

## 7. Casos de aceitação — situação atual

| # | Caso | Situação |
|---|---|---|
| 1 | PM R$ 11,01 | ✅ passa |
| 2 | Realizado R$ 238,80; 90 a R$ 11,01 | ✅ passa |
| 3 | Desdobramento: 180, PM R$ 5,505, custo R$ 990,90 | ✅ passa |
| 4 | Bonificação 10% a R$ 4,00: 198, R$ 1.062,90, PM R$ 5,37 | ✅ passa |
| 5 | Teto, oportunidade e régua por margem | ⚠️ teto ✅; faixas e preço de oportunidade divergentes |
| 6 | JCP R$ 1,00 → R$ 0,825 | ❌ sem IR |
| 7 | TWR 8,9% | ❌ |
| 8 | Capital necessário R$ 150.000 | ❌ (não exibido) |
| 9 | 19 cotas (R$ 403,75) | ⚠️ dá 18 (arredonda para baixo) |
| 10 | IR de R$ 5.000,00 sobre R$ 50.000,01 | ❌ |
| 11 | Altman Z″ = 6,55 | ❌ |
| 12 | Aguardar por endividamento > 3,5x | ⚠️ classifica, mas como "Revisar tese" e sem esse motivo |
| 13 | Qualidade do lucro (FCO < lucro 2 anos) | ❌ |
| 14–18 | Provento automático pela data-com | ❌ |

---

## 8. Pendências da especificação original (não implementadas)

- Integração automática de **comunicados, fatos relevantes e resultados trimestrais** (hoje: registro manual com links para CVM/B3/RI).
- **Fontes primárias** B3 e CVM para cotações, proventos e indicadores (hoje: Yahoo + preenchimento manual).
- **DY médio de 10 anos** depende de histórico que o Yahoo nem sempre tem (FIIs com ~5 anos).

---

## 9. Riscos e cuidados para as próximas etapas

1. **Migração para decimal** toca todo o motor: cálculo e testes. Proposta: biblioteca `decimal.js` (bem estabelecida); valores gravados como texto decimal; conversão só na exibição. Migração reversível com cópia automática do banco antes (chave separada no IndexedDB e backup JSON para download).
2. **Livro só de inclusão** muda o comportamento de "editar" e "excluir" na Central de Operações: viram "corrigir" (estorno + novo) e "estornar", sempre com motivo.
3. **Lançamento automático de proventos** depende de uma fonte com data-com, tipo e data de pagamento. O Yahoo não tem. Opções na **P6**.
4. **Indicadores da Etapa 6** dependem de DFP/ITR da CVM: o robô precisará baixar e processar os arquivos de dados abertos (grandes, mas viáveis no GitHub Actions). Perfil da dívida, Basileia, índice combinado e boa parte dos dados de FII de tijolo/papel continuarão manuais.
5. **TWR** exige a série histórica de valor da carteira, que exige preços históricos de cada ativo (o robô passaria a guardá-los).
6. **Regras tributárias:** os valores serão gravados exatamente como na sua especificação (JCP 17,5% — LC 224/2025; dividendos 10% acima de R$ 50 mil/mês por empresa — Lei 15.270/2025; FII — Lei 14.754/2023; ganho de capital). **Não conferi o texto legal nesta sessão**; ficam editáveis e marcados "confirmar com contador".
7. Os dados existentes não serão apagados; correções históricas serão feitas por estorno registrado.

---

## 10. Perguntas antes da Etapa 1

- **P1. Nome:** renomear "Radar de Investimentos" para "Central de Investimentos"?
- **P2. Importação:** o pedido anterior era "lotes com retomada"; o atual é "tudo ou nada". Proponho **tudo ou nada** (uma única gravação atômica), mantendo o registro do lote e a reversão. Confirma?
- **P3. Campo "Opções":** não existe na plataforma. Ele vem da sua planilha? Quais valores aparecem nele (ex.: "Desdobramento", "Bonificação", "Subscrição")?
- **P4. Régua:** substituo a régua atual de 4 faixas (85% / 75% / 65% do teto, com "Oportunidade extrema") pela de 3 faixas por margem (< 0 / 0–15% / ≥ 15%). A faixa "Oportunidade extrema" deixa de existir. Confirma?
- **P5. DY-alvo padrão:** hoje 6% para ações e 8% para FIIs. A especificação fala em "meu DY-alvo (8%)". Uso 8% para ambos e exibo os 6% de Bazin ao lado?
- **P6. Fonte de proventos com data-com:**
  - (a) **B3**: coletada pelo robô a partir das páginas públicas de proventos da B3. É fonte primária, mas a interface não é documentada e pode mudar sem aviso.
  - (b) **brapi.dev com token** guardado como segredo do robô no GitHub. Traz data-com, data de pagamento e tipo.
  - (c) **Yahoo + calendário de pregões**: data-com = pregão anterior à data-ex, sem tipo nem data de pagamento.

  Recomendo **(a) com (b) como reserva identificada**. Qual prefere?
- **P7. Decimal:** posso adicionar a biblioteca `decimal.js` como dependência?
- **P8. Livro só de inclusão:** "Editar" vira "Corrigir (estorno + novo lançamento)" e "Excluir" vira "Estornar", ambos pedindo motivo. "Quem" será o aparelho (não há login de usuário). Confirma?
- **P9. Peso-alvo por ativo** (Etapa 8, "acima do peso-alvo cai uma faixa"): hoje só existe peso máximo por ativo (12%). Uso esse máximo ou crio um campo de peso-alvo no cadastro do ativo?
- **P10. Reserva de emergência:** registro como um valor em Parâmetros (fora da alocação) ou como ativos marcados "reserva" (ex.: um Tesouro Selic)?
- **P11. Day trade:** identifico como compra e venda do mesmo ativo no mesmo pregão, inclusive em corretoras diferentes?
- **P12. Nota de corretagem da Rico:** você pode enviar um exemplo (pode apagar os valores)? A Rico costuma fornecer a nota em PDF; preciso saber o formato para reconhecer.
- **P13. Interface:** trocar a fonte para Inter e criar o tema claro (mantendo o escuro) altera o visual de todas as telas, sem criar telas novas. Confirma?
- **P14. Indicadores manuais da Etapa 6:** os blocos sem dado estruturado (perfil da dívida, Basileia, índice combinado, contratos de FII) entram como campos manuais na ficha existente, com fonte e data obrigatórias. Confirma?

**Aguardo sua aprovação e as respostas acima antes de iniciar a Etapa 1.**
