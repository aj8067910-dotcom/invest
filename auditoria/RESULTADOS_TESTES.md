# Resultados dos testes

Execução: 07/11/2026, ambiente isolado (fixtures em memória e navegador de teste; nenhum dado real alterado).

## Verificações automáticas
| Verificação | Comando | Resultado |
|---|---|---|
| Typecheck | `npx tsc -b --noEmit` | sem erros |
| Build | `npm run build` | sem erros |
| Testes | `npx vitest run` | **20 arquivos, 127 testes, 127 passando** |
| Dependências | `npm audit` | antes: 9 avisos (2 críticos, 4 altos — maioria em ferramentas de desenvolvimento); depois de `npm audit fix`: 8 (nenhum alto no código publicado; restantes exigem versões *major*) |
| Lint | — | não configurado no projeto (Q-01) |
| Navegador (21 rotas × vazio/carteira/celular) | Playwright | 0 erros de console, 0 texto NaN/undefined, 0 transbordo, carga < 1 s |
| Robô de dados | `npx vite-node scripts/fetch-market.ts` | 34 cotações, 17 empresas CVM, 11 FIIs, 17 classificações B3, 0 erros |

## Testes que falharam antes das correções (evidência dos achados)
| Teste | Falha antes | Depois |
|---|---|---|
| `historico.test.ts › [ACHADO A-01] resultado acumulado deve incluir o caixa` | expected −200 to be close to 699,98 | passa |
| `historico.test.ts › [ACHADO A-01b] sem aportes lançados` | expected 1800 to be close to 699,98 | passa |
| `importacao.test.ts › [ACHADO A-02] reimportar após reverter` | expected 0 to be 2 | passa |
| `persistencia.test.ts › relançar operação estornada` | expected false to be true | passa |
| `persistencia.test.ts › [ACHADO A-04] recálculo de provento automático` | expected 0 to be 1 | passa |
| `persistencia.test.ts › reimportação depois de reverter um lote` | expected 0 to be 1 | passa |
| `integracao.test.ts › [ACHADO A-03] DY médio real` | realYield is not a function | passa |

## Desempenho medido
| Medida | Valor |
|---|---|
| Validar 10.000 linhas de importação | 190 ms |
| Reconstruir posições de 10.000 operações | 47–69 ms |
| Histórico do YoC (10.000 operações, 11 anos) | 1.480 ms → **43 ms** |

