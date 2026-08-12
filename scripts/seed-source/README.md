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

Após adicionar os arquivos e preencher o `manifest.json`, execute:

```bash
npm run seed:build
```
