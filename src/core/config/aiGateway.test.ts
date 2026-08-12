import { describe, it, expect } from 'vitest';
import { parseJsonLoose } from './aiGateway';

describe('parseJsonLoose', () => {
  it('deve fazer parse de uma string JSON pura', () => {
    const raw = '{"success": true, "items": [1, 2, 3]}';
    const parsed = parseJsonLoose(raw);
    expect(parsed).toEqual({ success: true, items: [1, 2, 3] });
  });

  it('deve fazer parse de JSON envolto em bloco markdown ```json ... ```', () => {
    const raw = '```json\n{\n  "title": "Cardiologia",\n  "count": 5\n}\n```';
    const parsed = parseJsonLoose(raw);
    expect(parsed).toEqual({ title: 'Cardiologia', count: 5 });
  });

  it('deve lançar erro ao receber JSON malformado', () => {
    const raw = '{"title": "Incompleto", ';
    expect(() => parseJsonLoose(raw)).toThrow();
  });
});
