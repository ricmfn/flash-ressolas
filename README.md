# Flash Ressolas

Sistema de gestão de pedidos de ressolagem e reparo de sapatilhas de escalada,
conectado à planilha real do Google Sheets ("FLASH GESTÃO") alimentada pelo
formulário do Google Forms.

## Stack

Zero dependências de runtime (só bibliotecas nativas do Node: `node:http`,
`node:crypto`, `node:fs`, `fetch`). TypeScript compilado com `tsc`. Frontend em
TypeScript puro (sem framework), servido como PWA.

## Configuração

1. Copie `.env.example` para `.env` e preencha as variáveis (veja os comentários
   no próprio arquivo). As obrigatórias são: `GOOGLE_SERVICE_ACCOUNT_FILE` (ou
   `GOOGLE_SERVICE_ACCOUNT_JSON`), `SESSION_SECRET`, `APP_USERNAME`,
   `APP_PASSWORD_HASH`.
2. Gere o hash da senha de login:
   ```bash
   npm run build
   node -e "import('./dist/server/auth/password.js').then(m => console.log(m.hashPassword('SUA_SENHA_AQUI')))"
   ```
3. Coloque o JSON da service account em um caminho seguro (fora do controle de
   versão) e aponte `GOOGLE_SERVICE_ACCOUNT_FILE` para ele.

## Rodando

```bash
npm run build          # compila o backend (dist/) e typecheck completo
npm run build:public   # compila o frontend (src/public/js/)
npm start               # sobe o servidor (lê as variáveis de ambiente acima)
```

Em desenvolvimento: `npm run dev` (recarrega o backend automaticamente).

## Testes

```bash
npm test
```

45 testes cobrindo: conversão de moeda BR, parsing de datas BR/ISO, detecção de
status nas colunas H/I/J, escrita na coluna real (nunca fixa), a máquina de
estados do menu de status (seleção nunca salva/fecha sozinha), e sincronização
repetida sem duplicar pedidos.

## Estrutura

- `src/shared/` — lógica de negócio pura (moeda, datas, status, parsing de
  linha, resolução de coluna de escrita, dashboard), testada isoladamente e
  reaproveitada tanto pelo backend quanto pelo frontend.
- `src/server/` — servidor HTTP, cliente OAuth2/Sheets API, autenticação,
  sincronização.
- `src/public-src/` — código-fonte do frontend (compila para `src/public/js/`).
- `src/public/` — arquivos estáticos servidos (HTML, CSS, manifest, service
  worker, ícones) + o JS compilado do frontend.
- `test/` — testes automatizados (`node:test` via `tsx`).

## Segurança e regras de dados (resumo)

- Nunca escreve um range largo na planilha — sempre uma única célula por vez.
- Antes de gravar status/preço, relê a linha real da planilha e descobre a
  posição atual das colunas (a posição varia por linha — não é fixa).
- Nunca sobrescreve uma data de entrega já preenchida (só preenche
  automaticamente quando o status muda para "ENTREGUE" e a data está vazia).
- Nunca grava um preço inválido ("?", data, texto) — o backend rejeita com erro
  explícito antes de tocar na planilha.
- Credenciais nunca ficam no código-fonte — sempre via variáveis de ambiente.

## Limitações conhecidas

- **Lint**: não foi possível rodar um linter (ESLint) no ambiente onde este
  projeto foi construído, por falta de acesso à internet para instalar
  pacotes. O `tsc --noEmit` (modo `strict`) substitui parcialmente essa
  checagem, mas recomenda-se configurar ESLint antes de expandir o projeto.
- **Identidade visual**: a fonte oficial "Matech" (regular e extra-bold) está
  embutida em `src/public/fonts/` e o ícone do app usa o logo oficial em
  formato circular.
