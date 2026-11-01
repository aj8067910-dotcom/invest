# Radar de Investimentos — Dividendos & Renda Passiva

Terminal pessoal de análise e decisão para uma carteira **Buy and Hold focada em dividendos** (Bazin / Barsi), na B3.
Responde rapidamente: quanto tenho investido, quanto recebo por mês, o que está barato ou caro, qual o preço-teto e a margem de segurança, onde colocar os próximos R$ 400 e se estou avançando rumo à independência financeira.

> Ferramenta de apoio à decisão. Não é recomendação de investimento e **não executa operações**.

## Acesso

**https://aj8067910-dotcom.github.io/invest/** — publicado automaticamente a cada atualização do código (GitHub Actions → branch `gh-pages`). No celular, use “Adicionar à tela de início” para abrir como app.

## Dados de mercado automáticos (sem token)

Um robô no GitHub Actions (`scripts/fetch-market.mjs`) roda 4× por dia útil e aos sábados e publica `market-data.json` junto com o site:
- cotações de ações, FIIs e ETFs da B3 e 10 anos de proventos por unidade e preço médio anual (Yahoo Finance);
- PU e taxa dos títulos do Tesouro Direto (arquivo oficial do Tesouro Transparente);
- Selic, IPCA 12m, CDI e dólar PTAX (Banco Central — SGS); BTC e USDC (CoinGecko).

Ao abrir o Radar esses dados são aplicados automaticamente, sem apagar o que você editou (cotação manual mais recente, marcações de extraordinário, proventos lançados à mão). A lista de ativos coletados fica em `market/tickers.json`; ativos fora dela usam a brapi.dev (token opcional) ou cotação manual.

## Banco de dados na nuvem (cadastre uma vez, use em qualquer aparelho)

Em **Dados & integrações → Banco de dados na nuvem**:
1. Crie um token do GitHub com apenas a permissão `gist` (o link está na tela) e escolha uma senha de criptografia.
2. Clique em **Ativar sincronização**. Os dados deste aparelho vão para um gist **secreto** da sua conta, **criptografados no navegador** (AES-GCM 256 com chave derivada da senha por PBKDF2). O GitHub só guarda texto cifrado.
3. Em cada outro aparelho, informe o mesmo token e a mesma senha: os dados aparecem.

A partir daí cada alteração é salva na nuvem ~3 s depois, e ao abrir o Radar (ou voltar à aba) ele busca o que mudou em outro aparelho. Se dois aparelhos alterarem ao mesmo tempo, o sistema pergunta qual versão manter em vez de sobrescrever. O token da brapi.dev e todos os parâmetros vão junto. Token do GitHub e senha ficam só no aparelho; **guarde a senha** — sem ela a cópia na nuvem não pode ser lida.

## Importar operações da B3

