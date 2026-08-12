/**
 * Anki Cloze Deletion Utility Parser
 * Parses {{c1::answer::hint}} syntax for medical flashcards.
 */

export interface ClozeToken {
  type: 'text' | 'cloze';
  content: string;
  answer?: string;
  hint?: string;
  clozeIndex?: number;
}

export function parseClozeText(rawText: string, targetIndex: number = 1): ClozeToken[] {
  if (!rawText) return [];

  // Regex matching {{c1::answer}} or {{c1::answer::hint}}
  const clozeRegex = /\{\{c(\d+)::([^}:]+)(?:::([^}]+))?\}\}/g;

  const tokens: ClozeToken[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = clozeRegex.exec(rawText)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({
        type: 'text',
        content: rawText.substring(lastIdx, match.index),
      });
    }

    const cIndex = parseInt(match[1], 10);
    const answer = match[2];
    const hint = match[3] || undefined;

    tokens.push({
      type: 'cloze',
      content: match[0],
      answer,
      hint,
      clozeIndex: cIndex,
    });

    lastIdx = clozeRegex.lastIndex;
  }

  if (lastIdx < rawText.length) {
    tokens.push({
      type: 'text',
      content: rawText.substring(lastIdx),
    });
  }

  return tokens;
}

/**
 * Checks whether text contains cloze deletion markers
 */
export function isClozeText(text: string): boolean {
  return /\{\{c\d+::.*?\}\}/.test(text);
}
