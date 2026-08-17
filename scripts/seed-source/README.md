# Seed Source Directory

Coloque nesta pasta os arquivos brutos de referência médica (PDF, TXT, MD) que farão parte do pacote inicial (Starter Pack) do MedAnki.

## Formato do `manifest.json`

Crie um arquivo `manifest.json` ao lado dos arquivos fonte com a seguinte estrutura:

```json
[
  {
    "file": "exemplo.pdf",
    "title": "Apostila de Endocrinologia - Diabetes Mellitus",
    "category": "Apostila",
    "discipline": "Endocrinologia",
    "specialty": "Endocrinologia",
    "author": "MedAnki Editorial",
    "board": "REVALIDA",
    "professor": "Prof. Silva",
    "year": 2026
  }
]
```

## Provas de Residência e o Segmentador Mecânico (Splitter)

> [!IMPORTANT]
> **Arquivos categorizados como prova (`residencyExam` ou `professorExam`):**
> Para que o **Exam PDF Question Splitter** funcione com precisão milimétrica por análise geométrica de layout (colunas, posições e gabaritos sem IA), o arquivo PDF original precisa estar presente fisicamente nesta pasta (`scripts/seed-source/`) durante o build do seed (`npm run seed:build`), ou ser reenviado pelo usuário na interface do Developer Console / Importação.
> 
> Apenas o texto plano extraído não preserva as coordenadas espaciais necessárias para a segmentação de colunas e mapeamento do gabarito oficial. O script de build copia os PDFs de provas para `public/seed-data/raw-exams/` e o `SeedLoaderService` persiste esses binários diretamente na tabela IndexedDB `knowledgeAssetFiles`.

Após adicionar os arquivos e preencher o `manifest.json`, execute:

```bash
npm run seed:build
```