Em **Histórico → Importar CSV/Excel**, envie o extrato baixado da [Área do Investidor da B3](https://www.investidor.b3.com.br) (Extratos → **Movimentação** ou **Negociação** → Excel). O formato é detectado automaticamente: compras, vendas, dividendos, JCP, rendimentos, amortizações e Tesouro Direto são lançados de uma vez, ligados aos ativos já cadastrados (ativos novos são criados). Linhas repetidas são ignoradas, então reimportar o extrato do mês não duplica nada.

## Como rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes do motor de cálculo
npm run build      # gera dist/ (site estático; funciona em qualquer hospedagem, inclusive GitHub Pages)
```

Primeiro uso:
1. **Dados & integrações** → cole o token gratuito da [brapi.dev](https://brapi.dev) → **Atualizar dados** (cotações + histórico de proventos da B3; Banco Central; CoinGecko).
2. **Histórico** → lance compras, vendas e proventos recebidos (ou importe CSV/Excel). Quantidade, preço médio e rentabilidade são calculados daí.
3. Na ficha de cada ativo, preencha fundamentos (ROE, payout, vacância…) e revise proventos extraordinários.
4. Tesouro IPCA+: informe PU e taxa atual manualmente (não há API aberta do Tesouro para navegador).

## Módulos

| Tela | O que faz |
|---|---|
| Painel | Patrimônio, renda real × estimada, crescimento da renda, sugestão para o próximo aporte, baratos/caros, alertas |
| Carteira & Watchlist | Cadastro editável, filtros, transferência carteira ⇄ watchlist, exclusão |
| Ficha do ativo | Resumo e composição da pontuação · Preço-teto e régua · Dividendos (DY 5/10a, CAGR, frequência, recorrente × extraordinário) · Fundamentos padrão CNPI com histórico de revisões · Valuation (Bazin, Gordon, FCD, P/L e P/VP histórico/setorial, Graham) · Eventos e fontes primárias |
| Preço-teto & Régua | Tabela de todos os ativos de renda, DY-alvo individual, cenários 6/8/9/10%, régua em escada, calculadora |
| Ranking | Pontuação 0–100 em 12 critérios com pesos configuráveis e travas |
| Central de aportes | Distribui o valor disponível (concentrar, dividir ou **aguardar**), simula quantidades, mostra impacto na alocação e por que outros ativos ficaram de fora |
| Dividendos | Renda mensal/anual recebida, média 12m, crescimento, participação por ativo, dependência dos maiores pagadores |
| Alocação | Alvo editável (30/30/25/10/5), sub/sobrealocação, classe prioritária, impacto do aporte |
| Concentração | Exposição por ativo, setor, emissor, classe, segmento/tipo de FII, internacional e moeda; sobreposições (ITSA4×ITUB4, BOVX11×ações, IVVB11×NASD11) |
| Projeção | Cenários conservador/moderado/otimista até 2045, valores reais e nominais, prazo para metas de renda |
| Histórico | Compras, vendas, dividendos, JCP, rendimentos, juros, amortizações, aportes, reinvestimentos; importação/exportação CSV e Excel |
| Parâmetros | Todas as regras: faixas da régua, DY-alvo, pesos, limiares, limites de concentração, gatilhos de revisão de tese |

## Regras de decisão implementadas

- **Preço-teto** = provento anual recorrente por unidade ÷ DY-alvo. Extraordinários nunca entram (pagamentos > 2,5× a mediana são sinalizados).
- **Régua**: aguardar (> 85% do teto), manutenção (75–85%), oportunidade (65–75%), extrema (≤ 65%) — editáveis.
- **Queda não é oportunidade automática**: com alertas de fundamentos (payout > 100%, dívida acima do limite, corte de proventos, queda de ROE/margem entre revisões, vacância/inadimplência, evento negativo), o ativo vai para *monitoramento* ou *revisar tese*.
- **DY alto não é premiado sozinho**: DY > 2× o alvo com sustentabilidade fraca limita a classificação.
- **Dados insuficientes** (< 50% do peso com informação) limitam a classificação a *monitoramento*.
- **ETFs, Tesouro e cripto** não usam Bazin: são avaliados por alocação, custo, taxa real e risco, e o aporte nunca passa do que falta para a classe atingir o alvo. Cripto tem pontuação limitada (não gera renda).
- **A alocação orienta, não obriga**: classe subalocada ganha peso, mas só recebe aporte se houver ativo com qualidade e preço adequados.

## Dados

Todo número mostra sua natureza: `REAL` (fonte + data), `MANUAL`, `ESTIMATIVA`, `PROJEÇÃO` ou `SEM DADO`. O sistema **nunca inventa** cotações, proventos ou indicadores: o cadastro inicial traz só metadados (classe, setor, emissor, segmento).

| Fonte | Uso | Modo |
|---|---|---|
| Robô (Yahoo Finance, dados B3) | Cotações, proventos, preço médio anual | Automático, sem token |
| brapi.dev | Ativos fora da lista do robô | Opcional (token) |
| Banco Central — SGS | Selic, IPCA 12m, CDI, PTAX | Automático |
| CoinGecko | BTC, USDC em BRL | Automático |
| Tesouro Transparente | PU e taxa do Tesouro Direto | Automático (robô) |
| CVM (RAD/Fundos.NET), RI, gestores | Fatos relevantes, resultados, indicadores | Manual + links |

**Persistência:** IndexedDB do navegador como cópia local + sincronização criptografada em gist secreto (opcional, recomendada). Backup JSON manual continua disponível em *Dados & integrações*.

## Arquitetura

```
src/
  domain/            regras de negócio puras (testadas, sem React)
    types.ts  seed.ts  util.ts  format.ts
    calc/  positions · dividends · bazin · scoring · allocator · allocation
           concentration · thesis · valuation · projection  (+ engine.test.ts)
  services/          brapi · bcb · coingecko · sync · io (CSV/Excel/B3/JSON) · cloudsync (nuvem criptografada)
  store/             estado persistente (zustand + IndexedDB) e dados derivados
  components/        UI base, régua em escada, formulários
  pages/             uma tela por módulo
```

Stack: React 18 + TypeScript + Vite, Recharts, Zustand, SheetJS (carregado sob demanda), Vitest.
