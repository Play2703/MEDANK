/**
 * ⚠️ NODE-ONLY: nunca importar este arquivo de código que roda no navegador (usa DictionaryNEREngine / better-sqlite3).
 * O cliente web/mobile deve sempre usar fetch('/api/extract-entities') ou o Web Worker (lib/core/engines/ner.worker.ts).
 * ---------------------------------------------------------------------------
 * HybridNEREngine
 * ---------------------------------------------------------------------------
 * Reconhecimento de Entidades Nomeadas (NER) HÍBRIDO para o MedAnki.
 *
 * Combina duas camadas de forma determinística e segura:
 *
 *   1. Camada LOCAL (DictionaryNEREngine — Aho-Corasick, dicionário + códigos CID
 *      como sinônimos). Sempre disponível, offline, alta precisão. É a fonte de
 *      verdade para categorias e para a extração de relações clínicas (gatilhos).
 *
 *   2. Camada de IA (AiNerProvider plugável — ex.: Gemini). Ampla cobertura e
 *      resolução de códigos CID-10 / SNOMED CT reais. Só entra em ação quando
 *      há uma chave de API configurada; caso contrário degrada graciosamente para
 *      o modo "local-only" (continua 100% funcional).
 *
 * O merge prioriza a camada local em caso de sobreposição de span (maior
 * precisão) e enriquece entidades locais com os códigos que a IA resolver.
 */

import {
  dictionaryNEREngine,
  DictionaryNEREngine,
  MatchedEntity,
  ExtractedRelation,
} from './DictionaryNEREngine';
import { parseJsonLoose } from '../config/aiGateway';

/** Entidade crua retornada por um provedor de IA. */
export interface AiNerEntity {
  text: string;
  /** Um dos 20 tipos clínicos ou uma das 6 categorias do dicionário. */
  category: string;
  codeSystem?: string | null; // 'CID-10' | 'SNOMED CT'
  code?: string | null;
  confidence?: number;
}

/**
 * Provedor de NER baseado em IA. A implementação concreta (Gemini) deve ser
 * tolerante a falhas: qualquer erro deve resultar em lista vazia, para que o
 * motor nunca quebre a extração local.
 */
export interface AiNerProvider {
  readonly name: string;
  isAvailable(): boolean;
  extractEntities(text: string): Promise<AiNerEntity[]>;
}

/** Provedor nulo: modo local-only (sem IA). */
export class NullAiNerProvider implements AiNerProvider {
  readonly name = 'null';
  isAvailable(): boolean {
    return false;
  }
  async extractEntities(): Promise<AiNerEntity[]> {
    return [];
  }
}

/**
 * Provedor Gemini: chama o modelo de forma estruturada e mapeia os ~20 tipos
 * clínicos para as 6 categorias do dicionário. Só ativo quando
 * GEMINI_API_KEY / VITE_GEMINI_API_KEY está presente.
 */
export class GeminiAiNerProvider implements AiNerProvider {
  readonly name = 'gemini';

  private static readonly CATEGORY_MAP: Record<string, string> = {
    // DOENCA
    disease: 'DOENCA',
    finding: 'DOENCA',
    microorganism: 'DOENCA',
    guideline: 'DOENCA',
    // MEDICAMENTO
    medication: 'MEDICAMENTO',
    drug_class: 'MEDICAMENTO',
    // SINTOMA
    symptom: 'SINTOMA',
    // ESTRUTURA_ANATOMICA
    anatomy: 'ESTRUTURA_ANATOMICA',
    medical_device: 'ESTRUTURA_ANATOMICA',
    // EXAME
    exam: 'EXAME',
    lab_value: 'EXAME',
    imaging_finding: 'EXAME',
    score: 'EXAME',
    // PROCEDIMENTO
    procedure: 'PROCEDIMENTO',
    vaccination: 'PROCEDIMENTO',
  };

  isAvailable(): boolean {
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);
    const isAiNerEnabled =
      process.env.ENABLE_AI_NER === 'true' || process.env.VITE_ENABLE_AI_NER === 'true';
    return hasKey && isAiNerEnabled;
  }

  async extractEntities(text: string): Promise<AiNerEntity[]> {
    if (!this.isAvailable() || !text.trim()) return [];

    const prompt = [
      'Voce e um extrator de entidades clinicas para textos de medicina em portugues.',
      'Identifique entidades medicas no texto e retorne SOMENTE um JSON com a forma:',
      '{"entities":[{"text":"termo exato como aparece","type":"<tipo>","code_system":"CID-10|SNOMED CT|DeCS|MeSH|null","code":"<codigo>|null","confidence":0.0}]}.',
      'Tipos permitidos: disease, finding, microorganism, guideline, medication, drug_class, symptom,',
      'anatomy, medical_device, exam, lab_value, imaging_finding, score, procedure, vaccination,',
      'gene, protein, hormone, enzyme, risk_factor.',
      'Use codigos CID-10, SNOMED CT ou DeCS/MeSH reais quando souber. Nao invente codigos.',
      'Nao repita o termo "text" como codigo. Responda apenas o JSON.',
      '',
      `TEXTO:\n${text}`,
    ].join('\n');

    try {
      // Import dinamico para nao puxar @google/genai para o bundle do frontend.
      const { GoogleGenAI } = await import('@google/genai');
      const apiKey = process.env.GEMINI_API_KEY || (process.env.VITE_GEMINI_API_KEY as string);
      const ai = new GoogleGenAI({ apiKey });
      const model = process.env.LIGHT_AI_MODEL || 'gemini-3.5-flash-lite';

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      });

      const raw = response.text || '';
      const parsed = parseJsonLoose(raw);
      const list = Array.isArray(parsed?.entities) ? parsed.entities : [];

      return list
        .filter((e: any) => e && typeof e.text === 'string' && e.text.trim())
        .map((e: any) => {
          const mapped =
            GeminiAiNerProvider.CATEGORY_MAP[String(e.type).toLowerCase()] ||
            (Object.values(GeminiAiNerProvider.CATEGORY_MAP).includes(e.type) ? e.type : null);
          return {
            text: e.text.trim(),
            category: mapped || 'DOENCA',
            codeSystem: e.code_system ?? e.codeSystem ?? null,
            code: e.code ?? null,
            confidence: typeof e.confidence === 'number' ? e.confidence : 0.8,
          } as AiNerEntity;
        });
    } catch (err) {
      console.warn(
        '[HybridNEREngine:Gemini] Falha na extracao por IA (usando apenas local):',
        (err as any)?.message || err
      );
      return [];
    }
  }
}

