/**
 * Term Extraction Utility for Compact Anti-Duplication Prompt Summaries
 * Extracts essential medical concepts/nouns from question statements or flashcard fronts
 * while stripping Portuguese stopwords, saving 60-80% of prompt tokens.
 */

const PT_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'por', 'pela', 'pelo',
  'com', 'sem', 'para', 'que', 'qual', 'quais', 'uma', 'um', 'umas', 'uns', 'o', 'a',
  'os', 'as', 'se', 'esta', 'este', 'estao', 'paciente', 'anos', 'quadro', 'apresenta',
  'relata', 'refere', 'exame', 'sobre', 'como', 'mais', 'menos', 'entre', 'após', 'apos',
  'sua', 'seu', 'suas', 'seus', 'onde', 'quando', 'deve', 'ser', 'sao', 'tem', 'tinha'
]);

/**
 * Extracts 3 to 6 essential key terms from a text string
 */
export function extractCompactKeyTerms(text: string, maxTerms = 5): string {
  if (!text) return '';
  // Remove cloze syntax {{c1::term::hint}} -> term
  const cleaned = text.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1');
  const words = cleaned
    .replace(/[^\w\s\u00C0-\u024F-]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && !PT_STOPWORDS.has(w));
  
  const uniqueTerms = Array.from(new Set(words)).slice(0, maxTerms);
  return uniqueTerms.join(' ');
}

/**
 * Formats a list of generated item statements into a compact anti-duplication block,
 * capped at the most recent maxItems (e.g. 30 items)
 */
export function formatCompactAntiDuplicationList(items: string[], maxItems = 30): string {
  if (!items || items.length === 0) return '';
  const recentItems = items.slice(-maxItems);
  const compactLines = recentItems
    .map((item) => extractCompactKeyTerms(item))
    .filter(Boolean);
  return compactLines.map((t) => `- ${t}`).join('\n');
}
