# Seed Data & Espaço Vetorial Local (MedAnki)

Este diretório contém os arquivos estáticos de inicialização offline (Seed Data) utilizados pelo MEDANK.

## Arquitetura de Embeddings e Busca Semântica

Para garantir comparabilidade vetorial precisa e buscas offline sem latência de rede, **tanto os documentos indexados no seed bundle quanto as buscas em tempo real utilizam o mesmo modelo e o mesmo espaço vetorial**.

### 1. Modelo de Embedding
- **Modelo:** `Xenova/multilingual-e5-small` (ONNX quantizado em Int8 via `transformers.js`)
- **Dimensionalidade:** `384` dimensões
- **Versão do Esquema:** `local-e5-small-v1`
- **Tamanho aproximado do modelo:** ~90MB (carregado via cache do navegador / CDN)

### 2. Padrão Assimétrico do Modelo E5
O modelo E5 é treinado para recuperação assimétrica (asymmetric semantic search), exigindo prefixos específicos para diferenciar documentos de consultas:
- **Indexação de Documentos / Chunks:** Precedido pelo prefixo `passage: `
  - Exemplo: `passage: O paciente apresentou insuficiência cardíaca congestiva com dispneia paroxística noturna.`
- **Consultas de Busca (Queries) em Tempo Real:** Precedido pelo prefixo `query: `
  - Exemplo: `query: insuficiência cardíaca tratamento`

### 3. Pipeline de Geração (`scripts/build-seed-bundle.ts`)
1. Os documentos de `scripts/seed-source/` são segmentados em chunks semânticos.
2. Cada chunk é vetorizado pelo `LocalEmbeddingClient` utilizando o modelo `Xenova/multilingual-e5-small` (384d, prefixo `passage: `).
3. Os vetores gerados são persistidos em `public/seed-data/document-embeddings.json` (e compactados em `.json.gz`).
4. Ao realizar buscas na interface, o Web Worker (`ner.worker.ts`) e o `NERWorkerClient.searchByText` convertem o texto da busca com `query: ` e calculam a similaridade de cossenos (`cosineSimilarity`) diretamente no mesmo espaço vetorial de 384 dimensões.
