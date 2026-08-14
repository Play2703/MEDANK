import {
  ProfessorProfile,
  ProfessorStyleAnalysis,
  ExamDNA,
  AcademicCycle,
  ClinicalCycleDNA,
  BasicCycleDNA,
} from '../../../domain/entities/Question';
import { aiOrchestrator } from '../ai_orchestrator/AIOrchestrator';
import { ragEngine } from '../../../data/services/RAGEngine';

function clamp01(val: any, defaultVal = 0.5): number {
  const num = Number(val);
  if (isNaN(num)) return defaultVal;
  return Math.min(1, Math.max(0, num));
}

function parseClinicalDNA(raw: any): ClinicalCycleDNA | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    contextoClinico: clamp01(raw.contextoClinico),
    casosLongos: clamp01(raw.casosLongos),
    pegadinhas: clamp01(raw.pegadinhas),
    epidemiologia: clamp01(raw.epidemiologia),
    farmacologia: clamp01(raw.farmacologia),
    achadosDeImagem: clamp01(raw.achadosDeImagem),
    condutaImediata: clamp01(raw.condutaImediata),
    diretrizesOficiais: clamp01(raw.diretrizesOficiais),
    comorbidadesMultiplas: clamp01(raw.comorbidadesMultiplas),
  };
}

function parseBasicDNA(raw: any): BasicCycleDNA | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    memorizacaoDireta: clamp01(raw.memorizacaoDireta),
    correlacaoAnatomoclinica: clamp01(raw.correlacaoAnatomoclinica),
    nomenclaturaTecnica: clamp01(raw.nomenclaturaTecnica),
    mecanismoFisiopatologico: clamp01(raw.mecanismoFisiopatologico),
    reconhecimentoEstrutural: clamp01(raw.reconhecimentoEstrutural),
    integracaoMultissistemica: clamp01(raw.integracaoMultissistemica),
    basesBioquimicas: clamp01(raw.basesBioquimicas),
  };
}

function averageClinicalDNA(list: ClinicalCycleDNA[]): ClinicalCycleDNA | undefined {
  if (!list || list.length === 0) return undefined;
  const n = list.length;
  return {
    contextoClinico: clamp01(list.reduce((acc, c) => acc + (c.contextoClinico ?? 0.5), 0) / n),
    casosLongos: clamp01(list.reduce((acc, c) => acc + (c.casosLongos ?? 0.5), 0) / n),
    pegadinhas: clamp01(list.reduce((acc, c) => acc + (c.pegadinhas ?? 0.5), 0) / n),
    epidemiologia: clamp01(list.reduce((acc, c) => acc + (c.epidemiologia ?? 0.5), 0) / n),
    farmacologia: clamp01(list.reduce((acc, c) => acc + (c.farmacologia ?? 0.5), 0) / n),
    achadosDeImagem: clamp01(list.reduce((acc, c) => acc + (c.achadosDeImagem ?? 0.5), 0) / n),
    condutaImediata: clamp01(list.reduce((acc, c) => acc + (c.condutaImediata ?? 0.5), 0) / n),
    diretrizesOficiais: clamp01(list.reduce((acc, c) => acc + (c.diretrizesOficiais ?? 0.5), 0) / n),
    comorbidadesMultiplas: clamp01(list.reduce((acc, c) => acc + (c.comorbidadesMultiplas ?? 0.5), 0) / n),
  };
}

