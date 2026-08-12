# Dicionário Terminológico Médico (NER)

Este diretório contém o dicionário terminológico utilizado pelo motor local e determinístico de Reconhecimento de Entidades Nomeadas (NER) e Extração de Relações Clínicas (`DictionaryNEREngine.ts`).

## Diretrizes de Expansão

Este dicionário (`medicalTerminologyPt.json`) contém **13.980 termos principais / 48.978 com sinônimos** (após importação oficial da CID-10 DATASUS V2008 realizada em 12/08/2026) cobrindo 6 categorias clínicas (`DOENCA`, `MEDICAMENTO`, `SINTOMA`, `ESTRUTURA_ANATOMICA`, `EXAME`, `PROCEDIMENTO`).

> [!IMPORTANT]
> **Regra de Manutenção do Dicionário:** Ao expandir o dicionário, sempre **ADICIONAR** ao conjunto existente. Nunca substituir ou remover termos sem aprovação explícita, pois cada termo representa uma decisão de cobertura conferida deliberadamente.

## Histórico de Importações

- **12/08/2026**: Importação da **CID-10 (Classificação Internacional de Doenças, Versão DATASUS V2008)** a partir do arquivo `CID-10-SUBCATEGORIAS.CSV`. Foram importadas 12.155 novas entidades clínicas da categoria `DOENCA` (296 subcategorias já existentes no dicionário foram preservadas/puladas). Cada entrada inclui o código CID (ex: `E10.1`) e sinônimos como atalhos de busca.

## Fontes para Expansão Futura

Novas expansões devem ser agregadas utilizando fontes oficiais públicas:

1. **DeCS/MeSH em Português (BIREME)**: [https://decs.bvsalud.org](https://decs.bvsalud.org)
2. **CID-10 em Português (DATASUS)**: Tabelas públicas da Classificação Internacional de Doenças (V2008 importada).
3. **Lista de Medicamentos Registrados (ANVISA)**: Tabelas públicas de princípios ativos e medicamentos registrados.

## Schema de Importação

Qualquer conjunto de dados importado ou expandido deve seguir rigorosamente a estrutura do arquivo `medicalTerminologyPt.json`:

```json
[
  {
    "term": "termo canônico",
    "category": "DOENCA | MEDICAMENTO | SINTOMA | ESTRUTURA_ANATOMICA | EXAME | PROCEDIMENTO",
    "synonyms": ["sinônimo 1", "sinônimo 2", "sigla"]
  }
]
```
