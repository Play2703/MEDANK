import { describe, it, expect } from 'vitest';
import {
  isValidGeneratedQuestion,
  isValidGeneratedCard,
  isValidOptionText,
  validateDistracter,
  validateDistractor,
  ensureVariedCorrectLength,
} from './contentValidation';

describe('contentValidation', () => {
  describe('isValidOptionText', () => {
    it('deve rejeitar alternativas com strings sem sentido ou códigos vazados (p030, erbB, dCb, umP)', () => {
      expect(isValidOptionText('p030')).toBe(false);
      expect(isValidOptionText('erbB')).toBe(false);
      expect(isValidOptionText('dCb')).toBe(false);
      expect(isValidOptionText('umP')).toBe(false);
      expect(isValidOptionText('q-1234')).toBe(false);
      expect(isValidOptionText('abc')).toBe(false);
      expect(isValidOptionText('')).toBe(false);
      expect(isValidOptionText(null)).toBe(false);
    });

    it('deve aceitar respostas curtas legítimas da whitelist (CERTO, ERRADO, Bulbo., Ponte, Mesencéfalo)', () => {
      expect(isValidOptionText('CERTO')).toBe(true);
      expect(isValidOptionText('ERRADO')).toBe(true);
      expect(isValidOptionText('VERDADEIRO')).toBe(true);
      expect(isValidOptionText('FALSO')).toBe(true);
      expect(isValidOptionText('Bulbo.')).toBe(true);
      expect(isValidOptionText('Bulbo')).toBe(true);
      expect(isValidOptionText('Ponte')).toBe(true);
      expect(isValidOptionText('Mesencéfalo')).toBe(true);
      expect(isValidOptionText('Fígado')).toBe(true);
    });

    it('deve aceitar alternativas normais com frases clínicas e valores numéricos médicos válidos', () => {
      expect(isValidOptionText('Realizar ECG imediatamente')).toBe(true);
      expect(isValidOptionText('Prescrever analgésico comum')).toBe(true);
      expect(isValidOptionText('10 mg/dia')).toBe(true);
      expect(isValidOptionText('120/80 mmHg')).toBe(true);
      expect(isValidOptionText('Apendicectomia videolaparoscópica')).toBe(true);
    });
  });

  describe('isValidGeneratedQuestion', () => {
    const validQuestion = {
      statement: 'Paciente de 60 anos com dor precordial intensa.',
      options: [
        { letter: 'A', text: 'Realizar ECG imediatamente', isCorrect: true },
        { letter: 'B', text: 'Prescrever analgésico comum', isCorrect: false },
        { letter: 'C', text: 'Dar alta com orientação', isCorrect: false },
        { letter: 'D', text: 'Aguardar 24 horas', isCorrect: false },
      ],
      commentary: 'O ECG é a conduta prioritária na suspeita de SCA.',
    };

    it('deve retornar true para uma questão válida', () => {
      expect(isValidGeneratedQuestion(validQuestion)).toBe(true);
    });

    it('deve retornar false se qualquer alternativa contiver string sem sentido (p030, erbB, dCb, umP)', () => {
      const qWithP030 = {
        ...validQuestion,
        options: [
          { letter: 'A', text: 'p030', isCorrect: false },
          { letter: 'B', text: 'Prescrever analgésico comum', isCorrect: false },
          { letter: 'C', text: 'Realizar ECG imediatamente', isCorrect: true },
          { letter: 'D', text: 'dCb', isCorrect: false },
        ],
      };
      expect(isValidGeneratedQuestion(qWithP030)).toBe(false);

      const qWithErbB = {
        ...validQuestion,
        options: [
          { letter: 'A', text: 'Realizar ECG imediatamente', isCorrect: true },
          { letter: 'B', text: 'erbB', isCorrect: false },
          { letter: 'C', text: 'Dar alta com orientação', isCorrect: false },
          { letter: 'D', text: 'umP', isCorrect: false },
        ],
      };
      expect(isValidGeneratedQuestion(qWithErbB)).toBe(false);
    });

    it('deve retornar false se correctAnswerText for um código inválido', () => {
      const qWithBadAnswer = {
        statement: 'Qual estrutura localiza-se no tronco encefálico?',
        correctAnswerText: 'p030',
        commentary: 'Explicação.',
      };
      expect(isValidGeneratedQuestion(qWithBadAnswer)).toBe(false);
    });

    it('deve retornar true se correctAnswerText for um termo válido da whitelist ou frase', () => {
      const qWithBulbo = {
        statement: 'Qual estrutura localiza-se no tronco encefálico caudal?',
        correctAnswerText: 'Bulbo.',
        commentary: 'O bulbo é a porção caudal do tronco encefálico.',
      };
      expect(isValidGeneratedQuestion(qWithBulbo)).toBe(true);
    });

    it('deve retornar false se o statement estiver vazio ou ausente', () => {
      expect(isValidGeneratedQuestion({ ...validQuestion, statement: '' })).toBe(false);
      expect(isValidGeneratedQuestion({ ...validQuestion, statement: null })).toBe(false);
    });

    it('deve retornar false se options não tiver 4 itens', () => {
      expect(isValidGeneratedQuestion({ ...validQuestion, options: validQuestion.options.slice(0, 3) })).toBe(false);
    });

    it('deve retornar false se houver mais de uma opção com isCorrect: true', () => {
      const invalidOpts = [
        { letter: 'A', text: 'Opção A', isCorrect: true },
        { letter: 'B', text: 'Opção B', isCorrect: true },
        { letter: 'C', text: 'Opção C', isCorrect: false },
        { letter: 'D', text: 'Opção D', isCorrect: false },
      ];
      expect(isValidGeneratedQuestion({ ...validQuestion, options: invalidOpts })).toBe(false);
    });

    it('deve validar via correctOptionLetter quando isCorrect não vier setado individualmente', () => {
      const qWithLetter = {
        statement: 'Qual a conduta inicial?',
        options: [
          { letter: 'A', text: 'Conduta A' },
          { letter: 'B', text: 'Conduta B' },
          { letter: 'C', text: 'Conduta C' },
          { letter: 'D', text: 'Conduta D' },
        ],
        correctOptionLetter: 'B',
        commentary: 'A conduta B é a correta.',
      };
      expect(isValidGeneratedQuestion(qWithLetter)).toBe(true);
    });

    it('deve retornar false se o commentary estiver vazio ou ausente', () => {
      expect(isValidGeneratedQuestion({ ...validQuestion, commentary: '' })).toBe(false);
    });
  });

  describe('isValidGeneratedCard', () => {
    const validBasicCard = {
      type: 'basic',
      front: 'Qual o antídoto da intoxicação por paracetamol?',
      back: 'N-acetilcisteína (NAC).',
    };

    const validClozeCard = {
      type: 'cloze',
      front: 'A conduta de 1ª linha na HAS com DM é {{c1::IECA ou BRA::classe farmacológica}}.',
      back: 'IECA ou BRA protegem a função renal.',
    };

    it('deve retornar true para um card básico válido', () => {
      expect(isValidGeneratedCard(validBasicCard)).toBe(true);
    });

    it('deve retornar true para um card cloze com sintaxe {{c1::...}} válida', () => {
      expect(isValidGeneratedCard(validClozeCard)).toBe(true);
    });

    it('deve retornar false se front ou back estiverem vazios', () => {
      expect(isValidGeneratedCard({ ...validBasicCard, front: '' })).toBe(false);
      expect(isValidGeneratedCard({ ...validBasicCard, back: '' })).toBe(false);
    });

    it('deve retornar false se type for cloze mas o front não contiver sintaxe {{c1::...}}', () => {
      const invalidClozeCard = {
        type: 'cloze',
        front: 'Pergunta cloze sem marcadores de lacuna',
        back: 'Verso do card',
      };
      expect(isValidGeneratedCard(invalidClozeCard)).toBe(false);
    });
  });

  describe('validateDistracter', () => {
    const sourceExcerpt = 'Mesencéfalo: porção cranial contendo colículos superiores e substância negra dopaminérgica.';

    it('deve aprovar distrator conectado ao texto-fonte (match >= 40%)', () => {
      const result = validateDistracter(sourceExcerpt, 'Colículos superiores da visão', 'componente_relacionado');
      expect(result.valid).toBe(true);
    });

    it('deve reprovar distrator não conectado ao texto-fonte (match < 40%)', () => {
      const result = validateDistracter(sourceExcerpt, 'Fibras transversais da ponte', 'componente_relacionado');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('menos de 40% conectado');
    });
  });

  describe('ensureVariedCorrectLength', () => {
    it('deve verificar variação de tamanho para diferentes índices de questão', () => {
      // Q0: resposta correta mais curta
      const altsQ0 = [
        { text: 'Bulbo', isCorrect: true },
        { text: 'Porção cranial do mesencéfalo', isCorrect: false },
        { text: 'Fibras transversais da ponte', isCorrect: false },
        { text: 'Pedúnculos cerebrais superiores', isCorrect: false },
      ];
      expect(ensureVariedCorrectLength(altsQ0, 0)).toBe(true);

      // Q1: resposta correta mais longa
      const altsQ1 = [
        { text: 'Bulbo', isCorrect: false },
        { text: 'Ponte', isCorrect: false },
        { text: 'Mesencéfalo', isCorrect: false },
        { text: 'Estrutura caudal do tronco encefálico que aloja os centros vitais respiratórios', isCorrect: true },
      ];
      expect(ensureVariedCorrectLength(altsQ1, 1)).toBe(true);
    });
  });
});
