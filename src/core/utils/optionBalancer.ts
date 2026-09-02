import { Question, QuestionOption } from '../../domain/entities/Question';

/**
 * Option Balancer & Shuffler for Question Sets
 *
 * Post-processing step to shuffle option positions (A-E) per question
 * while enforcing a balanced distribution of correct answers across the entire set
 * and preventing 3 or more consecutive identical correct answer letters.
 */

/**
 * Fisher-Yates shuffle array helper
 */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Checks if a sequence of letters contains 3 or more consecutive identical letters
 */
function hasConsecutiveStreak(letters: string[], streakLength = 3): boolean {
  if (letters.length < streakLength) return false;
  let currentStreak = 1;
  for (let i = 1; i < letters.length; i++) {
    if (letters[i] === letters[i - 1]) {
      currentStreak++;
      if (currentStreak >= streakLength) return true;
    } else {
      currentStreak = 1;
    }
  }
  return false;
}

/**
 * Generates a balanced sequence of target correct option letters (A, B, C, D...)
 * for a total number of questions using drawing without replacement in cycles.
 */
export function generateBalancedTargetLetters(totalQuestions: number, optionCount = 4): string[] {
  if (totalQuestions <= 0) return [];

  const availableLetters = Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));
  const targetLetters: string[] = [];

  while (targetLetters.length < totalQuestions) {
    const cycle = shuffleArray(availableLetters);
    for (const letter of cycle) {
      if (targetLetters.length >= totalQuestions) break;
      targetLetters.push(letter);
    }
  }

  // Resolve any 3+ consecutive streaks by swapping elements
  let attempts = 0;
  const maxAttempts = 100;

  while (hasConsecutiveStreak(targetLetters) && attempts < maxAttempts) {
    attempts++;
    for (let i = 0; i < targetLetters.length - 2; i++) {
      if (targetLetters[i] === targetLetters[i + 1] && targetLetters[i + 1] === targetLetters[i + 2]) {
        // Find a random index to swap with that fixes or doesn't break streak
        const swapIdx = Math.floor(Math.random() * totalQuestions);
        const temp = targetLetters[i + 2];
        targetLetters[i + 2] = targetLetters[swapIdx];
        targetLetters[swapIdx] = temp;
      }
    }
  }

  return targetLetters;
}

/**
 * Shuffles option positions and balances correct option letters across a QuestionSet.
 */
export function balanceAndShuffleQuestionOptions(questions: Question[]): Question[] {
  if (!questions || questions.length === 0) return [];

  const totalQuestions = questions.length;
  // Assume default 4 options if unspecified
  const sampleOptionCount = questions[0]?.options?.length || 4;
  const targetLetters = generateBalancedTargetLetters(totalQuestions, sampleOptionCount);

  return questions.map((q, qIdx) => {
    const rawOptions = q.options || [];
    if (rawOptions.length === 0) return q;

    // Find the correct option
    const correctOpt = rawOptions.find((o) => o.isCorrect || o.id === q.correctOptionId) || rawOptions[0];
    const distractors = rawOptions.filter((o) => o !== correctOpt);

    // Determine target letter index for correct answer
    const targetLetter = targetLetters[qIdx] || 'A';
    let targetIndex = targetLetter.charCodeAt(0) - 65;
    if (targetIndex < 0 || targetIndex >= rawOptions.length) {
      targetIndex = 0;
    }

    // Shuffle distractors
    const shuffledDistractors = shuffleArray(distractors);

    // Build new options list with correct option placed at targetIndex
    const newRawOptions: QuestionOption[] = [];
    let distractorIdx = 0;

    for (let i = 0; i < rawOptions.length; i++) {
      if (i === targetIndex) {
        newRawOptions.push(correctOpt);
      } else {
        newRawOptions.push(shuffledDistractors[distractorIdx++]);
      }
    }

    // Re-assign letters (A, B, C, D...) and unique IDs
    const finalOptions: QuestionOption[] = newRawOptions.map((opt, idx) => {
      const letter = String.fromCharCode(65 + idx);
      const isCorrect = opt === correctOpt;
      return {
        id: `opt-${q.id}-${letter}`,
        letter,
        text: sanitizeTextEncoding(opt.text),
        isCorrect,
        explanation: opt.explanation ? sanitizeTextEncoding(opt.explanation) : undefined,
      };
    });

    const newCorrectOpt = finalOptions.find((o) => o.isCorrect) || finalOptions[0];

    // If commentary is structured, re-map porOpcao letters to match new option positions
    let updatedCommentary = q.commentary;
    if (typeof q.commentary === 'object' && q.commentary !== null) {
      const commObj = { ...(q.commentary as any) };
      if (commObj.porOpcao) {
        const oldPorOpcao = commObj.porOpcao || {};
        const newPorOpcao: Record<string, string> = {};
        finalOptions.forEach((opt, idx) => {
          const originalOpt = newRawOptions[idx];
          const oldLetter = originalOpt.letter;
          const explanation = oldPorOpcao[oldLetter] || originalOpt.explanation || '';
          newPorOpcao[opt.letter] = sanitizeTextEncoding(explanation);
        });
        commObj.porOpcao = newPorOpcao;
      }

      if (commObj.correta) {
        let corretaText = sanitizeTextEncoding(String(commObj.correta));
        const oldLetter = correctOpt.letter;
        const newLetter = newCorrectOpt.letter;
        if (oldLetter && newLetter && oldLetter !== newLetter) {
          corretaText = corretaText.replace(
            new RegExp(`\\b(alternativa|letra|op[çc][ãa]o)\\s+${oldLetter}\\b`, 'gi'),
            `$1 ${newLetter}`
          );
        }
        commObj.correta = corretaText;
      }

      if (commObj.correlacaoClinica) {
        commObj.correlacaoClinica = sanitizeTextEncoding(commObj.correlacaoClinica);
      }

      updatedCommentary = commObj;
    }

    return {
      ...q,
      statement: sanitizeTextEncoding(q.statement),
      clinicalContext: q.clinicalContext ? sanitizeTextEncoding(q.clinicalContext) : undefined,
      sourceContextExcerpt: q.sourceContextExcerpt
        ? sanitizeTextEncoding(q.sourceContextExcerpt)
        : undefined,
      options: finalOptions,
      correctOptionId: newCorrectOpt.id,
      commentary: updatedCommentary,
    };
  });
}

/**
 * Sanitiza problemas comuns de encoding, caracteres gregos corrompidos e mojibake
 */
export function sanitizeTextEncoding(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/Â(?=[\s\u00A0-\u00BF\u0370-\u03FF\u2070-\u209F])/g, '')
    .replace(/TNF[-_\s]*[Â;]\s*α?/gi, 'TNF-α')
    .replace(/PGE[-_\s]*[Â;]?\s*2/gi, 'PGE₂')
    .replace(/PGE[-_\s]*[Â;]?\s*₂/gi, 'PGE₂')
    .replace(/â€œ|â€\s*|“|”/g, '"')
    .replace(/â€˜|â€™|’|‘/g, "'")
    .replace(/â€“|â€”/g, '—')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã£/g, 'ã')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã€/g, 'à')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‡/g, 'Ç');
}