function averageBasicDNA(list: BasicCycleDNA[]): BasicCycleDNA | undefined {
  if (!list || list.length === 0) return undefined;
  const n = list.length;
  return {
    memorizacaoDireta: clamp01(list.reduce((acc, b) => acc + (b.memorizacaoDireta ?? 0.5), 0) / n),
    correlacaoAnatomoclinica: clamp01(list.reduce((acc, b) => acc + (b.correlacaoAnatomoclinica ?? 0.5), 0) / n),
    nomenclaturaTecnica: clamp01(list.reduce((acc, b) => acc + (b.nomenclaturaTecnica ?? 0.5), 0) / n),
    mecanismoFisiopatologico: clamp01(list.reduce((acc, b) => acc + (b.mecanismoFisiopatologico ?? 0.5), 0) / n),
    reconhecimentoEstrutural: clamp01(list.reduce((acc, b) => acc + (b.reconhecimentoEstrutural ?? 0.5), 0) / n),
    integracaoMultissistemica: clamp01(list.reduce((acc, b) => acc + (b.integracaoMultissistemica ?? 0.5), 0) / n),
    basesBioquimicas: clamp01(list.reduce((acc, b) => acc + (b.basesBioquimicas ?? 0.5), 0) / n),
  };
}

function chunkExcerpts(excerpts: string[], maxChunkSize = 3500): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const excerpt of excerpts) {
    if ((current + '\n\n' + excerpt).length > maxChunkSize) {
      if (current.trim()) chunks.push(current.trim());
      current = excerpt;
    } else {
      current = current ? `${current}\n\n${excerpt}` : excerpt;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function calculateMovingAverageDNA(
  existingDNA: ExamDNA | undefined,
  newCiclo: AcademicCycle,
  newClinico?: ClinicalCycleDNA,
  newBasico?: BasicCycleDNA
): ExamDNA {
  const now = new Date().toISOString();

  if (!existingDNA || !existingDNA.version || existingDNA.version < 1) {
    return {
      cicloAcademico: newCiclo,
      clinico: newClinico,
      basico: newBasico,
      version: 1,
      updatedAt: now,
    };
  }

  const prevVer = existingDNA.version;
  const nextVer = prevVer + 1;

  let finalCiclo: AcademicCycle = newCiclo;
  if (existingDNA.cicloAcademico !== newCiclo) {
    finalCiclo = 'misto';
  } else {
    finalCiclo = existingDNA.cicloAcademico;
  }

  let mergedClinico: ClinicalCycleDNA | undefined = undefined;
  if (existingDNA.clinico && newClinico) {
    mergedClinico = {
      contextoClinico: (existingDNA.clinico.contextoClinico * prevVer + newClinico.contextoClinico) / nextVer,
      casosLongos: (existingDNA.clinico.casosLongos * prevVer + newClinico.casosLongos) / nextVer,
      pegadinhas: (existingDNA.clinico.pegadinhas * prevVer + newClinico.pegadinhas) / nextVer,
      epidemiologia: (existingDNA.clinico.epidemiologia * prevVer + newClinico.epidemiologia) / nextVer,
      farmacologia: (existingDNA.clinico.farmacologia * prevVer + newClinico.farmacologia) / nextVer,
      achadosDeImagem: (existingDNA.clinico.achadosDeImagem * prevVer + newClinico.achadosDeImagem) / nextVer,
      condutaImediata: (existingDNA.clinico.condutaImediata * prevVer + newClinico.condutaImediata) / nextVer,
      diretrizesOficiais: (existingDNA.clinico.diretrizesOficiais * prevVer + newClinico.diretrizesOficiais) / nextVer,
      comorbidadesMultiplas: (existingDNA.clinico.comorbidadesMultiplas * prevVer + newClinico.comorbidadesMultiplas) / nextVer,
    };
  } else if (newClinico) {
    mergedClinico = newClinico;
  } else if (existingDNA.clinico) {
    mergedClinico = existingDNA.clinico;
  }

  let mergedBasico: BasicCycleDNA | undefined = undefined;
  if (existingDNA.basico && newBasico) {
    mergedBasico = {
      memorizacaoDireta: (existingDNA.basico.memorizacaoDireta * prevVer + newBasico.memorizacaoDireta) / nextVer,
      correlacaoAnatomoclinica: (existingDNA.basico.correlacaoAnatomoclinica * prevVer + newBasico.correlacaoAnatomoclinica) / nextVer,
      nomenclaturaTecnica: (existingDNA.basico.nomenclaturaTecnica * prevVer + newBasico.nomenclaturaTecnica) / nextVer,
      mecanismoFisiopatologico: (existingDNA.basico.mecanismoFisiopatologico * prevVer + newBasico.mecanismoFisiopatologico) / nextVer,
      reconhecimentoEstrutural: (existingDNA.basico.reconhecimentoEstrutural * prevVer + newBasico.reconhecimentoEstrutural) / nextVer,
      integracaoMultissistemica: (existingDNA.basico.integracaoMultissistemica * prevVer + newBasico.integracaoMultissistemica) / nextVer,
      basesBioquimicas: (existingDNA.basico.basesBioquimicas * prevVer + newBasico.basesBioquimicas) / nextVer,
    };
  } else if (newBasico) {
    mergedBasico = newBasico;
  } else if (existingDNA.basico) {
    mergedBasico = existingDNA.basico;
  }

  return {
    cicloAcademico: finalCiclo,
    clinico: mergedClinico,
    basico: mergedBasico,
    version: nextVer,
    updatedAt: now,
  };
}

/**
 * Classifica determinísticamente o ciclo acadêmico (básico, clínico ou misto)
 * utilizando extração de entidades médicas por categorias DeCS/MeSH/CID-10 sem depender da IA.
 */
export async function classifyAcademicCycleDeterministically(blockText: string): Promise<{
  ciclo: AcademicCycle;
  counts: Record<string, number>;
  ratios: { clinicoRatio: number; basicoRatio: number };
}> {
  const counts: Record<string, number> = {
    DOENCA: 0,
    MEDICAMENTO: 0,
    PROCEDIMENTO: 0,
    SINTOMA: 0,
    ESTRUTURA_ANATOMICA: 0,
    EXAME: 0,
    OUTROS: 0,
  };

  if (!blockText || blockText.trim().length < 15) {
    return { ciclo: 'misto', counts, ratios: { clinicoRatio: 0.5, basicoRatio: 0.5 } };
  }

  try {
    let entities: Array<{ category?: string }> = [];

    // Se estiver em ambiente Node (testes, server, seed)
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      try {
        const { dictionaryNEREngine } = await import('../../ner/DictionaryNEREngine');
        entities = dictionaryNEREngine.extractEntities(blockText);
      } catch {
        // Fallback via API
      }
    }



    if (entities.length === 0 && typeof fetch !== 'undefined') {
      try {
        const { apiUrl } = await import('../../../lib/apiBaseUrl');
        const res = await fetch(apiUrl('/api/extract-entities'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: [blockText] }),
        });
        if (res.ok) {
          const data = await res.json();
          entities = data.entities || (data.results && data.results[0]?.entities) || [];
        }
      } catch {}
    }

    for (const ent of entities) {
      const cat = (ent.category || '').toUpperCase();
      if (cat.includes('DOENCA') || cat.includes('DISEASE') || cat.includes('PATOLOGIA')) {
        counts.DOENCA++;
      } else if (cat.includes('MEDICAMENTO') || cat.includes('FARMACO') || cat.includes('DRUG')) {
        counts.MEDICAMENTO++;
      } else if (cat.includes('PROCEDIMENTO') || cat.includes('CONDUTA') || cat.includes('CIRURGIA')) {
        counts.PROCEDIMENTO++;
      } else if (cat.includes('SINTOMA') || cat.includes('SINAL')) {
        counts.SINTOMA++;
      } else if (cat.includes('ANATOM') || cat.includes('ESTRUTURA')) {
        counts.ESTRUTURA_ANATOMICA++;
      } else if (cat.includes('EXAME') || cat.includes('DIAGNOSTICO_LAB')) {
        counts.EXAME++;
      } else {
        counts.OUTROS++;
      }
    }

    const clinicoTotal = counts.DOENCA + counts.MEDICAMENTO + counts.PROCEDIMENTO + counts.SINTOMA;
    const basicoTotal = counts.ESTRUTURA_ANATOMICA + counts.EXAME;
    const totalRecognized = clinicoTotal + basicoTotal;

    if (totalRecognized < 5) {
      return { ciclo: 'misto', counts, ratios: { clinicoRatio: 0.5, basicoRatio: 0.5 } };
    }

    const clinicoRatio = clinicoTotal / totalRecognized;
    const basicoRatio = basicoTotal / totalRecognized;

    let ciclo: AcademicCycle = 'misto';
    if (clinicoRatio >= 0.65) {
      ciclo = 'clinico';
    } else if (basicoRatio >= 0.65) {
      ciclo = 'basico';
    }

    return { ciclo, counts, ratios: { clinicoRatio, basicoRatio } };
  } catch (err) {
    console.warn('[ProfessorEngine] Deterministic cycle extraction error:', err);
    return { ciclo: 'misto', counts, ratios: { clinicoRatio: 0, basicoRatio: 0 } };
  }
}

