# Fonte de Dados DeCS / MeSH (BIREME)

Diretório para armazenamento dos arquivos de origem da base DeCS (Descritores em Ciências da Saúde - BIREME-OPAS/OMS).

## Instruções de Download e Atualização

Configure as variáveis de ambiente em `.env` (arquivo ignorado no Git):

```ini
DECS_API_TOKEN=...
DECS_API_BASE=https://api.bvsalud.org/decs/v2
DECS_FTP_HOST=ftp.bireme.br
DECS_FTP_USER=decs_pt
DECS_FTP_PASS=...
DECS_FTP_FILE=decs_portugues_2026.tgz
```

Para rodar o download e a mesclagem automática no dicionário local:

```bash
npm run dict:import-decs
```
