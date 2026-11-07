# Auditoria financeira — fórmulas, cálculos e validações

Método: cada fórmula foi lida no código e confrontada com um cálculo feito à mão (valores de teste fictícios, em memória — nenhum dado real foi alterado). Tolerância dos testes: 1e-9 a 1e-6. Todos os cálculos de dinheiro usam `decimal.js` (40 dígitos); arredondamento só na exibição e no IR efetivamente retido (centavos).

## 1. Preço médio e posição — `src/domain/calc/positions.ts` (`run`)

| Fórmula no código | Base |
|---|---|
| PM = (Σ custo de compra com taxas) ÷ quantidade | IN RFB 1.585/2015, art. 58 |
| Venda: realizado = (valor líquido de venda) − Q × PM; PM não muda; custo cai Q × PM | idem |
| Desdobramento/grupamento: quantidade × fator; custo total preservado | Lei 6.404/1976 |
| Bonificação: + ações com o custo atribuído pela companhia | Lei 9.249/1995, art. 10 |
| Day trade: compras e vendas do mesmo ativo no mesmo pregão, preços médios do dia, cesta própria | IN RFB 1.585/2015, art. 56 |

**Cenário de teste** (`auditoria/testes/historico.test.ts`):

| Passo | Operação | Esperado (à mão) | Obtido |
|---|---|---|---|
| 1 | Compra 100 × 10,00 + 1,00 | 100 un · custo 1.001,00 | igual |
| 2 | Compra 50 × 13,00 + 0,50 | 150 · 1.651,50 · PM 11,01 | igual |
| 3 | Dividendo R$ 30 | proventos 30; custo inalterado | igual |
| 4 | Reinveste: 2 × 15,00 | 152 · 1.681,50 · PM 11,0625 | igual |
| 5 | Venda 52 × 16,00 − 0,52 | baixa 575,25 · realizado **256,23** · 100 un | igual |
| 6 | Compra 20 × 14,00 | 120 · 1.386,25 | igual |
| 7 | Transferência XP → Rico | sem efeito | igual |
| 8 | Desdobramento 1:2 | **240 un · 1.386,25 · PM 5,77604** | igual |
| — | Cotação 7,50 | mercado 1.800,00 · não realizado 413,75 · retorno total **699,98** | igual |
| 9 | Correção do passo 2 (60 un) | 260 un · custo 1.811,5 − 52 × (1.811,5/162) + 280 | igual |
| 10 | Importa compra antiga (2024) depois | 200 un · PM 30,00 · 1ª compra 10/01/2024 | igual |

Fórmula independente com taxas e grupamento (`financeiro.test.ts › 5.1`): 33 × 17,27 + 2,13 e 71 × 19,91 + 0,97, venda de 40 e grupamento 4:1 → quantidade, custo, PM e realizado conferem com 1e-9.

## 2. Painel: patrimônio e resultado — `portfolioTotals`

| Indicador | Fórmula | Situação |
|---|---|---|
| Patrimônio | Σ quantidade × cotação (sem reserva; renda fixa por valor = custo) | OK — confere com Alocação e Rendimento (`integracao.test.ts`) |
| Resultado acumulado | **antes:** patrimônio + retiradas − aportes · **agora:** Σ (valorização + realizado + proventos recebidos) de todas as posições | **DIVERGÊNCIA corrigida (A-01)**: −200,00 → 699,98; sem aportes: 1.800,00 → 699,98 |
| Capital aportado | aportes − retiradas (reinvestimento não conta) | OK; sem aportes lançados, mostra "Capital investido = compras − vendas" |
| Caixa estimado | aportes − retiradas + proventos + vendas + amortizações − compras | OK (899,98 no cenário) |

## 3. Rentabilidade — `src/domain/calc/returns.ts`

| Indicador | Fórmula | Teste | Esperado | Obtido |
|---|---|---|---|---|
| TWR (cotização mensal) | Π [(V_fim + proventos) ÷ (V_início + fluxo)] − 1, fluxo no início do mês | +10% e depois aporte de 10.000 sem ganho | 10,00% | 10,00% |
| TIR (XIRR) | taxa que zera o valor presente; Newton + bissecção | −1.000 → +1.100 em 365 dias | 10,00% a.a. | 10,00% |
| CDI acumulado | Π (1 + taxa mensal) − 1 (SGS 4391) | 1% + 1% | 2,01% | 2,01% |

A TWR mede a gestão (neutraliza aportes); a TIR mede o dinheiro investido. As duas aparecem identificadas no Painel.

