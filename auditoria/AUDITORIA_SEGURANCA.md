# Auditoria de segurança

Escopo: revisão do código e das dependências. Nenhum teste destrutivo nem tentativa de acesso a sistemas externos.

## Superfície
- Site estático no GitHub Pages; sem servidor, sem login, sem API própria. Não há SQL (sem risco de SQL Injection) nem sessão no servidor (CSRF não se aplica).
- Dados financeiros ficam no navegador (IndexedDB) e, se você ativar, num gist **secreto** criptografado no navegador (AES-GCM 256, PBKDF2-SHA256 250 mil iterações) — `src/services/cloudsync.ts`.
- O repositório é **público**: código, lista de ativos de exemplo e dados de mercado são visíveis.

## Achados

| ID | Severidade | Achado | Situação |
|---|---|---|---|
| S-01 | **Alta (P1)** | Token do GitHub (permissão gist) **e a senha de criptografia** guardados em texto claro no `localStorage` (`radar-cloud-config`). Quem tiver acesso ao navegador lê os dois e decifra todos os dados. | **CORRIGIDO**: token cifrado com chave não-exportável do aparelho; senha pedida ao abrir, ou guardada cifrada só se você marcar "Lembrar neste aparelho" |
| SEC-02 | Alta → Moderada | react-router-dom 6.28: redirecionamento aberto/XSS via caminhos não confiáveis (GHSA-2w69-qvjg-hvjx, CVE-2025-6847). O app só usa links internos com HashRouter, exploração improvável. | CORRIGIDO para 6.30.6 (os avisos *high* sumiram); 1 aviso *moderate* exige a versão 7 |
| SEC-03 | Moderada (dev) | vite/esbuild/vitest/tinypool: falhas que exigem o servidor de desenvolvimento ou a interface do Vitest abertos. Não vão para o site publicado. | PENDENTE — atualização *major* (vite 8, vitest 5) |
| SEC-04 | Baixa | Sem Content-Security-Policy. React escapa todo texto e não há `innerHTML`, `eval` nem `dangerouslySetInnerHTML` no código. | PENDENTE — recomendada uma CSP restrita às fontes usadas |
| SEC-05 | Baixa (LGPD) | Lista de tickers da sua carteira e watchlist aparece no repositório público (`src/domain/seed.ts`, `market/tickers.json`, README). Sem quantidades, valores nem dados pessoais. | PENDENTE — decisão sua (repositório privado ou lista sem tickers reais) |
| SEC-06 | Baixa | Alerta de venda em gist secreto: não listado, mas legível por quem tiver o link (contém tickers, status e preços por ação; sem quantidades nem valores). | Aceito na metodologia aprovada |
| SEC-07 | Informativa | Arquivos importados: SheetJS 0.20.3 (versão corrigida das falhas de 0.18/0.19 — poluição de protótipo e ReDoS). Dados importados só viram texto na tela. | OK |
| SEC-08 | Informativa | Exportação CSV de texto digitado por você pode conter fórmula (=, +, @) ao abrir no Excel. Risco só com dados de terceiros. | Aceito (dados próprios) |

## LGPD
- Não há coleta de dados pessoais por servidor: tudo fica no aparelho e, opcionalmente, criptografado na sua conta do GitHub.
- O e-mail do resumo diário é enviado pela tarefa agendada da sua conta Claude; o arquivo de alerta não tem valores financeiros.
- Risco residual: SEC-05 (tickers públicos). S-01 corrigido; quem consegue executar código na própria página ainda pode usar a chave do aparelho (limite inerente a um app sem servidor).

## Recomendações, em ordem
1. ~~Resolver S-01~~ (feito).
2. Token do GitHub com validade de 90 dias e só a permissão "gist".
3. CSP no `index.html` limitada a: o próprio site, api.github.com, gist.githubusercontent.com, api.bcb.gov.br, brapi.dev, api.coingecko.com, fonts.googleapis.com/fonts.gstatic.com.
4. Atualizar vite/vitest numa janela própria (versões *major*).
5. Decidir sobre a visibilidade do repositório.
