<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0db7e3d0-924f-47ca-b1dc-9fd2fe77aa1c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy / Build

```bash
npm ci
npm run build   # resolve LFS assets → vite build → esbuild server
npm start
```

**Não** use `apt-get install git-lfs` no comando de build. Builders gerenciados
(Render, entre outros) têm o APT em filesystem somente-leitura e o deploy quebra
logo na primeira linha:

```
E: List directory /var/lib/apt/lists/partial is missing. - Acquire (30: Read-only file system)
```

O único arquivo em Git LFS (`public/seed-data/document-embeddings.json`, ~158 MB)
é resolvido por [`scripts/fetch-lfs-assets.mjs`](scripts/fetch-lfs-assets.mjs) —
Node puro, sem dependências e sem o binário `git-lfs`. Ele roda automaticamente
no `npm run build` e **nunca derruba o build**: se o download falhar, o app segue
funcionando (catálogo, entidades e grafo carregam normalmente; só a busca
semântica/híbrida fica vazia). Veja
[`scripts/seed-source/RECUPERAR-EMBEDDINGS.md`](scripts/seed-source/RECUPERAR-EMBEDDINGS.md)
para as flags `SKIP_LFS_FETCH`, `LFS_STRICT` e `GITHUB_TOKEN`.