## 4. Indicadores de DY — `bazin.ts`, `yoc.ts`

| Indicador | Fórmula | Numerador | Denominador | Teste (`financeiro.test.ts › 5.2`) |
|---|---|---|---|---|
| DY atual | proventos recorrentes líquidos 12m ÷ cotação | por ação, 12 meses | cotação | 0,4125 ÷ 20 = 2,0625% ✔ |
| DY projetado / de mercado | DPA de referência líquido × quantidade ÷ valor de mercado | DPA (média 5a para ações, 12m FII) | valor de mercado | 141,25 ÷ 2.000 = 7,0625% ✔ |
| Yield on Cost | mesmo numerador ÷ **custo de aquisição** | DPA de referência | custo (PM) | 141,25 ÷ 1.600 = 8,828% ✔ |
| YoC realizado 12m | proventos **recebidos** em 12m ÷ custo | recebido | custo | 41,25 ÷ 1.600 = 2,578% ✔ |
| DY da carteira (Painel) | proventos recebidos 12m ÷ patrimônio | recebido | patrimônio | coberto em `integracao.test.ts` |
| **DY médio real** (novo, A-03) | Σ proventos recebidos ÷ Σ (custo × anos em carteira) | recebido | capital × tempo | 101,25 ÷ capital-ano ✔ |

JCP líquido: 0,50 × (1 − 17,5%) = 0,4125 ✔ (LC 224/2025). Provisionado e projetado nunca entram em "recebido" (`integracao.test.ts`: R$ 80 provisionado fora dos R$ 101,25 recebidos).

**DY médio real — metodologia.** Cada intervalo entre dois lançamentos usa o custo de aquisição daquele momento (do livro), multiplicado pela duração em anos; compras adicionais aumentam o capital a partir da data; vendas parciais reduzem. Anualização linear (proventos ÷ capital-ano), comparável a um "YoC efetivo médio". Alternativas descartadas: dividir pelo patrimônio (mistura valorização) e TIR só de proventos (não é um DY). Mostrado também "só pagadores" (exclui Tesouro, cripto e ETFs sem distribuição).

## 5. Bazin, preço-teto e régua

| Item | Fórmula | Teste | Resultado |
|---|---|---|---|
| Preço-teto | DPA de referência líquido ÷ DY-alvo | DPA 1,20; DY 6% → 20,00; DY 8% → 15,00 | ✔ (`5.4`) |
| Margem | (teto − cotação) ÷ teto | teto 20, cotação 18 → 10% | ✔ |
| Preço de oportunidade | teto × (1 − margem exigida) | 20 × 0,85 = 17,00 | ✔ |
| Faixa | < 0 Aguardar · 0 a 15% Manutenção · ≥ 15% Oportunidade (editável) | limites exatos −0,01 / 0 / 14,99 / 15 | ✔ (`7`) |
| Sem proventos | sem teto, sem faixa, com motivo | — | ✔ não inventa |
| Filtro de qualidade | alerta vermelho → Aguardar; 2 amarelos → Manutenção | Dív./EBITDA 4,2× com margem 40% → Aguardar | ✔ |

## 6. Central de aportes

| Variação | Esperado | Obtido (`financeiro.test.ts › 6`) |
|---|---|---|
| Cotação 20 (margem 20%) | compra | ✔ |
| Cotação 26 (acima do teto) | não compra | ✔ |
| Aporte 400 → 1.000 a R$ 20 | 20 → 50 cotas (arredondamento para cima, regra aprovada; nunca acima do teto de participação) | ✔ |
| DY-alvo 8% → 10% | teto cai para 20 → sai da compra | ✔ |

## 7. Proventos automáticos e IR

Coberto por `aceitacao.test.ts` (data-com, compra na data-ex, venda na data-ex, JCP 17,5%, R$ 50 mil/mês por empresa, FII isento) e `proventosHist.test.ts`. **Divergência corrigida (A-04):** o provento recalculado não era recriado (ver PLANO_DE_CORRECOES.md).

## 8. Divergências matemáticas encontradas

| ID | Onde | Esperado | Obtido antes | Status |
|---|---|---|---|---|
| A-01 | Resultado acumulado | 699,98 | −200,00 (com aporte) · 1.800,00 (sem aporte) | Corrigido |
| A-04 | Provento após correção | 1 lançamento de 150 ações | 0 lançamentos | Corrigido |

Nenhuma outra fórmula divergiu do cálculo independente.
