import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractRelevantContextForTopic,
  condenseProfessorProfileForDistribution,
  extractKeywords,
  normalizeKeyword,
  clearCustomContextEmbeddingCache,
} from './contextSegmentation';
import { estimateTokenCount } from './tokenBudget';
import { localEmbeddingClient } from './embeddings/LocalEmbeddingClient';

describe('contextSegmentation - Segmentação Semântica por Embeddings Locais e Condensação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCustomContextEmbeddingCache();
  });

  describe('normalizeKeyword & extractKeywords', () => {
    it('deve normalizar texto removendo acentos e stopwords', () => {
      const keywords = extractKeywords('Insuficiência Cardíaca Congestiva e Hipertensão');
      expect(keywords).toContain('insuficiencia');
      expect(keywords).toContain('cardiaca');
      expect(keywords).toContain('congestiva');
      expect(keywords).toContain('hipertensao');
      expect(keywords).not.toContain('e');
    });
  });

  describe('extractRelevantContextForTopic - Seleção Semântica e Fallback', () => {
    it('deve retornar texto intacto se for menor ou igual a maxChars sem chamar embeddings', async () => {
      const spyEmbeddings = vi.spyOn(localEmbeddingClient, 'generateEmbeddings');
      const shortContext = 'Diretrizes básicas de suporte avançado de vida em cardiologia.';
      const result = await extractRelevantContextForTopic(shortContext, 'Parada Cardiorrespiratória', 'Cardiologia', 1500);

      expect(result).toBe(shortContext);
      expect(spyEmbeddings).not.toHaveBeenCalled();
      spyEmbeddings.mockRestore();
    });

    it('deve retornar string vazia para entradas nulas ou vazias', async () => {
      expect(await extractRelevantContextForTopic('', 'Tópico', 'Especialidade')).toBe('');
      // @ts-ignore
      expect(await extractRelevantContextForTopic(null, 'Tópico', 'Especialidade')).toBe('');
    });

    it('deve selecionar blocos por similaridade semântica de cosseno mesmo quando a nomenclatura usar sinônimos sem overlap léxico literal', async () => {
      // Bloco 1: fala de síndrome coronariana aguda / oclusão coronária (sinônimo de IAM, sem conter a palavra exata "Infarto")
      const blockCoronarySyndrome =
        'No quadro de síndrome coronariana aguda com supradesnivelamento do segmento ST, a oclusão arterial transmural aguda por rotura de placa aterosclerótica requer abertura imediata do vaso por angioplastia primária transluminal ou trombólise química de emergência.';

      // Bloco 2: fala de cetoacidose e controle glicêmico
      const blockKetoacidosis =
        'A descompensação hiperglicêmica com acidose metabólica de ânion gap elevado, hiato osmolar aumentado e cetonemia positiva demanda reposição volêmica com cloreto de sódio a 0,9% e infusão contínua de insulina regular intravenosa.';

      // Bloco 3: fala de hipertensão arterial resistente
      const blockHypertension =
        'Na hipertensão arterial resistente, o paciente mantém pressão arterial acima das metas terapêuticas a despeito do uso sinérgico de 3 classes anti-hipertensivas em doses otimizadas, incluindo um diurético tiazídico.';

      const longContext = `${blockCoronarySyndrome}\n\n${blockKetoacidosis}\n\n${blockHypertension}`.repeat(5);

      // Mock de embeddings controlados:
      // Query "Cardiologia - IAM" tem vetor [1, 0, 0]
      // Bloco 1 (Síndrome coronariana) tem vetor [0.95, 0.05, 0] -> Cosseno ~0.95
      // Bloco 2 (Cetoacidose) tem vetor [0, 1, 0] -> Cosseno ~0
      // Bloco 3 (Hipertensão) tem vetor [0.5, 0.5, 0] -> Cosseno ~0.5
      const spyEmbeddings = vi.spyOn(localEmbeddingClient, 'generateEmbeddings').mockImplementation(async (texts) => {
        return texts.map((t) => {
          if (t.includes('query:')) return [1, 0, 0];
          if (t.includes('síndrome coronariana aguda')) return [0.95, 0.05, 0];
          if (t.includes('descompensação hiperglicêmica')) return [0, 1, 0];
          return [0.5, 0.5, 0];
        });
      });

      const result = await extractRelevantContextForTopic(
        longContext,
        'IAM',
        'Cardiologia',
        1000
      );

      expect(result).toContain('síndrome coronariana aguda com supradesnivelamento');
      expect(result).not.toContain('descompensação hiperglicêmica');
      expect(result.length).toBeLessThanOrEqual(1000);

      spyEmbeddings.mockRestore();
    });

    it('deve usar o cache de embeddings de blocos para evitar reprocessar o mesmo customContext em chamadas com tópicos diferentes', async () => {
      const blockA = 'Manejo clínico da insuficiência cardíaca crônica descompensada e perfil hemodinâmico de Stevenson.';
      const blockB = 'Abordagem da embolia pulmonar aguda com instabilidade hemodinâmica e indicação de trombólise.';
      const longContext = `${blockA}\n\n${blockB}`.repeat(10);

      let batchCallsCount = 0;
      let queryCallsCount = 0;

      const spyEmbeddings = vi.spyOn(localEmbeddingClient, 'generateEmbeddings').mockImplementation(async (texts) => {
        if (texts.length === 1 && texts[0].startsWith('query:')) {
          queryCallsCount++;
          return [[1, 0]];
        }
        batchCallsCount++;
        return texts.map(() => [0.8, 0.2]);
      });

      // 1ª chamada para Tópico 1
      await extractRelevantContextForTopic(longContext, 'Insuficiência Cardíaca', 'Cardiologia', 1200);
      expect(batchCallsCount).toBe(1);
      expect(queryCallsCount).toBe(1);

      // 2ª chamada para Tópico 2 com o MESMO customContext
      await extractRelevantContextForTopic(longContext, 'Embolia Pulmonar', 'Pneumologia', 1200);
      // O lote de blocos NÃO deve ser reprocessado (usou cache!), apenas a nova query
      expect(batchCallsCount).toBe(1);
      expect(queryCallsCount).toBe(2);

      spyEmbeddings.mockRestore();
    });

    it('deve utilizar fallback gracioso caso o gerador de embeddings falhe', async () => {
      const blockA = 'Parágrafo sobre Pneumonia Adquirida na Comunidade (PAC) e escore CURB-65.';
      const blockB = 'Parágrafo sobre Apendicite aguda e sinal de Blumberg no ponto de McBurney.';
      const longContext = `${blockA}\n\n${blockB}`.repeat(15);

      const spyEmbeddings = vi.spyOn(localEmbeddingClient, 'generateEmbeddings').mockRejectedValue(
        new Error('Worker crashed')
      );

      const result = await extractRelevantContextForTopic(
        longContext,
        'Pneumonia Adquirida na Comunidade',
        'Pneumologia',
        1000
      );

      expect(result).toContain('Pneumonia Adquirida na Comunidade');
      expect(result.length).toBeLessThanOrEqual(1000);

      spyEmbeddings.mockRestore();
    });
  });

  describe('condenseProfessorProfileForDistribution', () => {
    it('deve condensar e limitar os campos de professorStyleAnalysis e examDNA', () => {
      const fullAnalysis = {
        estiloDeQuestao: 'Casos clínicos longos com pegadinhas de dosagem',
        nivelCognitivo: 'Raciocínio avançado e diagnóstico diferencial',
        temasFavoritos: ['Cardiologia', 'Pneumologia', 'Infectologia', 'Nefrologia', 'Gastroenterologia'],
        pegadinhasRecorrentes: ['Troca de dosagem', 'Confusão de estadiamento', 'Diagnósticos semelhantes', 'Contraindicações'],
        resumoEstiloGeral: 'O professor foca intensamente em casos clínicos multidisciplinares com enunciados de mais de 800 caracteres e tabelas laboratoriais complexas... '.repeat(10),
        examDNA: {
          clinicalCaseRatio: 0.85,
          averageStemLength: 750,
          directQuestionRatio: 0.15,
          difficultyIndex: 0.8,
          extraInternalField: [1, 2, 3, 4, 5],
        },
      };

      const condensed = condenseProfessorProfileForDistribution(fullAnalysis, fullAnalysis.examDNA);

      expect(condensed.professorStyleAnalysis).toBeDefined();
      expect(condensed.professorStyleAnalysis.temasFavoritos.length).toBe(3);
      expect(condensed.professorStyleAnalysis.pegadinhasRecorrentes.length).toBe(2);
      expect(condensed.professorStyleAnalysis.resumoEstiloGeral.length).toBeLessThanOrEqual(310);
      expect(condensed.examDNA).toBeDefined();
      expect(condensed.examDNA.clinicalCaseRatio).toBe(0.85);
      expect(condensed.examDNA.extraInternalField).toBeUndefined();
    });
  });

  describe('Medição de Impacto de Tokens (Simulado com 6 Tópicos)', () => {
    it('deve demonstrar redução de tokens superior a 75% em simulado com customContext longo de 3000 tokens e 6 tópicos', async () => {
      const topics = [
        'Insuficiência Cardíaca',
        'Asma e DPOC',
        'Diabetes Mellitus',
        'Injúria Renal Aguda',
        'Sepse e Choque Séptico',
        'Acidente Vascular Cerebral',
      ];

      const sections = [
        'Seção Cardiologia: Na insuficiência cardíaca crônica descompensada, a classificação hemodinâmica de Stevenson orienta o tratamento com inotrópicos e vasodilatadores...',
        'Seção Pneumologia: No manejo de asma e DPOC exacerbado, a gasometria arterial avalia risco de hipercapnia e fadiga respiratória com necessidade de ventilação não invasiva...',
        'Seção Endocrinologia: Para o diabetes mellitus e cetoacidose diabética, a hidratação venosa vigorosa e insulinoterapia em bomba contínua corrigem a cetonemia...',
        'Seção Nefrologia: Na injúria renal aguda por necrose tubular aguda (NTA), a fração de excreção de sódio e sedimento com cilindros granulosos diferenciam da causa pré-renal...',
        'Seção Terapia Intensiva: O protocolo do pacote de 1 hora na sepse e choque séptico inclui lactato sérico, hemoculturas, antibiótico de amplo espectro e ressuscitação volêmica...',
        'Seção Neurologia: No acidente vascular cerebral isquêmico agudo (AVCi), a trombólise com alteplase até 4,5h e trombectomia mecânica reduzem sequelas neurológicas graves...',
      ];

      const longCustomContext = sections.map((s) => s.repeat(15)).join('\n\n');
      const fullContextTokens = estimateTokenCount(longCustomContext);

      expect(fullContextTokens).toBeGreaterThan(2500);

      // Cenário ANTES: mesmo customContext enviado 6 vezes
      const totalTokensBefore = fullContextTokens * topics.length;

      // Cenário DEPOIS: customContext recortado por tópico
      let totalTokensAfter = 0;
      for (const topic of topics) {
        const segmented = await extractRelevantContextForTopic(longCustomContext, topic, 'Clínica Médica', 1500);
        totalTokensAfter += estimateTokenCount(segmented);
      }

      const tokenSavingsRatio = (totalTokensBefore - totalTokensAfter) / totalTokensBefore;

      console.log(`[TokenSavingsBenchmark] Total tokens ANTES (6 tópicos): ${totalTokensBefore} tokens`);
      console.log(`[TokenSavingsBenchmark] Total tokens DEPOIS (6 tópicos): ${totalTokensAfter} tokens`);
      console.log(`[TokenSavingsBenchmark] Economia real de tokens: ${(tokenSavingsRatio * 100).toFixed(1)}% (${totalTokensBefore - totalTokensAfter} tokens economizados)`);

      expect(totalTokensAfter).toBeLessThan(totalTokensBefore);
      expect(tokenSavingsRatio).toBeGreaterThan(0.75);
    });
  });
});
