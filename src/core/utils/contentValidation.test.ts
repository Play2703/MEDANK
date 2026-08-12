import { describe, it, expect } from 'vitest';
import { isValidGeneratedQuestion, isValidGeneratedCard } from './contentValidation';

describe('contentValidation', () => {
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
});