function hasGeminiKey(): boolean {
  const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);
  const isAiNerEnabled =
    process.env.ENABLE_AI_NER === 'true' || process.env.VITE_ENABLE_AI_NER === 'true';
  return hasKey && isAiNerEnabled;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Mistura entidades locais (alta precisão) com entidades da IA (maior cobertura
 * e códigos). Regras:
 *  - Entidades locais têm prioridade em sobreposição de span.
 *  - Entidades da IA que não colidem são adicionadas.
 *  - Se a IA resolveu um código para um termo já reconhecido localmente, o código
 *    é anexado à entidade local.
 */
export function mergeEntities(
  local: MatchedEntity[],
  ai: AiNerEntity[],
  originalText: string
): MatchedEntity[] {
  const normalizedFull = normalize(originalText);
  const result: MatchedEntity[] = local.map((e) => ({ ...e }));

  const overlaps = (start: number, end: number): MatchedEntity | null => {
    for (const e of result) {
      if (start < e.endIndex && end > e.startIndex) return e;
    }
    return null;
  };

  const localByNorm = new Map<string, MatchedEntity[]>();
  for (const e of result) {
    const k = normalize(e.normalizedTerm);
    const bucket = localByNorm.get(k);
    if (bucket) bucket.push(e);
    else localByNorm.set(k, [e]);
  }

  for (const a of ai) {
    const aNorm = normalize(a.text);
    const idx = normalizedFull.indexOf(aNorm);
    if (idx < 0) continue; // não consegue posicionar no texto
    const start = idx;
    const end = idx + aNorm.length;

    // 1) Enriquecer entidade local existente (mesmo termo) com código da IA
    const sameTerm = localByNorm.get(aNorm);
    if (sameTerm && sameTerm.length) {
      const target = sameTerm[0];
      if ((!target.codeSystem || !target.code) && a.code && a.codeSystem) {
        target.codeSystem = a.codeSystem;
        target.code = a.code;
      }
      continue;
    }

    // 2) Sobreposição de span => local vence; tenta enriquecer com código
    const hit = overlaps(start, end);
    if (hit) {
      if ((!hit.codeSystem || !hit.code) && a.code && a.codeSystem) {
        hit.codeSystem = a.codeSystem;
        hit.code = a.code;
      }
      continue;
    }

    // 3) Nova entidade vinda da IA
    result.push({
      text: a.text,
      normalizedTerm: normalize(a.text),
      category: a.category,
      startIndex: start,
      endIndex: end,
      codeSystem: a.codeSystem ?? null,
      code: a.code ?? null,
    });
  }

  return result.sort((a, b) => a.startIndex - b.startIndex);
}

export class HybridNEREngine {
  private localEngine: DictionaryNEREngine;
  private provider: AiNerProvider;

  constructor(provider?: AiNerProvider) {
    this.localEngine = dictionaryNEREngine;
    this.provider =
      provider ?? (hasGeminiKey() ? new GeminiAiNerProvider() : new NullAiNerProvider());
  }

  /** 'hybrid' quando a IA está ativa; 'local' em modo local-only. */
  get mode(): 'hybrid' | 'local' {
    return this.provider.isAvailable() ? 'hybrid' : 'local';
  }

  /**
   * Inicialização preguiçosa/aquecimento assíncrono do motor híbrido.
   */
  public async warmup(): Promise<boolean> {
    return this.localEngine.warmup();
  }

  async extractEntities(text: string): Promise<MatchedEntity[]> {

    const local = this.localEngine.extractEntities(text);
    let ai: AiNerEntity[] = [];
    try {
      ai = await this.provider.extractEntities(text);
    } catch {
      ai = [];
    }
    if (ai.length === 0) return local;
    return mergeEntities(local, ai, text);
  }

  /** Relações clínicas vêm da camada local determinística (gatilhos). */
  extractRelations(text: string, entities: MatchedEntity[]): ExtractedRelation[] {
    return this.localEngine.extractRelations(text, entities);
  }
}

export const hybridNEREngine = new HybridNEREngine();
