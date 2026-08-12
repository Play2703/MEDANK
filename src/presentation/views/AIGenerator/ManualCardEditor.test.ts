import { describe, it, expect } from 'vitest';
import {
  getNextClozeNumber,
  insertClozeMarkup,
  parseClozeText,
  convertPxToPercentage,
} from './ManualCardEditor';

describe('ManualCardEditor - Cloze Logic', () => {
  it('getNextClozeNumber - deve retornar 1 para texto sem clozes', () => {
    expect(getNextClozeNumber('Texto normal sem lacuna')).toBe(1);
  });

  it('getNextClozeNumber - deve calcular o próximo número corretamente', () => {
    const text = 'O sopro é {{c1::mesossistólico}} e irradia para {{c2::carótidas}}.';
    expect(getNextClozeNumber(text)).toBe(3);
  });

  it('insertClozeMarkup - deve envolver texto selecionado', () => {
    const text = 'Sopro aórtico';
    // Seleção de "aórtico" (índices 6 a 13)
    const result = insertClozeMarkup(text, 6, 13);
    expect(result.newText).toBe('Sopro {{c1::aórtico}}');
  });

  it('insertClozeMarkup - deve inserir placeholder se nenhuma seleção for feita', () => {
    const text = 'Estenose ';
    const result = insertClozeMarkup(text, 9, 9);
    expect(result.newText).toBe('Estenose {{c1::termo::dica}}');
  });

  it('parseClozeText - deve realizar o parse dos tokens cloze corretamente', () => {
    const text = 'Sopro {{c1::mesossistólico::fase}} aórtico';
    const tokens = parseClozeText(text);

    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ type: 'text', content: 'Sopro ' });
    expect(tokens[1]).toEqual({
      type: 'cloze',
      content: '{{c1::mesossistólico::fase}}',
      clozeNum: 1,
      answer: 'mesossistólico',
      hint: 'fase',
    });
    expect(tokens[2]).toEqual({ type: 'text', content: ' aórtico' });
  });
});

describe('ManualCardEditor - Image Occlusion Coordinate Conversions', () => {
  const containerBounds = { left: 100, top: 100, width: 400, height: 200 };

  it('convertPxToPercentage - converte coordenadas de pixel para porcentagem no container', () => {
    // Clique inicial em (200, 150), arrasto até (300, 200)
    // Relativo: x1=100 (25%), y1=50 (25%), x2=200 (50%), y2=100 (50%)
    const res = convertPxToPercentage(200, 150, 300, 200, containerBounds);
    expect(res).toEqual({
      x: 25,
      y: 25,
      width: 25,
      height: 25,
    });
  });

  it('convertPxToPercentage - trata arrasto para a esquerda/cima (coordenadas invertidas)', () => {
    // Clique inicial em (300, 200), arrasto para cima/esquerda até (200, 150)
    const res = convertPxToPercentage(300, 200, 200, 150, containerBounds);
    expect(res).toEqual({
      x: 25,
      y: 25,
      width: 25,
      height: 25,
    });
  });

  it('convertPxToPercentage - limita a porcentagem dentro dos limites 0-100%', () => {
    // Arrasto extrapolando o container à direita/baixo (600, 400)
    const res = convertPxToPercentage(200, 150, 600, 400, containerBounds);
    expect(res.x).toBe(25);
    expect(res.y).toBe(25);
    expect(res.x + res.width).toBeLessThanOrEqual(100);
    expect(res.y + res.height).toBeLessThanOrEqual(100);
  });
});

