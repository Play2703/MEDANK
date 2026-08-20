import { describe, it, expect } from 'vitest';
import { isValidGeneratedQuestion, isValidOptionText } from './contentValidation';
import { isQuestionGroundedInCustomContext } from '../../data/services/QuestionGenerationService';

describe('Simulação de Geração sobre Tronco Encefálico com Texto-Fonte (customContext)', () => {
  const customContextNotas = `
NOTAS DE ANATOMIA HUMANA - TRONCO ENCEFÁLICO
O tronco encefálico é a região do sistema nervoso central interposta entre o diencéfalo e a medula espinhal, dividindo-se anatomicamente em três porções em sentido crânio-caudal:
1. Mesencéfalo: porção cranial, contém os colículos superiores e inferiores (visão e audição), pedúnculos cerebrais e substância negra.
2. Ponte: porção média, caracterizada por estriações transversais na face anterior, onde emergem as raízes do nervo trigêmeo (V par).
3. Bulbo (medula oblonga): porção caudal, conecta-se inferiormente com a medula espinhal. Apresenta na face anterior as pirâmides bulbares (onde ocorre a decussação das pirâmides) e as olivas bulbares. Aloja centros vitais de controle respiratório e cardiovascular.
  `.trim();

  it('deve validar e aprovar questões estritamente ancoradas nas notas com alternativas anatômicas válidas', () => {
    const questionAncorada = {
      id: 'q-brainstem-1',
      statement: 'Com base na divisão anatômica crânio-caudal do tronco encefálico, qual a estrutura que se localiza na porção caudal e aloja os centros vitais de controle respiratório e cardiovascular?',
      options: [
        { letter: 'A', text: 'Mesencéfalo', isCorrect: false },
        { letter: 'B', text: 'Ponte', isCorrect: false },
        { letter: 'C', text: 'Bulbo', isCorrect: true },
        { letter: 'D', text: 'Diencéfalo', isCorrect: false },
      ],
      correctOptionLetter: 'C',
      commentary: 'O bulbo (medula oblonga) é a porção caudal do tronco encefálico e aloja centros respiratório e cardiovascular.',
    };

    expect(isValidGeneratedQuestion(questionAncorada)).toBe(true);
    expect(isQuestionGroundedInCustomContext(questionAncorada, customContextNotas)).toBe(true);
  });

  it('deve rejeitar e bloquear questão quando houver distratores sem sentido como p030, dCb, erbB, umP', () => {
    const questionComLixo = {
      id: 'q-brainstem-bad-options',
      statement: 'Qual estrutura do tronco encefálico contém as pirâmides onde ocorre a decussação motora?',
      options: [
        { letter: 'A', text: 'p030', isCorrect: false },
        { letter: 'B', text: 'dCb', isCorrect: false },
        { letter: 'C', text: 'Bulbo', isCorrect: true },
        { letter: 'D', text: 'erbB', isCorrect: false },
      ],
      correctOptionLetter: 'C',
      commentary: 'As pirâmides bulbares localizam-se na face anterior do bulbo.',
    };

    expect(isValidGeneratedQuestion(questionComLixo)).toBe(false);
    expect(isValidOptionText('p030')).toBe(false);
    expect(isValidOptionText('dCb')).toBe(false);
    expect(isValidOptionText('erbB')).toBe(false);
    expect(isValidOptionText('umP')).toBe(false);
  });

  it('deve reprovar no grounding check questão que inventar doenças ou conceitos clínicos não contidos no texto-fonte', () => {
    const questionDesancoradaAlucinada = {
      id: 'q-brainstem-hallucinated',
      statement: 'Paciente portador de Síndrome de Guillain-Barré pós infecção por Campylobacter jejuni desenvolve arritmia grave.',
      options: [
        { letter: 'A', text: 'Iniciar Imunoglobulina venosa', isCorrect: true },
        { letter: 'B', text: 'Prescrever Corticoterapia oral', isCorrect: false },
        { letter: 'C', text: 'Realizar Plasmaférese ambulatorial', isCorrect: false },
        { letter: 'D', text: 'Aguardar resolução espontânea', isCorrect: false },
      ],
      correctOptionLetter: 'A',
      commentary: 'A imunoglobulina venosa é a conduta de escolha.',
    };

    // A questão é sintaticamente correta, mas NÃO tem nenhuma ancoragem no texto-fonte de anatomia do tronco
    expect(isValidGeneratedQuestion(questionDesancoradaAlucinada)).toBe(true);
    expect(isQuestionGroundedInCustomContext(questionDesancoradaAlucinada, customContextNotas)).toBe(false);
  });
});
