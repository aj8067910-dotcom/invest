# Metodologia de Venda — proposta para aprovação

> Status: **PROPOSTA** (nada foi alterado no painel). Depois da aprovação, este texto vira a aba "Metodologia de Venda".
> A plataforma classifica e explica; a decisão de vender é sempre sua.

## 1. O que dizem as referências

| Autor / estudo | O que diz sobre vender | Como entra aqui |
|---|---|---|
| **Décio Bazin**, *Faça Fortuna com Ações* | 6% de DY é o **piso para comprar** (preço-teto = DPA ÷ 0,06). Para **vender**, o livro (p. 136, conforme Suno e UFPel) indica quando o dividendo cai a **4%** do preço — cerca de 50% acima do teto. | Critério 1. **Decisão sua:** sinal em 6% (pediu) ou 4% (Bazin). |
| **Benjamin Graham**, *O Investidor Inteligente* (cap. 14) e *Security Analysis* | Valor intrínseco conservador: **Número de Graham = √(22,5 × LPA × VPA)** (P/L ≤ 15 e P/VP ≤ 1,5). Regra prática de venda atribuída a ele: vender após **alta de 50% ou 2 anos**, o que vier antes (estratégia de ações abaixo do capital de giro líquido). | Critério 2: prêmio da cotação sobre o Número de Graham. |
| **Philip Fisher**, *Ações Comuns, Lucros Extraordinários* | Se a compra foi bem feita, a hora de vender é "quase nunca". Só três motivos: (1) a compra foi um erro; (2) a empresa deixou de cumprir os critérios; (3) há uma oportunidade claramente melhor. Medo de queda do mercado **não** é motivo. | Critério 5 (deterioração) e critério 4 (oportunidade melhor). |
| **Peter Lynch**, *O Jeito Peter Lynch de Investir* | A venda depende do tipo de empresa: "stalwarts" (grandes e estáveis) depois de **30–50% de alta** se ficaram caras; crescimento rápido quando o crescimento acaba; cíclicas no topo do ciclo. Saber por que comprou define quando vender. | Meta pessoal (critério 6) e tese do ativo. |
| **Luiz Barsi Filho** | Praticamente não vende: "quando está cara, eu não realizo lucro, simplesmente deixo de comprar". O objetivo é viver da renda. | Contraponto: preço alto sozinho não basta → exigência de **2 sinais**. |
| **Odean (1998)**, *Journal of Finance* 53(5) | **Efeito disposição**: investidores vendem ganhadores cedo demais e seguram perdedores; isso reduz o retorno, sobretudo depois de impostos. | Alerta sobre a regra "NÃO VENDER com retorno negativo" (ver seção 4). |
| **Shefrin e Statman (1985)**, *Journal of Finance* | Origem do termo "efeito disposição". | Idem. |
| **Barber e Odean (2000)**, *Journal of Finance* 55(2) | Quem mais negocia rende menos: 11,4% a.a. contra 17,9% do mercado (66 mil famílias, 1991–96), por custos. | Venda só com sinais múltiplos; custo e IR mostrados. |
| **Campbell e Shiller (1998)**, *Journal of Portfolio Management* 24(2) | Múltiplos altos (P/L) preveem retornos futuros menores: a volta à média acontece pelo preço, não pelo lucro. | Critério 3: P/L e P/VP contra a média de 5 anos. |
| **Lintner (1956)**; **Benartzi, Michaely e Thaler (1997)** | Empresas suavizam dividendos e só cortam quando o lucro piora de forma persistente; corte é sinal forte. | Critério 5: tendência de payout, lucro e dívida. |
| **Lei 11.033/2004**, art. 3º; **IN RFB 1.585/2015** | Ganho na venda de ações: 15%, isento até R$ 20 mil de vendas no mês; FII: 20% sem isenção. | Mostrado na tela (IR estimado da venda); não é critério. |

## 2. Critérios calculados para cada ativo

