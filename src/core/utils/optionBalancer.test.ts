import { describe, it, expect } from 'vitest';
import { balanceAndShuffleQuestionOptions, generateBalancedTargetLetters } from './optionBalancer';
import { Question } from '../../domain/entities/Question';

describe('Option Balancer & Shuffler', () => {
  it('deve gerar uma distribuição balanceada de letras alvo sem 3+ repetições consecutivas', () => {
    const totalQ = 20;
    const targetLetters = generateBalancedTargetLetters(totalQ, 4);

    expect(targetLetters).toHaveLength(totalQ);

    // Check no 3 consecutive identical letters
    for (let i = 0; i < targetLetters.length - 2; i++) {
      const consecutiveThree =
        targetLetters[i] === targetLetters[i + 1] && targetLetters[i + 1] === targetLetters[i + 2];
      expect(consecutiveThree).toBe(false);
    }

    // Check that no single letter appears more than 40% of the time (for 20 questions, 40% is 8)
    const letterCounts: Record<string, number> = {};
    targetLetters.forEach((l) => {
      letterCounts[l] = (letterCounts[l] || 0) + 1;
    });

    Object.entries(letterCounts).forEach(([letter, count]) => {
      const percentage = count / totalQ;
      expect(percentage).toBeLessThanOrEqual(0.4);
    });
  });

  it('deve embaralhar e atribuir corretamente as opções e correctOptionId para um QuestionSet fake de 20 questões', () => {
    const mockQuestions: Question[] = Array.from({ length: 20 }, (_, idx) => {
      const qId = `q-${idx + 1}`;
      return {
        id: qId,
        setId: 'set-test',
        statement: `Questão de teste #${idx + 1}`,
        options: [
          { id: `opt-${qId}-A`, letter: 'A', text: 'Opção Absurda (Errada)', isCorrect: false, explanation: 'Errado' },
          { id: `opt-${qId}-B`, letter: 'B', text: 'Opção Correta Oficial', isCorrect: true, explanation: 'Correto' },
          { id: `opt-${qId}-C`, letter: 'C', text: 'Opção Incorreta C', isCorrect: false, explanation: 'Errado' },
          { id: `opt-${qId}-D`, letter: 'D', text: 'Opção Incorreta D', isCorrect: false, explanation: 'Errado' },
        ],
        correctOptionId: `opt-${qId}-B`,
        commentary: 'Comentário da questão',
        specialty: 'Medicina',
        topic: 'Testes',
        difficulty: 'media',
        questionType: 'caso_clinico',
        isAnswered: false,
        createdAt: new Date().toISOString(),
      };
    });

    const balancedQuestions = balanceAndShuffleQuestionOptions(mockQuestions);

    expect(balancedQuestions).toHaveLength(20);

    const correctLettersSequence: string[] = [];
    const counts: Record<string, number> = {};

    balancedQuestions.forEach((q) => {
      // Find option marked as correct
      const correctOpt = q.options.find((o) => o.isCorrect);
      expect(correctOpt).toBeDefined();
      expect(correctOpt?.text).toBe('Opção Correta Oficial');
      expect(q.correctOptionId).toBe(correctOpt?.id);

      // Collect letter
      const letter = correctOpt!.letter;
      correctLettersSequence.push(letter);
      counts[letter] = (counts[letter] || 0) + 1;

      // Verify letters A, B, C, D are properly formatted
      q.options.forEach((opt, oIdx) => {
        expect(opt.letter).toBe(String.fromCharCode(65 + oIdx));
      });
    });

    // Verify max repetition sequence < 3
    for (let i = 0; i < correctLettersSequence.length - 2; i++) {
      const isThreeSeq =
        correctLettersSequence[i] === correctLettersSequence[i + 1] &&
        correctLettersSequence[i + 1] === correctLettersSequence[i + 2];
      expect(isThreeSeq).toBe(false);
    }

    // Verify frequency of any single letter <= 40% (8/20)
    Object.values(counts).forEach((cnt) => {
      expect(cnt / 20).toBeLessThanOrEqual(0.4);
    });
  });
});
