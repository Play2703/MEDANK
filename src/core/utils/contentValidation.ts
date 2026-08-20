import { isClozeText } from './clozeParser';

/**
 * Whitelist de respostas curtas legítimas e termos médicos/anatômicos unipalavra conhecidos.
 */
const VALID_SHORT_ANSWERS_WHITELIST = new Set([
  'certo', 'errado', 'verdadeiro', 'falso', 'sim', 'nao', 'v', 'f',
  'bulbo', 'ponte', 'mesencefalo', 'cerebelo', 'talamo', 'hipotalamo',
  'cortex', 'medula', 'figado', 'rim', 'rins', 'baco', 'timo', 'linfonodo',
  'coracao', 'pulmao', 'pulmoes', 'estomago', 'pancreas', 'duodeno',
  'ileo', 'jejuno', 'colon', 'reto', 'anus', 'apendice', 'utero',
  'ovario', 'ovarios', 'testiculo', 'testiculos', 'prostata', 'bexiga',
  'uretra', 'ureter', 'tireoide', 'paratireoide', 'hipofise', 'adrenal',
  'supra-renal', 'pleura', 'pericardio', 'peritonio', 'diafragma',
  'traqueia', 'laringe', 'faringe', 'esofago', 'aorta', 'veia cava',
  'grau i', 'grau ii', 'grau iii', 'grau iv', 'tipo 1', 'tipo 2',
  'estagio i', 'estagio ii', 'estagio iii', 'estagio iv', 'classe i', 'classe ii',
  'classe iii', 'classe iv'
]);

/**
 * Validação de plausibilidade mínima por alternativa ou resposta correta:
 * - Rejeita strings vazias ou nulas
 * - Permite respostas curtas legítimas da whitelist (ex: "CERTO", "ERRADO", "Bulbo.")
 * - Rejeita strings muito curtas (< 4 chars) ou sem espaços com < 6 chars fora da whitelist
 * - Rejeita alternativas com > 30% de dígitos misturados com letras de forma não-numérica (ex: "p030")
 * - Rejeita strings curtas sem vogais ou com letras misturadas maiúsculas/minúsculas arbitrárias (ex: "dCb", "erbB", "umP")
 */
export function isValidOptionText(text: any): boolean {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed) return false;

  // Normalização para teste contra a whitelist de respostas curtas conhecidas
  const norm = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.:;!?,()[\]{}'"]/g, '')
    .trim();

  if (VALID_SHORT_ANSWERS_WHITELIST.has(norm)) {
    return true;
  }

  // Comprimento mínimo absoluto para palavras fora da whitelist
  if (trimmed.length < 4) {
    return false;
  }

  // Rejeita alternativas onde >30% dos caracteres são dígitos misturados com letras de forma não-numérica
  const digitCount = (trimmed.match(/\d/g) || []).length;
  const letterCount = (trimmed.match(/[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]/g) || []).length;
  const isNumericUnit =
    /\b(?:\d+(?:[\.,\/]\d+)*)\s*(?:mg|g|mcg|ml|dl|l|mmhg|bpm|meq|mmol|ui|%|anos|meses|dias|horas|minutos|grau|tipo|estagio|classe|ecg|tc|rm|x|vezes)\b/i.test(trimmed) ||
    /^\d+[\.,\/]\d+(?:\s*mmhg|\s*bpm|\s*mg|\s*g)?$/i.test(trimmed);

  if (!isNumericUnit && letterCount > 0 && digitCount > 0) {
    const digitRatio = digitCount / trimmed.length;
    if (digitRatio > 0.30) {
      return false;
    }
  }

  // Deve conter pelo menos uma vogal caso tenha menos de 15 caracteres (exceto expressões com unidades numéricas médicas conhecidas)
  const hasVowel = /[aeiouáéíóúâêîôûãõy]/i.test(trimmed);
  if (!hasVowel && !isNumericUnit && trimmed.length < 15) {
    return false;
  }

  // Padrão de mistura artificial de maiúsculas/minúsculas no meio de palavras sem espaço (ex: "erbB", "dCb", "umP")
  if (!trimmed.includes(' ') && trimmed.length <= 8 && /[a-z][A-Z]/.test(trimmed)) {
    return false;
  }

  // Deve conter pelo menos uma palavra alfabética com pelo menos 2 caracteres
  const words = trimmed.split(/\s+/).filter((w) => /[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]{2,}/.test(w));
  if (words.length === 0 && !isNumericUnit) {
    return false;
  }

  return true;
}

/**
 * Validates structural integrity of an AI-generated exam question
 */
export function isValidGeneratedQuestion(q: any): boolean {
  if (!q || typeof q !== 'object') return false;

  // 1. statement must be non-empty string with minimum reasonable length
  if (!q.statement || typeof q.statement !== 'string' || q.statement.trim().length < 10) {
    return false;
  }

  // 1.1 Se formato novo prescritivo com correctAnswerText (sem options geradas pela IA)
  if (q.correctAnswerText && typeof q.correctAnswerText === 'string') {
    if (!isValidOptionText(q.correctAnswerText)) {
      return false;
    }
    if (!q.commentary && !q.correctAnswerExplanation) {
      return false;
    }
    // Se tiver options também, valida as options
    if (Array.isArray(q.options) && q.options.length > 0) {
      if (q.options.length !== 4) return false;
      for (const opt of q.options) {
        if (!opt || typeof opt !== 'object' || !isValidOptionText(opt.text)) {
          return false;
        }
      }
    }
    return true;
  }

  // 2. options must be an array of length 4 (formato legado)
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return false;
  }

  // 3. Option items must be valid objects with plausible text
  for (const opt of q.options) {
    if (!opt || typeof opt !== 'object' || !isValidOptionText(opt.text)) {
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