Os dados vêm automaticamente: preço médio, quantidade e proventos do livro da Central de Operações; cotação da B3; lucro, patrimônio, dívida e payout da CVM (DFP); CDI e IPCA do Banco Central; taxa da NTN-B do Tesouro.

| # | Critério | Cálculo | Indica venda quando (padrão, editável) |
|---|---|---|---|
| 1 | **Preço de saída Bazin** | DPA de referência líquido (média de 5 anos, sem extraordinários) ÷ DY de saída | Cotação ≥ preço de saída. Mostra os dois: teto de compra (6%) e saída (4%). |
| 2 | **Prêmio sobre Graham** | Cotação ÷ √(22,5 × LPA × VPA) − 1 | Prêmio > 0% (cotação acima do valor intrínseco). Não se aplica a FII nem a lucro ≤ 0. |
| 3 | **Múltiplos vs. 5 anos** | P/L e P/VP de hoje vs. média de 2021–2025 (preço médio do ano ÷ LPA/VPA do ano, da CVM) | Os dois acima da média e pelo menos um **20%** acima. FII: só P/VP. |
| 4 | **Custo de oportunidade** | Retorno total desde a compra (variação + proventos + vendas parciais) vs. "se cada compra tivesse ido para o CDI" e "para IPCA + taxa da NTN-B da data da compra" | Retorno total abaixo do CDI do período **e** DY projetado abaixo da taxa real da NTN-B de hoje (o Tesouro paga mais, com menos risco). |
| 5 | **Sustentabilidade dos dividendos** | Payout médio de 3 anos e tendência; lucro líquido (3 anos); dívida líquida ÷ EBITDA e variação; corte do provento em 12 meses | Dois ou mais: payout > 100% ou subindo 3 anos acima de 80%; lucro caindo 2 anos seguidos; DL/EBITDA > 3,5× ou subindo 1× em 2 anos; provento 12m 20% menor. Bancos: ROE caindo no lugar da dívida. FII: corte de rendimento. |
| 6 | **Meta pessoal** | Coluna editável: retorno total desejado (%) | Retorno total ≥ meta. |

## 3. Coluna "Status"

| Status | Regra | Cor |
|---|---|---|
| **VENDER** | Retorno total **> 0** e (**2 ou mais** critérios 1–5 indicando venda **ou** meta atingida) | verde |
| **AGUARDAR** | Retorno total ≥ 0, sem os critérios acima | amarelo |
| **NÃO VENDER** | Retorno total **< 0** | vermelho |

Cada linha mostra quais critérios acenderam, o IR estimado da venda (com a isenção de R$ 20 mil/mês para ações) e o preço a partir do qual o status muda para VENDER.

## 4. Pontos que precisam da sua decisão

1. **DY do preço de saída (critério 1):** 6% (seu pedido) ou 4% (regra de venda de Bazin)? Com 6%, o sinal acende assim que o ativo passa do preço-teto de compra. Com 4%, só quando está cerca de 50% acima dele.
2. **Critérios 4 e 5 não medem sobrevalorização:** medem custo de oportunidade e deterioração (os motivos 2 e 3 de Fisher). Proposta: contar os 5 como "sinais de venda" na regra dos 2 critérios.
3. **Retorno negativo:** pela regra pedida, o status fica "NÃO VENDER" mesmo se a empresa se deteriorar. Fisher, Lynch e Odean (1998) apontam que segurar perdedores por causa do prejuízo é um viés caro. Proposta: manter o status pedido, mas mostrar um aviso "⚠ revisar tese" quando o critério 5 acender com retorno negativo.
4. **Alerta por e-mail no "Radar da Carteira — Resumo Diário":** a tarefa diária pesquisa notícias, mas não enxerga seus dados (estão no navegador e na nuvem criptografada). O repositório é **público**, então colocar preço médio lá exporia seus dados. Proposta: ao abrir o painel, ele grava num gist **secreto** da sua conta só a lista da aba (ticker, status, critérios acesos e o preço a partir do qual vira VENDER), sem quantidades nem valores em reais. A tarefa diária lê esse arquivo e a cotação do dia e inclui a seção "🔔 Oportunidade de Venda" no e-mail quando algum ativo estiver em VENDER. Limite: os critérios de balanço só se atualizam quando o painel é aberto; a comparação com a cotação é diária.