## Lista completa (saída do Vitest)
```
✓ src/domain/calc/engine.test.ts > Bazin > preço-teto = provento ÷ DY-alvo (exemplo do enunciado)
✓ src/domain/calc/engine.test.ts > Bazin > faixas da régua por margem (teto R$ 50, margem exigida 15%)
✓ src/domain/calc/engine.test.ts > Bazin > níveis e distância para a próxima faixa
✓ src/domain/calc/engine.test.ts > Bazin > ignora extraordinários no preço-teto
✓ src/domain/calc/engine.test.ts > Bazin > não aplica Bazin a ETF/Tesouro/cripto
✓ src/domain/calc/engine.test.ts > Posições > preço médio, venda e proventos
✓ src/domain/calc/engine.test.ts > Dividendos > CAGR exige 3 anos completos
✓ src/domain/calc/engine.test.ts > Dividendos > renda recebida desde dez/2025
✓ src/domain/calc/engine.test.ts > Ranking e aportes > ativo com payout insustentável (> 120%) fica em Aguardar com o motivo
✓ src/domain/calc/engine.test.ts > Ranking e aportes > ativo de qualidade com desconto sobe no ranking e recebe o aporte
✓ src/domain/calc/engine.test.ts > Ranking e aportes > sem oportunidades recomenda aguardar
✓ src/domain/calc/engine.test.ts > Valuation e projeção > Gordon e FCD
✓ src/domain/calc/engine.test.ts > Valuation e projeção > projeção cresce e meta é alcançada
✓ src/domain/calc/engine.test.ts > Sobreposições > detecta ITSA4 × ITUB4 e BOVX11 × ações
✓ src/domain/calc/engine.test.ts > leitura de números e datas de planilhas > números em formatos brasileiro e internacional
✓ src/domain/calc/engine.test.ts > leitura de números e datas de planilhas > datas válidas e inválidas
✓ src/domain/aceitacao.test.ts > Preço médio, venda e eventos (casos 1–4) > 1. PM = R$ 11,01
✓ src/domain/aceitacao.test.ts > Preço médio, venda e eventos (casos 1–4) > 2. venda: realizado R$ 238,80; restam 90 a R$ 11,01
✓ src/domain/aceitacao.test.ts > Preço médio, venda e eventos (casos 1–4) > 3. desdobramento 1:2: 180 ações, PM R$ 5,505, custo R$ 990,90
✓ src/domain/aceitacao.test.ts > Preço médio, venda e eventos (casos 1–4) > 4. bonificação de 10% a R$ 4,00: 198 ações, custo R$ 1.062,90, PM R$ 5,37
✓ src/domain/aceitacao.test.ts > Preço-teto, régua e classificação (casos 5, 9, 12) > 5. teto R$ 25,00 e oportunidade R$ 21,25; R$ 26 Aguardar; R$ 22 Manutenção (12%); R$ 20,50 Oportunidade (18%)
✓ src/domain/aceitacao.test.ts > Preço-teto, régua e classificação (casos 5, 9, 12) > 5b. sem tese registrada, a margem de 18% não basta: Manutenção
✓ src/domain/aceitacao.test.ts > Preço-teto, régua e classificação (casos 5, 9, 12) > 9. aporte de R$ 400 a R$ 21,25 → 19 cotas (R$ 403,75)
✓ src/domain/aceitacao.test.ts > Preço-teto, régua e classificação (casos 5, 9, 12) > 12. margem de 18% com Dív. Líq./EBITDA 3,8x → Aguardar, motivo "endividamento acima de 3,5x"
✓ src/domain/aceitacao.test.ts > Tributação, rentabilidade e metas (casos 6, 7, 8, 10, 11) > 6. JCP bruto R$ 1,00 → líquido R$ 0,825
✓ src/domain/aceitacao.test.ts > Tributação, rentabilidade e metas (casos 6, 7, 8, 10, 11) > 7. TWR acumulada = 8,9%
✓ src/domain/aceitacao.test.ts > Tributação, rentabilidade e metas (casos 6, 7, 8, 10, 11) > 8. renda de R$ 1.000/mês com DY de 8% → capital necessário R$ 150.000
✓ src/domain/aceitacao.test.ts > Tributação, rentabilidade e metas (casos 6, 7, 8, 10, 11) > 10. dividendos de R$ 50.000,01 de uma empresa no mês → IR R$ 5.000,00
✓ src/domain/aceitacao.test.ts > Tributação, rentabilidade e metas (casos 6, 7, 8, 10, 11) > 10b. até R$ 50.000,00 → isento
✓ src/domain/aceitacao.test.ts > Tributação, rentabilidade e metas (casos 6, 7, 8, 10, 11) > 11. Altman Z″ emergentes = 6,55 (zona segura)
✓ src/domain/aceitacao.test.ts > Qualidade do lucro (caso 13) > 13. FCO R$ 80 e lucro R$ 100 por dois anos → alerta amarelo
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > 14. 100 em 08/04 + 50 em 10/04 (data-com) + 30 em 11/04 → 150 elegíveis, bruto R$ 75,00, PROVISIONADO
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > 15. 200 ações; venda de 80 na data-com → 120; venda na data-ex → 200
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > 16. JCP de R$ 0,40 para 150 ações → bruto R$ 60,00, IR R$ 10,50, líquido R$ 49,50
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > 17. desdobramento 1:2 depois da data-com não altera o provento devido
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > 18. provento manual com a mesma chave → um único registro e divergência apontada
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > idempotente: aplicar o plano e recalcular não gera nada novo
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > retificação: valor por ação alterado pela companhia → estorno do anterior + novo lançamento
✓ src/domain/aceitacao.test.ts > Lançamento automático de proventos pela data-com (casos 14–18) > dividendos acima de R$ 50 mil no mês da mesma empresa: 10% sobre o total
✓ src/domain/aceitacao.test.ts > Livro só de inclusão > estorno não apaga; correção = estorno + novo; cálculos ignoram o estornado
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > reconhece as 8 abas pelos nomes e cabeçalhos exatos
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > valida, separa aporte de reinvestimento e não descarta nada silenciosamente
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > reconstrói a carteira: bonificação com custo, venda, saldo inicial, transferência e renda fixa por valor
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > reimportar o mesmo arquivo não duplica nada
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > exportação no formato da planilha volta como duplicada (ida e volta)
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > avisa divergência entre Quantidade total informada e posição calculada
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > venda sem compras anteriores vai para revisão sugerindo saldo inicial
✓ src/domain/opsheet.test.ts > planilha da Central de Operações > processa 5.000 operações rapidamente
✓ src/domain/opsheet.test.ts > motor de posição: eventos corporativos > desdobramento e grupamento mudam quantidade e mantêm o custo
✓ src/domain/opsheet.test.ts > motor de posição: eventos corporativos > evento no mesmo dia é processado antes da compra
✓ src/domain/opsheet.test.ts > motor de posição: eventos corporativos > grupamento que gera fração vai para revisão
✓ src/domain/opsheet.test.ts > motor de posição: eventos corporativos > identificador da operação define a impressão digital
✓ src/domain/opsheet.test.ts > migração de dados antigos > operações da versão anterior ganham categoria e impressão digital sem perder nada
✓ auditoria/testes/financeiro.test.ts > 5.1 Preço médio (fórmula independente) > Σ custo ÷ Σ quantidade, venda não altera PM, desdobramento mantém custo
✓ auditoria/testes/financeiro.test.ts > 5.2 Indicadores de DY distintos > JCP líquido de 17,5%
✓ auditoria/testes/financeiro.test.ts > 5.2 Indicadores de DY distintos > DY atual (12m, sobre a cotação), DY projetado (DPA de referência), YoC (sobre o custo), YoC realizado (recebido ÷ custo)
✓ auditoria/testes/financeiro.test.ts > 5.4 Bazin: preço-teto = DPA ÷ DY e o DY configurado altera o resultado > DY 6% → teto 20; DY 8% → teto 15; margem e faixa recalculadas
✓ auditoria/testes/financeiro.test.ts > 5.4 Bazin: preço-teto = DPA ÷ DY e o DY configurado altera o resultado > sem proventos: sem teto e com motivo (não inventa)
✓ auditoria/testes/financeiro.test.ts > 7. Régua de decisão: limiares configuráveis > margem < 0 aguardar; 0 a 15% manutenção; ≥ 15% oportunidade; margem exigida editável
✓ auditoria/testes/financeiro.test.ts > 7. Régua de decisão: limiares configuráveis > preço baixo sozinho não basta: alerta de endividamento rebaixa (não é só preço)
✓ auditoria/testes/financeiro.test.ts > 5.5 Rentabilidade: TWR e TIR contra cálculo independente > XIRR de −1.000 → +1.100 em 365 dias = 10%
✓ auditoria/testes/financeiro.test.ts > 5.5 Rentabilidade: TWR e TIR contra cálculo independente > TWR neutraliza aporte: +10% e depois 0% com aporte grande = 10%
✓ auditoria/testes/financeiro.test.ts > 5.5 Rentabilidade: TWR e TIR contra cálculo independente > CDI acumulado composto
✓ auditoria/testes/financeiro.test.ts > 6. Central de aportes reage aos parâmetros > preço abaixo do preço de oportunidade compra; acima do teto aguarda
✓ auditoria/testes/financeiro.test.ts > 6. Central de aportes reage aos parâmetros > valor do aporte muda a quantidade (arredondamento para cima, decisão documentada)
✓ auditoria/testes/financeiro.test.ts > 6. Central de aportes reage aos parâmetros > DY-alvo maior reduz o teto e pode tirar o ativo da compra
✓ auditoria/testes/historico.test.ts > Seção 3 — histórico (cenários 1 a 8) > quantidade, custo e PM ao fim
✓ auditoria/testes/historico.test.ts > Seção 3 — histórico (cenários 1 a 8) > quantidade histórica: comprado 172, vendido 52
✓ auditoria/testes/historico.test.ts > Seção 3 — histórico (cenários 1 a 8) > realizado, não realizado, proventos, reinvestido
✓ auditoria/testes/historico.test.ts > Seção 3 — histórico (cenários 1 a 8) > transferência de custódia não altera posição nem vira aporte
✓ auditoria/testes/historico.test.ts > Seção 3 — histórico (cenários 1 a 8) > dividendo não é valorização; venda não é exclusão
✓ auditoria/testes/historico.test.ts > Seção 3 — histórico (cenários 1 a 8) > [ACHADO A-01] resultado acumulado do painel deve incluir o caixa (proventos e vendas não reinvestidos)
✓ auditoria/testes/historico.test.ts > Seção 3 — histórico (cenários 1 a 8) > [ACHADO A-01b] sem aportes lançados, o resultado acumulado não pode virar o patrimônio inteiro
✓ auditoria/testes/historico.test.ts > Seção 3 — correção de lançamento antigo (cenário 9) > estorno + novo lançamento recalcula tudo a partir da data
✓ auditoria/testes/historico.test.ts > Seção 3 — importação de operações anteriores (cenário 10) > compra antiga importada depois entra na ordem cronológica e muda o PM
✓ src/domain/calc/yoc.test.ts > Yield on Cost > custo pelo PM com vendas; YoC = projetado ÷ custo; recebido sem provisionado
✓ src/domain/calc/yoc.test.ts > Yield on Cost > histórico do YoC realizado usa só o recebido
✓ src/domain/calc/yoc.test.ts > Yield on Cost > simulação de aporte: R$ 1.000 a R$ 25 → 40 ações; DY editável
✓ src/domain/calc/yoc.test.ts > Compensação de queda por proventos > tempo = perda ÷ proventos mensais
✓ src/domain/calc/yoc.test.ts > Compensação de queda por proventos > reinvestir encurta o prazo; sem proventos não há prazo
✓ src/domain/calc/yoc.test.ts > Criptoativos: 8 casas decimais > exibe e lê as quantidades sem perder casas
✓ src/domain/calc/yoc.test.ts > Criptoativos: 8 casas decimais > custo e posição em decimal exato
✓ src/domain/calc/yoc.test.ts > Número mágico (bola de neve) > FII a R$ 10,00 pagando R$ 0,10/mês: 100 cotas; com 60, faltam 40 (R$ 400)
✓ auditoria/testes/persistencia.test.ts > Seção 11 — persistência e integridade do livro > criar, corrigir e excluir nunca apagam registros (só estornos)
✓ auditoria/testes/persistencia.test.ts > Seção 11 — persistência e integridade do livro > relançar uma operação estornada não é bloqueado como duplicada
✓ auditoria/testes/persistencia.test.ts > Seção 11 — persistência e integridade do livro > duplicata de operação ATIVA continua bloqueada
✓ auditoria/testes/persistencia.test.ts > Seção 11 — persistência e integridade do livro > [ACHADO A-04] recálculo de provento automático (mesma data-com) recria o lançamento estornado
✓ auditoria/testes/persistencia.test.ts > Seção 11 — persistência e integridade do livro > reimportação depois de reverter um lote grava de novo as operações
✓ auditoria/testes/persistencia.test.ts > Seção 11 — persistência e integridade do livro > backup completo inclui livro, auditoria, importações e conciliações e restaura igual
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (1)(3) arquivo válido com várias abas é reconhecido por categoria
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (4) datas em formatos diferentes: dd/mm/aaaa, aaaa-mm-dd e número de série do Excel
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (5)(6)(10) células vazias, valores inválidos e linhas parciais viram erro listado (nada descartado em silêncio)
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (7) ativo desconhecido é proposto como novo ativo (com aviso)
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (8) duplicidade com o que já existe é detectada; reimportar o mesmo arquivo não duplica
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (9) operações fora de ordem cronológica são reconstruídas pela data
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (11) reprocessamento após correção: a correção na revisão vale
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > [ACHADO A-02] depois de reverter uma importação (estorno), reimportar o arquivo corrigido não pode descartar as linhas como duplicadas
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (12) exportação → importação é ida e volta sem perda (todas reconhecidas como já existentes)
✓ auditoria/testes/importacao.test.ts > Seção 4 — importação > (2) grande volume: 10.000 operações validadas e reconstruídas em tempo aceitável
✓ auditoria/testes/integracao.test.ts > Seção 15 — consistência entre módulos > proventos recebidos: Painel = Dividendos = Yield on Cost = soma das posições (provisionado fora)
✓ auditoria/testes/integracao.test.ts > Seção 15 — consistência entre módulos > patrimônio: Painel = Rendimento (carteira) = Alocação
✓ auditoria/testes/integracao.test.ts > Seção 15 — consistência entre módulos > retorno total: soma por ativo = soma por classe = carteira (inclui posição encerrada)
✓ auditoria/testes/integracao.test.ts > Seção 15 — consistência entre módulos > [ACHADO A-03] DY médio real: proventos recebidos ÷ (capital investido × tempo em carteira), anualizado
✓ src/domain/calc/sell.test.ts > Oportunidade de Venda > cotação acima da saída Bazin e de Graham, múltiplos acima da média → VENDER
✓ src/domain/calc/sell.test.ts > Oportunidade de Venda > retorno positivo, só 1 sinal → AGUARDAR, com preço-gatilho
✓ src/domain/calc/sell.test.ts > Oportunidade de Venda > retorno negativo → NÃO VENDER, mesmo com sinais
✓ src/domain/calc/sell.test.ts > Oportunidade de Venda > meta atingida basta (com retorno positivo)
✓ src/domain/calc/sell.test.ts > Oportunidade de Venda > IR: venda de ações até R$ 20 mil no mês é isenta
✓ src/domain/calc/teto.test.ts > Teto de participação por ativo > usa o teto do ativo; vazio cai no limite geral
✓ src/domain/calc/teto.test.ts > Teto de participação por ativo > quanto cabe: 10% de teto, ativo R$ 500 em R$ 10.000 → R$ 555,56
✓ src/domain/calc/teto.test.ts > Teto de participação por ativo > no teto → Aguardar com motivo
✓ src/domain/calc/teto.test.ts > Teto de participação por ativo > abaixo do teto → aporte limitado ao que cabe
✓ src/domain/calc/breakdown.test.ts > Rendimento por nível > classificação B3 para ações; segmento de atuação para FII
✓ src/domain/calc/breakdown.test.ts > Rendimento por nível > setor soma os ativos; retorno = valorização + proventos
✓ src/services/io.test.ts > importação de extratos da B3 > movimentação: compras, proventos e Tesouro ligados aos ativos cadastrados
✓ src/services/io.test.ts > importação de extratos da B3 > negociação: remove o F do mercado fracionário
✓ src/domain/calc/proventosHist.test.ts > Proventos históricos sem data de pagamento > Yahoo antigo vira recebido com data estimada; B3 "a definir" continua provisionado; rodar de novo não duplica
✓ src/domain/calc/proventosHist.test.ts > Proventos históricos sem data de pagamento > lançamento antigo sem data é estornado e relançado com a data estimada (uma vez)
✓ src/domain/calc/cvmFundamentals.test.ts > Indicadores calculados da CVM > payout, dívida líquida/EBITDA, FCL, LPA, P/L
✓ src/domain/calc/cvmFundamentals.test.ts > Indicadores calculados da CVM > CVM tem prioridade; manual só preenche o que a CVM não tem
✓ auditoria/testes/desempenho.test.ts > Seção 13 — desempenho (10.000 operações, 20 ativos, 11 anos) > mede cada etapa do painel
✓ src/domain/calc/watchlist.test.ts > Watchlist na Central de aportes > em Manutenção (margem 12%) não entra, mesmo com "incluir manutenção"
✓ src/domain/calc/watchlist.test.ts > Watchlist na Central de aportes > em Oportunidade (margem 18%) entra
✓ src/services/marketdata.test.ts > mesclagem de proventos do robô > marca pagamento atípico novo como extraordinário e não duplica lançamento manual
✓ src/services/marketdata.test.ts > mesclagem de proventos do robô > preserva a marcação feita pelo usuário em coletas seguintes
✓ src/services/brapi.test.ts > brapi.dev > converte resposta real (amostra gravada) em cotação e proventos por unidade
✓ src/services/cloudsync.test.ts > criptografia da nuvem > ida e volta com a senha correta; senha errada é recusada
```
