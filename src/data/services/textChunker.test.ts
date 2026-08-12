import { describe, it, expect } from 'vitest';
import { chunkText } from './textChunker';

describe('textChunker', () => {
  it('deve retornar [] para texto vazio ou espaços em branco', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('deve retornar 1 único chunk para texto menor que o limite máximo de tokens', () => {
    const text = 'Paciente do sexo masculino, 45 anos, com queixa de dor torácica atípica.';
    const result = chunkText(text, 500, 50);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it('deve gerar múltiplos chunks para texto grande com múltiplos parágrafos', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Parágrafo ${i + 1}: O infarto agudo do miocárdio representa uma causa importante de morbimortalidade cardiovascular em adultos.`
    );
    const largeText = paragraphs.join('\n\n');

    const result = chunkText(largeText, 50, 10);
    expect(result.length).toBeGreaterThan(1);
  });

  it('deve manter overlap não vazio entre chunks consecutivos quando o texto excede o limite', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Frase número ${i + 1} sobre semiologia médica.`).join(' ');
    const result = chunkText(text, 20, 5);

    expect(result.length).toBeGreaterThan(1);
    const chunk1 = result[0];
    const chunk2 = result[1];

    // Some words from the end of chunk1 should appear in chunk2 due to overlap
    const words1 = chunk1.split(' ');
    const lastWords1 = words1.slice(-3).join(' ');
    expect(chunk2.includes(lastWords1.split(' ')[0])).toBe(true);
  });
});
