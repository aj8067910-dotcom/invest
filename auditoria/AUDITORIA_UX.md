# Auditoria de interface e experiência

Método: varredura automatizada com navegador (Playwright/Chromium) em **21 rotas**, em três situações: aparelho vazio, carteira de teste (ações, FIIs, ETF, cripto com 8 casas, Tesouro, venda, ativo em Oportunidade de Venda) e celular (390 × 844). Para cada tela: tempo de carga, erros de JavaScript e de console, texto suspeito (NaN, undefined, Infinity, [object Object]) e transbordo horizontal. Além disso, fluxos completos testados nesta e nas etapas anteriores: lançar, corrigir com estorno, importar, mover para watchlist/venda, remover, escolha manual de aporte, registro com confirmação.

## Resultado da varredura
| Situação | Rotas | Erros JS/console | Texto suspeito | Transbordo | Carga |
|---|---|---|---|---|---|
| Vazio | 21 | 0 | 0 | 0 | < 1 s |
| Carteira de teste | 21 | 0 | 0 | 0 | < 1 s |
| Celular | 21 | 0 | 0 | 0 | — |

Rotas: Painel; Carteira (Todos, Carteira, Watchlist, Oportunidade de Venda, Metodologia); Preço-teto; Ranking; Central de aportes; Dividendos; Alocação; Concentração; Projeção; Central de Operações (Planilha, Novo lançamento, Importar, Histórico por ativo, Aportes, Revisão, Importações, Auditoria); Dados & integrações; Parâmetros.

## Pontos verificados
- **Estados vazios:** mensagens explicativas (ex.: "Nenhum ativo aqui…", "Lance compras na Central de Operações…").
- **Feedback:** avisos (toast) após salvar, mover, registrar; confirmação antes de registrar compras e antes de remover.
- **Formulários:** validação de data real, número brasileiro, motivo obrigatório para corrigir/estornar, preço de interesse exige justificativa.
- **Origem do dado:** selos REAL / MANUAL / ESTIMATIVA / PROJEÇÃO / SEM DADO e "defasado" acima de 7 dias.
- **Cores de status:** VENDER verde, AGUARDAR amarelo, NÃO VENDER vermelho; régua com ícones e texto (não depende só de cor).
- **Celular:** tabelas largas com rolagem própria; botões de abas quebram linha (corrigido em etapa anterior).

## Problemas
| ID | Prioridade | Problema | Situação |
|---|---|---|---|
| A-01 | P1 | Card "Resultado acumulado" mostrava valor errado | CORRIGIDO; o card de capital passa a dizer quando não há aportes lançados |
| PERF-01 | P2 | Tela Dividendos travava ~1,5 s com histórico grande | CORRIGIDO |
| UX-01 | P3 | Endereço com `?aba=` (ex.: `#/carteira?aba=venda`) só seleciona a aba ao abrir a tela | PENDENTE |
| UX-02 | P3 | Tabela da Central de aportes "Minha escolha" corta avisos longos (texto completo no passar do mouse) | Aceito |
| UX-03 | P3 | Filtros de classe e busca aparecem na aba Oportunidade de Venda, mas não filtram a tabela de venda | PENDENTE |

Funcionalidade visível sem implementação: **nenhuma encontrada.**
