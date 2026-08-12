# Recuperar `public/seed-data/document-embeddings.json` (158 MB)

## Por que isso é necessário
`public/seed-data/document-embeddings.json` está versionado no Git como um
**ponteiro do Git LFS** (apenas ~134 bytes: `version https://git-lfs...`).
O arquivo real de embeddings (≈158 MB, 11.727 vetores 384d) NÃO vem no
`git clone`/`checkout` comum — só o ponteiro vem.

Consequência: sem o arquivo real, a **busca semântica/híbrida** retorna vazio.
A listagem dos 14 arquivos-base no Developer Console, porém, **já funciona**
mesmo com o ponteiro, graças ao ajuste tolerante em `SeedLoaderService`
(que pula embeddings ausentes e ainda assim carrega o catálogo).

Ou seja:
- Quer só ver os 14 arquivos no Developer Console? **Nenhuma ação necessária.**
- Quer que a busca semântica/híbrida retorne conteúdo desses arquivos?
  **Recupere o arquivo real** (opções abaixo).

---

## Opção A — `git lfs pull` (mais simples, se você tem Git LFS)

1. Instale o Git LFS (se ainda não tiver):
   ```bash
   # Debian/Ubuntu
   sudo apt-get install git-lfs
   # macOS
   brew install git-lfs
   # Em seguida, uma vez por máquina:
   git lfs install
   ```
2. Na raiz do projeto, puxe os objetos LFS:
   ```bash
   git lfs pull
   # ou só este arquivo:
   git lfs pull --include="public/seed-data/document-embeddings.json"
   ```
3. Confirme que não é mais um ponteiro:
   ```bash
   head -c 40 public/seed-data/document-embeddings.json
   # Deve começar com '[' (JSON), NÃO com 'version https://git-lfs'
   ```

## Opção B — Regenerar via `npm run seed:build` (sem depender do LFS)

Os embeddings são gerados **localmente** (`transformers.js`, 384d) pelo
`scripts/build-seed-bundle.ts` — não dependem de Gemini.

1. Coloque os 14 PDFs em `scripts/seed-source/` **exatamente com os nomes do
   `scripts/seed-source/manifest.json`** (esses PDFs NÃO estão no repo; copie
   da sua máquina/original).
2. Rode o build:
   ```bash
   npm run seed:build
   ```
   Isso regenera toda a pasta `public/seed-data/`, incluindo o
   `document-embeddings.json` real (158 MB). Pode demorar (≈11.727 chunks).
3. Confirme o tamanho do arquivo:
   ```bash
   ls -lh public/seed-data/document-embeddings.json
   # Esperado: ~150 MB, não 134 bytes
   ```

---

## Depois de recuperar o arquivo real

O carregamento do seed só roda quando `db.knowledgeAssets` está vazio OU o flag
`MEDANKI_SEED_LOADED_VERSION` no `localStorage` não está definido. Se você já
abriu o app antes (com o ponteiro), o seed pode já ter sido marcado como
"carregado" sem os embeddings. Para forçar o recarregamento completo:

- No navegador (DevTools → Application → Local Storage), remova a chave
  `MEDANKI_SEED_LOADED_VERSION`; ou
- Use a opção "Resetar para o Seed" / "Restaurar dados iniciais" no Developer
  Console (aba Fontes & Conteúdo / Biblioteca), se disponível.

Ao reabrir o app, o `SeedLoaderService` populará `documentEmbeddings` e a busca
semântica/híbrida passará a retornar os trechos dos 14 arquivos.
