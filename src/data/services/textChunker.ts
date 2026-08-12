/**
 * Real Text Chunker for Medical Knowledge Assets
 *
 * Chunks long text into chunks of ~500-800 tokens with 50-token overlap.
 * Pure function with zero dependencies on dead modules.
 */

export function chunkText(
  text: string,
  maxTokensPerChunk: number = 500,
  overlapTokens: number = 50
): string[] {
  if (!text || !text.trim()) return [];

  // Rough estimation: 1 token ~ 4 characters
  const maxChars = maxTokensPerChunk * 4;
  const overlapChars = overlapTokens * 4;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + '\n\n' + paragraph).length <= maxChars) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        // Overlap: take trailing portion of currentChunk
        const tail = currentChunk.slice(-overlapChars);
        currentChunk = `${tail}\n\n${paragraph}`;
      } else {
        // Single paragraph larger than maxChars: split by sentences
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        let subChunk = '';
        for (const sentence of sentences) {
          if ((subChunk + ' ' + sentence).length <= maxChars) {
            subChunk = subChunk ? `${subChunk} ${sentence}` : sentence;
          } else {
            if (subChunk) chunks.push(subChunk);
            subChunk = sentence;
          }
        }
        if (subChunk) currentChunk = subChunk;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
