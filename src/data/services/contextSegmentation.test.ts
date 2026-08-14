import { describe, it, expect } from 'vitest';
import {
  extractRelevantContextForTopic,
  condenseProfessorProfileForDistribution,
  extractKeywords,
  normalizeKeyword,
} from './contextSegmentation';
import { estimateTokenCount } from './tokenBudget';

describe('contextSegmentation - Segmentação de Contexto por Tópico e Condensação de Perfil', () => {
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

  describe('extractRelevantContextForTopic', () => {
    it('deve retornar texto intacto se for menor que maxChars', () => {
      const shortContext = 'Diretrizes básicas de suporte avançado de vida em cardiologia.';
      const result = extractRelevantContextForTopic(shortContext, 'Parada Cardiorrespiratória', 'Cardiologia', 1500);
      expect(result).toBe(shortContext);
    });

    it('deve retornar string vazia para entradas nulas ou vazias', () => {
      expect(extractRelevantContextForTopic('', 'Tópico', 'Especialidade')).toBe('');
      // @ts-ignore
      expect(extractRelevantContextForTopic(null, 'Tópico', 'Especialidade')).toBe('');
    });

    it('deve extrair e priorizar apenas os parágrafos relevantes ao tópico em textos longos', () => {
      const pHeartFailure =
        'Parágrafo A: A insuficiência cardíaca com fração de ejeção reduzida (ICFEr) exige terapia quádrupla com IECA/BRA ou INRA, betabloqueador (carvedilol, succinato de metoprolol ou bisoprolol), antagonista de receptor mineralocorticoide (espironolactona) e inibidor de SGLT2 (dapagliflozina ou empagliflozina). Essa associação reduz mortalidade cardiovascular.';

      const pAsthma =
        'Parágrafo B: No manejo da asma brônquica aguda grave em sala de emergência, preconiza-se o uso de beta-2 agonista de curta ação (salbutamol inalatório) associado a brometo de ipratrópio e corticoide sistêmico precoce (prednisona ou hidrocortisona). Em casos refratários, considerar sulfato de magnésio intravenoso.';

      const pDiabetes =
        'Parágrafo C: O diagnóstico de diabetes mellitus tipo 2 fundamenta-se em glicemia de jejum >= 126 mg/dL em duas ocasiões, hemoglobina glicada (HbA1c) >= 6,5%, ou glicemia >= 200 mg/dL no teste de tolerância oral à glicose (TOTG 75g). A metformina continua como fármaco de primeira linha.';

      const pNephro =
        'Parágrafo D: Na injúria renal aguda pré-renal, observa-se fração de excreção de sódio (FENa) < 1%, relação ureia/creatinina plasmática > 40 e densidade urinária elevada (> 1.020) com cilindros hialinos no sedimento urinário.';

      const baseSections = [pHeartFailure, pAsthma, pDiabetes, pNephro];
      const longCustomContext = Array(3).fill(baseSections.join('\n\n')).join('\n\n');

      expect(longCustomContext.length).toBeGreaterThan(1500);

      // Busca para o tópico de Insuficiência Cardíaca
      const resultCardio = extractRelevantContextForTopic(
        longCustomContext,
        'Insuficiência Cardíaca',
        'Cardiologia',
        1200
      );

      expect(resultCardio).toContain('insuficiência cardíaca');
      expect(resultCardio).toContain('ICFEr');
      expect(resultCardio).not.toContain('asma brônquica aguda');
      expect(resultCardio).not.toContain('injúria renal aguda');
      expect(resultCardio.length).toBeLessThanOrEqual(1200);

      // Busca para o tópico de Asma
      const resultAsthma = extractRelevantContextForTopic(
        longCustomContext,
        'Asma Brônquica',
        'Pneumologia',
        1200
      );

      expect(resultAsthma).toContain('asma brônquica aguda');
      expect(resultAsthma).toContain('salbutamol');
      expect(resultAsthma).not.toContain('ICFEr');
      expect(resultAsthma).not.toContain('diabetes mellitus');
    });

    it('deve truncar graciosamente os primeiros maxChars quando nenhum parágrafo tiver match léxico com o tópico', () => {
      const longGenericText =
        'Este é um texto genérico médico sem tópicos específicos. '.repeat(60);
      const result = extractRelevantContextForTopic(longGenericText, 'Tópico Inexistente XYZ', 'Especialidade ABC', 1000);

      expect(result.length).toBeLessThanOrEqual(1010);
      expect(result).toContain('Este é um texto genérico médico');
      expect(result).toContain('[…]');
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
      expect(condensed.examDNA.extraInternalField).toBeUndefined(); // Campos internos não acionáveis são removidos
    });
  });

  describe('Medição de Impacto de Tokens (Simulado com 6 Tópicos)', () => {
    it('deve demonstrar redução de tokens superior a 75% em simulado com customContext longo de 3000 tokens e 6 tópicos', () => {
      const topics = [
        'Insuficiência Cardíaca',
        'Asma e DPOC',
        'Diabetes Mellitus',
        'Injúria Renal Aguda',
        'Sepse e Choque Séptico',
        'Acidente Vascular Cerebral',
      ];

      // customContext com ~3.000 tokens (~12.000 caracteres)
      const sections = [
        'Seção Cardiologia: Na insuficiência cardíaca crônica descompensada, a classificação hemodinâmica de Stevenson orienta o tratamento com inotrópicos e vasodilatadores...',
        'Seção Pneumologia: No manejo de asma e DPOC exacerbado, a gasometria arterial avalia risco de hipercapnia e fadiga respiratória com necessidade de ventilação não invasiva...',
        'Seção Endocrinologia: Para o diabetes mellitus e cetoacidose diabética, a hidratação venosa vigorosa e insulinoterapia em bomba contínua corrigem a cetonemia...',
        'Seção Nefrologia: Na injúria renal aguda por necrose tubular aguda (NTA), a fração de excreção de sódio e sedimento com cilindros granulosos diferenciam da causa pré-renal...',
        'Seção Terapia Intensiva: O protocolo do pacote de 1 hora na sepse e choque séptico inclui lactato sérico, hemoculturas, antibiótico de amplo espectro e ressuscitação volêmica...',
        'Seção Neurologia: No acidente vascular cerebral isquêmico agudo (AVCi), a trombólise com alteplase até 4,5h e trombectomia mecânica reduzem sequelas neurológicas graves...',
      ];

      // Multiplica para atingir ~12.000+ caracteres (~3.000 tokens)
      const longCustomContext = sections.map((s) => s.repeat(15)).join('\n\n');
      const fullContextTokens = estimateTokenCount(longCustomContext);

      expect(fullContextTokens).toBeGreaterThan(2500);

      // Cenário ANTES da mudança: mesmo customContext enviado 6 vezes
      const totalTokensBefore = fullContextTokens * topics.length;

      // Cenário DEPOIS da mudança: customContext recortado por tópico
      let totalTokensAfter = 0;
      for (const topic of topics) {
        const segmented = extractRelevantContextForTopic(longCustomContext, topic, 'Clínica Médica', 1500);
        totalTokensAfter += estimateTokenCount(segmented);
      }

      const tokenSavingsRatio = (totalTokensBefore - totalTokensAfter) / totalTokensBefore;

      console.log(`[TokenSavingsBenchmark] Total tokens ANTES (6 tópicos): ${totalTokensBefore} tokens`);
      console.log(`[TokenSavingsBenchmark] Total tokens DEPOIS (6 tópicos): ${totalTokensAfter} tokens`);
      console.log(`[TokenSavingsBenchmark] Economia real de tokens: ${(tokenSavingsRatio * 100).toFixed(1)}% (${totalTokensBefore - totalTokensAfter} tokens economizados)`);

      expect(totalTokensAfter).toBeLessThan(totalTokensBefore);
      expect(tokenSavingsRatio).toBeGreaterThan(0.75); // Mais de 75% de economia comprovada!
    });
  });
});
