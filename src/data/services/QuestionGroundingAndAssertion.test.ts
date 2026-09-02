import { describe, it, expect } from 'vitest';
import { isQuestionGroundedInCustomContext } from './QuestionGenerationService';
import { isValidGeneratedQuestion } from '../../core/utils/contentValidation';
import { QuestionType, Question } from '../../domain/entities/Question';

describe('Grounding Check Aprimorado (customContext + retrievedChunksText)', () => {
  const shortTopicNote = 'NOTAS DE AULA: Cardiologia - Valvopatias e sopros cardíacos';
  const retrievedChunksRAG = `
TRECHO 1 (Tratado de Cardiologia):
A estenose aórtica importante caracteriza-se clinicamente por tríade clássica de angina, síncope e dispneia aos esforços.
Ao exame físico, ausculta-se sopro mesossistólico em crescendo-decrescendo em foco aórtico com irradiação para as artérias carótidas,
associado a pulso parvus et tardus e desdobramento paradoxal de B2.
A intervenção por troca valvar cirúrgica ou implante transcateter (TAVI) é indicada na presença de sintomas ou fração de ejeção reduzida (< 50%).
`.trim();

  it('deve aprovar questão quando os termos técnicos vierem do RAG (retrievedChunksText), mesmo que a nota seja curta', () => {
    const questionFromRAG = {
      id: 'q-valvopatia-1',
      statement: 'Paciente idoso apresenta síncope aos esforços. À ausculta, nota-se sopro mesossistólico em foco aórtico irradiado para carótidas com pulso parvus et tardus.',
      options: [
        { letter: 'A', text: 'Estenose aórtica importante com indicação de avaliação valvar', isCorrect: true },
        { letter: 'B', text: 'Insuficiência mitral discreta sem indicação cirúrgica', isCorrect: false },
        { letter: 'C', text: 'Estenose pulmonar congênita isolada', isCorrect: false },
        { letter: 'D', text: 'Prolapso de valva tricúspide assintomático', isCorrect: false },
      ],
      correctOptionLetter: 'A',
      commentary: {
        correta: 'O sopro mesossistólico com irradiação para carótidas e pulso parvus et tardus é patognomônico de estenose aórtica importante sintomática.',
        porOpcao: {
          A: 'Correta: preenche critérios clínicos clássicos.',
          B: 'Incorreta: ausculta não condiz com insuficiência mitral.',
          C: 'Incorreta: foco aórtico e irradiação carotídea descartam foco pulmonar.',
          D: 'Incorreta: não há correlação com prolapso tricuspídeo.',
        },
        correlacaoClinica: 'A tríade clássica (angina, síncope, dispneia) indica intervenção valvar.',
      },
    };

    // Valid against RAG text combined with note
    expect(isValidGeneratedQuestion(questionFromRAG)).toBe(true);
    expect(isQuestionGroundedInCustomContext(questionFromRAG, shortTopicNote, retrievedChunksRAG)).toBe(true);
  });

  it('deve reprovar quando a questão inventar tópicos completamente desconexos de ambas as fontes', () => {
    const questionHallucinated = {
      id: 'q-hallucinated',
      statement: 'Criança de 3 anos com febre alta há 6 dias, conjuntivite não exsudativa, língua em framboesa e linfonodomegalia cervical.',
      options: [
        { letter: 'A', text: 'Iniciar Imunoglobulina venosa e AAS para Doença de Kawasaki', isCorrect: true },
        { letter: 'B', text: 'Prescrever Amoxicilina para escarlatina estreptocócica', isCorrect: false },
        { letter: 'C', text: 'Administrar Ceftriaxona para meningococcemia', isCorrect: false },
        { letter: 'D', text: 'Aguardar sorologia para mononucleose', isCorrect: false },
      ],
      correctOptionLetter: 'A',
      commentary: 'Trata-se de Doença de Kawasaki.',
    };

    expect(isValidGeneratedQuestion(questionHallucinated)).toBe(true);
    // Nem a nota de valvopatias nem os chunks de estenose aórtica contêm Doença de Kawasaki
    expect(isQuestionGroundedInCustomContext(questionHallucinated, shortTopicNote, retrievedChunksRAG)).toBe(false);
  });

  it('deve retornar true quando não houver nem customContext nem retrievedChunksText (sem restrição)', () => {
    const generalQuestion = {
      statement: 'Qual a conduta prioritária na suspeita de síndrome coronariana aguda com supra de ST?',
      options: [
        { letter: 'A', text: 'Encaminhar imediatamente para terapia de reperfusão', isCorrect: true },
        { letter: 'B', text: 'Realizar ecocardiograma ambulatorial', isCorrect: false },
        { letter: 'C', text: 'Aguardar resultado de curva de troponina', isCorrect: false },
        { letter: 'D', text: 'Prescrever analgesia simples e alta', isCorrect: false },
      ],
      correctOptionLetter: 'A',
      commentary: 'Reperfusão imediata é o pilar do IAMCSST.',
    };

    expect(isQuestionGroundedInCustomContext(generalQuestion, undefined, undefined)).toBe(true);
    expect(isQuestionGroundedInCustomContext(generalQuestion, '', '')).toBe(true);
    expect(isQuestionGroundedInCustomContext(generalQuestion, '   ', '  ')).toBe(true);
  });
});

