# Dicionário Terminológico Médico (NER)

Este diretório contém o dicionário terminológico utilizado pelo motor local e determinístico de Reconhecimento de Entidades Nomeadas (NER) e Extração de Relações Clínicas (`DictionaryNEREngine.ts`).

## Diretrizes de Expansão

Este dicionário (`medicalTerminologyPt.json`) contém **36.099 termos principais / 134.656 com sinônimos** (após importações oficiais da CID-10 DATASUS e DeCS/MeSH BIREME 2026) cobrindo 6 categorias clínicas (`DOENCA`, `MEDICAMENTO`, `SINTOMA`, `ESTRUTURA_ANATOMICA`, `EXAME`, `PROCEDIMENTO`).

> [!IMPORTANT]
> **Regra de Manutenção do Dicionário:** Ao expandir o dicionário, sempre **ADICIONAR** ao conjunto existente. Nunca substituir ou remover termos sem aprovação explícita, pois cada termo representa uma decisão de cobertura conferida deliberadamente.

## Histórico de Importações

- **13/08/2026**: Importação da fonte **DeCS (Descritores em Ciências da Saúde / BIREME-OPAS/OMS, edição 2026 em Português)**. Foram processados 23.084 descritores clínicos: 965 entidades existentes foram enriquecidas com códigos DeCS/MeSH e novos sinônimos, e 22.119 novas entidades clínicas foram incorporadas cobrindo medicamentos, anatomia, exames, procedimentos e sintomas.
- **12/08/2026**: Importação da **CID-10 (Classificação Internacional de Doenças, Versão DATASUS V2008)** a partir do arquivo `CID-10-SUBCATEGORIAS.CSV`. Foram importadas 12.155 novas entidades clínicas da categoria `DOENCA` (296 subcategorias já existentes no dicionário foram preservadas/puladas).

## Fontes para Expansão Futura

Novas expansões devem ser agregadas utilizando fontes oficiais públicas:

1. **DeCS/MeSH em Português (BIREME)**: [https://decs.bvsalud.org](https://decs.bvsalud.org) (Edição 2026 importada via `npm run dict:import-decs`).
2. **CID-10 em Português (DATASUS)**: Tabelas públicas da Classificação Internacional de Doenças (V2008 importada).
3. **Lista de Medicamentos Registrados (ANVISA)**: Tabelas públicas de princípios ativos e medicamentos registrados.

## Schema de Importação

Qualquer conjunto de dados importado ou expandido deve seguir rigorosamente a estrutura do arquivo `medicalTerminologyPt.json`:

```json
[
  {
    "term": "termo canônico",
    "category": "DOENCA | MEDICAMENTO | SINTOMA | ESTRUTURA_ANATOMICA | EXAME | PROCEDIMENTO",
    "synonyms": ["sinônimo 1", "sinônimo 2", "sigla"],
    "codes": [
      { "system": "DeCS", "code": "D006973" },
      { "system": "MeSH", "code": "D006973" }
    ]
  }
]
```
