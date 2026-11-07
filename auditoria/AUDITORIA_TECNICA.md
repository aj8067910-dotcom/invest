# Auditoria técnica — arquitetura, código, dados e integrações

## 1. Arquitetura (inspeção do repositório)

| Camada | Tecnologia | Local |
|---|---|---|
| Interface | React 18 + TypeScript 5.6, Vite 5.4, React Router 6.30 (HashRouter), Recharts | `src/pages`, `src/components` |
| Regras de negócio (puras, testáveis) | TypeScript + decimal.js | `src/domain` (≈ 6 mil linhas) |
| Estado e persistência | Zustand 4.5 + IndexedDB (`idb-keyval`), chave `radar-investimentos-v1`, versão de esquema 3 | `src/store/store.ts` |
| Dados de mercado (cache local) | Zustand + IndexedDB `radar-market-v1` | `src/store/market.ts` |
| Nuvem (opcional) | gist secreto, AES-GCM 256 / PBKDF2 250 mil | `src/services/cloudsync.ts` |
| Robô de dados | Node (vite-node) no GitHub Actions, 4×/dia útil + sábado | `scripts/fetch-market.ts`, `.github/workflows/deploy.yml` |
| Publicação | GitHub Pages (branch `gh-pages`) | workflow |

Não há servidor nem API própria: é um aplicativo local-first. Não existe banco relacional (tabelas, chaves estrangeiras, índices); o "banco" é um documento JSON versionado no IndexedDB. Integridade referencial é feita no código: operações apontam para `assetId`; `removeAsset` recusa ativo com lançamentos (`store.ts`).

## 2. Banco de dados e persistência

| Verificação | Resultado | Evidência |
|---|---|---|
| Livro só de inclusão (correção = estorno + novo; exclusão = estorno) | OK | `persistencia.test.ts` |
| Impressão digital contra duplicidade | **Falha corrigida** (A-02/A-04): comparava com estornados | `ledger.ts › liveFingerprints, uniqueFingerprints` |
| Gravação atômica da importação | OK por inspeção (estado restaurado em erro); falha não simulada | `opsio.ts › runImport` |
| Migração de esquema com cópia de segurança | OK (E2E) | `store.ts` (getItem grava `radar-backup-pre-v3` antes de migrar) |
| Backup/restauração | OK | `persistencia.test.ts › backup` |
| Recarga da aplicação | OK (E2E: dados permanecem após recarregar) | varredura E2E |
| Concorrência entre aparelhos | Detecção de conflito por `updatedAt` com escolha do usuário | `cloudsync.ts › push`; **não testado com dois aparelhos** |
| Operações simultâneas no mesmo aparelho | Zustand serializa as escritas; IndexedDB grava o estado inteiro a cada mudança | aceitável até dezenas de milhares de operações |

## 3. Integrações e fontes de dados

| Fonte | Obtenção | Frequência | Falha / tratamento | Classificação do dado na tela |
|---|---|---|---|---|
| B3 — proventos, eventos, classificação setorial | API pública de empresas listadas | 4×/dia útil | 3 tentativas; **tempo-limite adicionado (D-01)**; mantém o histórico anterior | REAL com selo e data |
| B3 — COTAHIST | arquivo diário oficial | idem | idem | REAL |
| CVM — DFP e Informe de FII | dados abertos (zip) | semanal | idem; cache de 7 dias com versão de esquema | REAL (ano da DFP) |
| Banco Central — SGS | API | 4×/dia útil | série anterior preservada | REAL |
| Tesouro Transparente | CSV oficial | idem | erro registrado | REAL |
| Yahoo Finance | reserva para cotação e proventos antigos | idem | marcado "estimada" | ESTIMADO |
| CoinGecko | API | idem | erro registrado | REAL |
| brapi.dev | só ativos fora da lista, com token opcional | sob demanda | — | REAL |
| RI e gestores de FII | manual, com fonte e data obrigatórias | — | — | MANUAL |

Última execução local do robô: 34 cotações, 32 calendários, 17 empresas CVM, 11 FIIs, 17 classificações B3, **0 erros**.
**Falha total do robô:** antes publicava o site sem `market-data.json`; agora republica os últimos dados válidos (D-02). Dado com mais de 7 dias aparece como "defasado" (`ui.tsx › Seal`, `DataTag`).

## 4. Qualidade do código

| Item | Resultado |
|---|---|
| Typecheck (`tsc -b --noEmit`) | sem erros (5,9 s) |
| Build de produção | sem erros |
| Testes | 127 em 20 arquivos, todos passando (43 novos da auditoria) |
| Lint | **não configurado** (Q-01) |
| Erros no console do navegador | nenhum em 21 rotas × 2 estados (vazio e com carteira) |
| Texto "NaN/undefined/Infinity" na tela | nenhum |
| Tratamento genérico de erros | `catch` silencioso só em leitura de `localStorage` (indisponível em modo privado) — aceitável |

## 5. Desempenho (`auditoria/testes/desempenho.test.ts`, 10 mil operações, 20 ativos, 11 anos)

| Etapa | Antes | Depois |
|---|---|---|
| Reconstruir posições | 55 ms | 69 ms |
| Totais, proventos, ranking, YoC | < 15 ms cada | igual |
| Rentabilidade (TWR/TIR) | 114 ms | 127 ms |
| **Histórico do YoC (tela Dividendos)** | **1.480 ms** | **43 ms** (PERF-01) |
| Validar importação de 10 mil linhas | 190 ms | — |
| Carregar cada tela no navegador | < 1 s | — |

Oportunidades restantes: o estado inteiro é recalculado a cada alteração (`store/derived.ts`, um `useMemo` único); com mais de 50 mil operações vale separar os cálculos por dependência. A gravação no IndexedDB regrava o JSON inteiro (≈ 3 MB com 10 mil operações).