describe('Entidade e Tipo de Questão: assercao_combinada', () => {
  it('deve permitir assercao_combinada como QuestionType válido', () => {
    const type: QuestionType = 'assercao_combinada';
    expect(type).toBe('assercao_combinada');
  });

  it('deve suportar asserções estruturadas na interface Question', () => {
    const q: Question = {
      id: 'q-assercao-1',
      setId: 'qset-1',
      statement: 'Analise as seguintes afirmações sobre a cetoacidose diabética (CAD):',
      assertionItems: [
        { numeral: 'I', text: 'A gasometria arterial típica demonstra acidose metabólica com ânion gap elevado.' },
        { numeral: 'II', text: 'A reposição de potássio deve anteceder o início da insulinoterapia se K+ < 3,3 mEq/L.' },
        { numeral: 'III', text: 'A infusão de bicarbonato de sódio é recomendada rotineiramente para pH < 7,20.' },
        { numeral: 'IV', text: 'O critério de resolução da CAD inclui glicemia < 200 mg/dL e bicarbonato >= 15 mEq/L.' },
      ],
      options: [
        { id: 'opt-1-A', letter: 'A', text: 'Apenas os itens I e II estão corretos', isCorrect: false },
        { id: 'opt-1-B', letter: 'B', text: 'Apenas os itens I, II e IV estão corretos', isCorrect: true },
        { id: 'opt-1-C', letter: 'C', text: 'Apenas os itens II e III estão corretos', isCorrect: false },
        { id: 'opt-1-D', letter: 'D', text: 'Todos os itens estão corretos', isCorrect: false },
      ],
      correctOptionId: 'opt-1-B',
      commentary: {
        correta: 'Os itens I, II e IV são corretos. O item III é falso porque bicarbonato só é indicado se pH < 6,90.',
        porItem: {
          I: 'Verdadeiro: CAD cursa com acidose metabólica com ânion-gap aumentado pelo acúmulo de cetoácidos.',
          II: 'Verdadeiro: insulina desloca potássio para o intracelular, risco de arritmia se K+ < 3,3.',
          III: 'Falso: indicação apenas para acidose extrema (pH < 6,90).',
          IV: 'Verdadeiro: critérios clássicos da ADA de resolução da cetoacidose.',
        },
        porOpcao: {
          A: 'Incorreta: o item IV também é correto.',
          B: 'Correta: itens I, II e IV verdadeiros.',
          C: 'Incorreta: o item III é falso.',
          D: 'Incorreta: o item III é falso.',
        },
        correlacaoClinica: 'Diretriz da American Diabetes Association (ADA) e SBD.',
      },
      specialty: 'Endocrinologia',
      topic: 'Diabetes Mellitus',
      difficulty: 'dificil',
      questionType: 'assercao_combinada',
      isAnswered: false,
      createdAt: new Date().toISOString(),
    };

    expect(q.questionType).toBe('assercao_combinada');
    expect(q.assertionItems).toHaveLength(4);
    expect(q.assertionItems?.[0].numeral).toBe('I');
    expect(typeof q.commentary).toBe('object');
    if (typeof q.commentary === 'object') {
      expect(q.commentary.porItem?.['I']).toBeDefined();
    }
  });
});