export class ProfessorEngine {
  private static instance: ProfessorEngine;

  private constructor() {}

  public static getInstance(): ProfessorEngine {
    if (!ProfessorEngine.instance) {
      ProfessorEngine.instance = new ProfessorEngine();
    }
    return ProfessorEngine.instance;
  }

  private async analyzeSingleBlock(
    blockText: string,
    profName: string
  ): Promise<{
    ciclo: AcademicCycle;
    clinico?: ClinicalCycleDNA;
    basico?: BasicCycleDNA;
    temas: string[];
    estilo: string;
    nivel: string;
    pegadinhas: string[];
    resumo: string;
  } | null> {
    // 1. Executa classificação determinística do ciclo acadêmico via NER local / categorias DeCS
    const deterministicCycleResult = await classifyAcademicCycleDeterministically(blockText);
    const deterministicCiclo = deterministicCycleResult.ciclo;

    const prompt = `Você é um psicometrista sênior especializado em bancas examinadoras de provas de residência e revalidação médica.
Analise com rigor este bloco de acervo do professor/banca "${profName}":

DOCUMENTOS E EXTRATOS DE PROVAS ANTERIORES:
${blockText || 'Informações gerais de bancas de provas médicas.'}

Calcule os pesos de DNA psicométrico (valores numéricos entre 0.0 e 1.0) para os eixos clínicos e básicos.

Retorne EXCLUSIVAMENTE um objeto JSON VÁLIDO no seguinte formato exato (sem markdown extra, sem explicações fora do JSON):
{
  "temasFavoritos": ["Tópico Principal 1", "Tópico Principal 2", "Tópico Principal 3"],
  "estiloDeQuestao": "Descrição técnica sucinta da estrutura típica de questão",
  "nivelCognitivo": "Análise da profundidade cobrada",
  "pegadinhasRecorrentes": ["Padrão de armadilha 1", "Padrão de armadilha 2"],
  "resumoEstiloGeral": "Síntese clara em 2 a 3 frases sobre o perfil deste examinador.",
  "examDNA": {
    "clinico": {
      "contextoClinico": 0.8,
      "casosLongos": 0.7,
      "pegadinhas": 0.5,
      "epidemiologia": 0.4,
      "farmacologia": 0.6,
      "achadosDeImagem": 0.3,
      "condutaImediata": 0.8,
      "diretrizesOficiais": 0.7,
      "comorbidadesMultiplas": 0.4
    },
    "basico": {
      "memorizacaoDireta": 0.4,
      "correlacaoAnatomoclinica": 0.6,
      "nomenclaturaTecnica": 0.7,
      "mecanismoFisiopatologico": 0.8,
      "reconhecimentoEstrutural": 0.5,
      "integracaoMultissistemica": 0.5,
      "basesBioquimicas": 0.4
    }
  }
}`;

    try {
      const aiRes = await aiOrchestrator.generateContent({
        prompt,
        temperature: 0.3,
      });

      const rawText = aiRes?.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const rawCiclo = String(parsed.cicloAcademico || parsed.examDNA?.cicloAcademico || 'clinico').toLowerCase();
        const aiCiclo: AcademicCycle = rawCiclo === 'basico' || rawCiclo === 'misto' ? rawCiclo : 'clinico';

        // O ciclo acadêmico salvo é estritamente o determinado de forma determinística
        const validCiclo: AcademicCycle = deterministicCiclo;

        const rawDNAObj = parsed.examDNA || parsed;
        const newClinico = (validCiclo === 'clinico' || validCiclo === 'misto') ? parseClinicalDNA(rawDNAObj.clinico) : undefined;
        const newBasico = (validCiclo === 'basico' || validCiclo === 'misto') ? parseBasicDNA(rawDNAObj.basico) : undefined;

        console.debug(
          `[ProfessorEngine] Ciclo Acadêmico determinístico: "${validCiclo}" (IA sugeriu: "${aiCiclo}", contagens: ${JSON.stringify(
            deterministicCycleResult.counts
          )})`
        );

        return {
          ciclo: validCiclo,
          clinico: newClinico,
          basico: newBasico,
          temas: Array.isArray(parsed.temasFavoritos) ? parsed.temasFavoritos : [],
          estilo: parsed.estiloDeQuestao || '',
          nivel: parsed.nivelCognitivo || '',
          pegadinhas: Array.isArray(parsed.pegadinhasRecorrentes) ? parsed.pegadinhasRecorrentes : [],
          resumo: parsed.resumoEstiloGeral || '',
        };
      }
    } catch (err) {
      console.warn('[ProfessorEngine] AI block analysis error:', err);
    }
    return null;
  }

  /**
   * Analyzes the real exam elaboration style of a professor or exam board (banca)
   * using their imported documents and RAG chunks, calculating both qualitative style
   * and quantitative ExamDNA (with multi-block fragmented vector averaging).
   */
  public async analyzeProfessorStyle(
    profileOrName: ProfessorProfile | string,
    extraContext?: string
  ): Promise<ProfessorStyleAnalysis> {
    const profName = typeof profileOrName === 'string' ? profileOrName : profileOrName.name;
    const profile = typeof profileOrName === 'object' ? profileOrName : undefined;
    const documents = profile?.documents || [];
    const previousDNA = profile?.examDNA || profile?.styleAnalysis?.examDNA;

    // 1. Gather text context from profile imported documents
    const docExcerpts: string[] = [];

    if (extraContext && extraContext.trim()) {
      docExcerpts.push(`[Texto da Prova/Exame Fornecido]:\n${extraContext.trim()}`);
    }

    for (const doc of documents) {
      if (doc.extractedExcerpt) {
        docExcerpts.push(`[Documento: ${doc.fileName}]\n${doc.extractedExcerpt}`);
      } else {
        docExcerpts.push(`[Documento: ${doc.fileName}]`);
      }
    }

    // 2. Retrieve RAG chunks for this professor/banca from vector store
    try {
      const ragChunks = await ragEngine.retrieveContext(profName, {
        professor: profName,
        banca: profName,
        topK: 15,
      });

      for (const chunk of ragChunks) {
        const textStr = typeof chunk === 'string' ? chunk : (chunk as any).content || '';
        if (textStr) {
          docExcerpts.push(`[Trecho RAG]: ${textStr}`);
        }
      }
    } catch (err) {
      console.warn('[ProfessorEngine] RAG retrieval warning during style analysis:', err);
    }

    // 3. Check total context length for fragmentation decision
    const totalLength = docExcerpts.reduce((sum, s) => sum + s.length, 0);

    const blocks = totalLength > 4000 ? chunkExcerpts(docExcerpts, 3500) : [docExcerpts.join('\n\n').slice(0, 12000)];

    const blockResults: Array<{
      ciclo: AcademicCycle;
      clinico?: ClinicalCycleDNA;
      basico?: BasicCycleDNA;
      temas: string[];
      estilo: string;
      nivel: string;
      pegadinhas: string[];
      resumo: string;
    }> = [];

    for (const blockText of blocks) {
      const res = await this.analyzeSingleBlock(blockText, profName);
      if (res) blockResults.push(res);
    }

    if (blockResults.length > 0) {
      const clinicosList = blockResults.map((r) => r.clinico).filter((c): c is ClinicalCycleDNA => !!c);
      const basicosList = blockResults.map((r) => r.basico).filter((b): b is BasicCycleDNA => !!b);

      const avgClinico = averageClinicalDNA(clinicosList);
      const avgBasico = averageBasicDNA(basicosList);

      const cicloCount: Record<AcademicCycle, number> = { clinico: 0, basico: 0, misto: 0 };
      blockResults.forEach((r) => cicloCount[r.ciclo]++);

      let finalCiclo: AcademicCycle = 'clinico';
      if (cicloCount.misto > 0 || (cicloCount.clinico > 0 && cicloCount.basico > 0)) {
        finalCiclo = 'misto';
      } else if (cicloCount.basico > cicloCount.clinico) {
        finalCiclo = 'basico';
      }

      const calculatedDNA = calculateMovingAverageDNA(previousDNA, finalCiclo, avgClinico, avgBasico);

      const temasSet = new Set<string>();
      const pegadinhasSet = new Set<string>();

      blockResults.forEach((r) => {
        r.temas.forEach((t) => temasSet.add(t));
        r.pegadinhas.forEach((p) => pegadinhasSet.add(p));
      });

      const temasFavoritos = Array.from(temasSet);
      const pegadinhasRecorrentes = Array.from(pegadinhasSet);

      const firstValidEstilo = blockResults.find((r) => r.estilo)?.estilo || 'Vinhetas clínicas objetivas com foco em tomada de conduta.';
      const firstValidNivel = blockResults.find((r) => r.nivel)?.nivel || 'Aplicação prática de diretrizes e raciocínio clínico.';
      const firstValidResumo = blockResults.find((r) => r.resumo)?.resumo || `Examinador focado na aplicação prática de diretrizes oficiais para ${profName}.`;

      return {
        temasFavoritos: temasFavoritos.length > 0 ? temasFavoritos : ['Diretrizes Médicas', 'Casos Clínicos'],
        estiloDeQuestao: firstValidEstilo,
        nivelCognitivo: firstValidNivel,
        pegadinhasRecorrentes: pegadinhasRecorrentes.length > 0 ? pegadinhasRecorrentes : ['Falsos sinônimos em distratores', 'Valores limítrofes em exames'],
        resumoEstiloGeral: firstValidResumo,
        examDNA: calculatedDNA,
        analyzedAt: new Date().toISOString(),
      };
    }

    // Fallback if AI calls fail
    const fallbackCiclo: AcademicCycle = 'clinico';
    const fallbackClinico: ClinicalCycleDNA = {
      contextoClinico: 0.7,
      casosLongos: 0.5,
      pegadinhas: 0.5,
      epidemiologia: 0.4,
      farmacologia: 0.5,
      achadosDeImagem: 0.3,
      condutaImediata: 0.7,
      diretrizesOficiais: 0.6,
      comorbidadesMultiplas: 0.4,
    };

    const fallbackDNA = calculateMovingAverageDNA(previousDNA, fallbackCiclo, fallbackClinico, undefined);

    return {
      temasFavoritos: documents.length > 0 ? documents.map((d) => d.fileName.replace(/\.[^/.]+$/, '')) : ['Medicina Geral'],
      estiloDeQuestao: 'Casos clínicos fundamentados em diretrizes oficiais.',
      nivelCognitivo: 'Raciocínio diagnóstico e tomada de decisão.',
      pegadinhasRecorrentes: ['Condutas com contraindicações relativas', 'Valores laboratoriais atípicos'],
      resumoEstiloGeral: `Perfil de cobrança baseado no acervo importado para ${profName}.`,
      examDNA: fallbackDNA,
      analyzedAt: new Date().toISOString(),
    };
  }
}

export const professorEngine = ProfessorEngine.getInstance();
