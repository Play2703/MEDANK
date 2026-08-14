import { isClozeText } from './clozeParser';

/**
 * Validates structural integrity of an AI-generated exam question
 */
export function isValidGeneratedQuestion(q: any): boolean {
  if (!q || typeof q !== 'object') return false;

  // 1. statement must be non-empty string
  if (!q.statement || typeof q.statement !== 'string' || !q.statement.trim()) {
    return false;
  }

  // 1.1 Se formato novo prescritivo com correctAnswerText (sem options geradas pela IA)
  if (q.correctAnswerText && typeof q.correctAnswerText === 'string' && q.correctAnswerText.trim()) {
    if (!q.commentary && !q.correctAnswerExplanation) {
      return false;
    }
    return true;
  }

  // 2. options must be an array of length 4 (formato legado)
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return false;
  }


  // 3. Option items must be valid objects with text
  for (const opt of q.options) {
    if (!opt || typeof opt !== 'object' || !opt.text || typeof opt.text !== 'string' || !opt.text.trim()) {
      return false;
    }
  }

  // 4. Check correct option logic:
  // Must have EXACTLY one option with isCorrect: true
  // OR if isCorrect is not set on options, correctOptionLetter must correspond to a letter present in options
  const correctOptionsCount = q.options.filter((opt: any) => opt && opt.isCorrect === true).length;

  if (correctOptionsCount === 1) {
    // Valid: exactly 1 option has isCorrect: true
  } else if (correctOptionsCount === 0) {
    // Check if correctOptionLetter matches one of the option letters
    if (!q.correctOptionLetter || typeof q.correctOptionLetter !== 'string') {
      return false;
    }
    const matchingLetterOpt = q.options.find(
      (opt: any) => opt && typeof opt.letter === 'string' && opt.letter.toUpperCase() === q.correctOptionLetter.trim().toUpperCase()
    );
    if (!matchingLetterOpt) {
      return false;
    }
  } else {
    // More than 1 option marked correct -> invalid
    return false;
  }

  // 5. commentary must be non-empty (string or object)
  if (!q.commentary) {
    return false;
  }
  if (typeof q.commentary === 'string' && !q.commentary.trim()) {
    return false;
  }
  if (typeof q.commentary === 'object' && Object.keys(q.commentary).length === 0) {
    return false;
  }

  return true;
}

/**
 * Validates structural integrity of an AI-generated flashcard
 */
export function isValidGeneratedCard(c: any): boolean {
  if (!c || typeof c !== 'object') return false;

  // 1. front and back must be non-empty strings
  if (!c.front || typeof c.front !== 'string' || !c.front.trim()) {
    return false;
  }
  if (!c.back || typeof c.back !== 'string' || !c.back.trim()) {
    return false;
  }

  // 2. If type === 'cloze', front must contain cloze deletion syntax {{c\d+::...}}
  if (c.type === 'cloze' && !isClozeText(c.front)) {
    return false;
  }

  return true;
}