## 5. Exemplo com os dados de hoje (ilustrativo, DPA bruto, sem seu preço médio)

| Ativo | Cotação | DY 5a | Saída 6% | Saída 4% | Graham | Prêmio | P/L hoje vs 5a | P/VP hoje vs 5a |
|---|---|---|---|---|---|---|---|---|
| ITUB4 | 38,49 | 4,9% | 31,53 | 47,29 | 42,25 | −9% | 9,5 vs 7,8 | 1,97 vs 1,40 |
| AXIA3 | 46,39 | 4,0% | 30,67 | 46,01 | 46,57 | 0% | 20,1 vs 16,6 | 1,11 vs 0,83 |
| ITSA4 | 12,42 | 6,0% | 12,32 | 18,48 | 16,60 | −25% | 8,4 vs 6,3 | 1,49 vs 1,06 |
| BBSE3 | 40,79 | 6,6% | 44,55 | 66,82 | 23,65 | +73% | 8,8 vs 8,8 | 7,63 vs 6,69 |
| TIMS3 | 19,45 | 6,6% | 21,33 | 32,00 | 20,19 | −4% | 10,8 vs 13,1 | 1,94 vs 1,48 |

Com saída em 6%, ITUB4 e AXIA3 já teriam 2 sinais (Bazin + múltiplos), e ITSA4 ficaria no limite. Com 4%, nenhum dos três chega a 2 sinais hoje.

## Fontes consultadas

- Bazin, regra de venda em 4% e 6% como piso de compra: [Suno — Décio Bazin](https://www.suno.com.br/tudo-sobre/decio-bazin) · [UFPel — Superávit Caseiro](https://wp.ufpel.edu.br/superavit/2023/08/17/estrategia-e-didatica-a-historia-de-decio-bazin-icone-do-mercado-financeiro-brasileiro/) · [Investidor10](https://investidor10.com.br/conteudo/estrategia-de-decio-bazin/)
- Graham: [Graham number — Wikipedia](https://en.wikipedia.org/wiki/Graham_number) · [Stingy Investor](https://www.stingyinvestor.com/SI/articles/0405.shtml) · [AAII — NCAV](https://www.aaii.com/journal/article/benjamin-graham-s-net-current-asset-value-approach)
- Fisher: [Safal Niveshak](https://www.safalniveshak.com/smart-people-investing-know-when-to-sell/) · [MOI Global](https://moiglobal.com/investing-titans-on-when-to-sell/)
- Lynch: [GuruFocus — One Up on Wall Street](https://gurufocus.com/news/718217/one-up-on-wall-street-when-to-buy-and-when-to-sell)
- Barsi: [IstoÉ Dinheiro](https://istoedinheiro.com.br/aprenda-com-o-warren-buffett-brasileiro-3) · [Cortes Investimentos](https://cortesinvestimentos.substack.com/p/a-estrategia-de-luiz-barsi-filho)
- Odean (1998): [CFA Institute digest](https://rpc.cfainstitute.org/research/cfa-digest/1999/05/are-investors-reluctant-to-realize-their-losses-digest-summary)
- Barber e Odean (2000): [artigo (Berkeley)](https://faculty.haas.berkeley.edu/odean/Papers%20current%20versions/Individual_Investor_Performance_Final.pdf) · [RePEc](https://econpapers.repec.org/RePEc:bla:jfinan:v:55:y:2000:i:2:p:773-806)
- Campbell e Shiller: [NBER w8221](https://www.nber.org/papers/W8221)

Observação: parte das citações de livros foi confirmada em resumos de terceiros, não no texto original (ex.: a página 136 de Bazin e a regra de 50%/2 anos de Graham).
