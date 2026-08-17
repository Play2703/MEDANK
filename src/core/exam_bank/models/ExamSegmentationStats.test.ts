import { describe, it, expect } from 'vitest';
import { calculateSegmentationStats } from '../../../domain/entities/KnowledgeAsset';

describe('calculateSegmentationStats - Limiares e Classificação de Confiança', () => {
  it('deve classificar como "ruim" quando o percentual de alta confiança for menor que 50%', () => {
    // 49% alta confiança
    const stats1 = calculateSegmentationStats(100, 49);
    expect(stats1.percent).toBe(49);
    expect(stats1.level).toBe('ruim');
    expect(stats1.highConfidenceCount).toBe(49);
    expect(stats1.lowConfidenceCount).toBe(51);

    // 0 questões
    const statsZero = calculateSegmentationStats(0, 0);
    expect(statsZero.percent).toBe(0);
    expect(statsZero.level).toBe('ruim');
    expect(statsZero.highConfidenceCount).toBe(0);
    expect(statsZero.lowConfidenceCount).toBe(0);

    // 49.9% (ex: 499 em 1000)
    const statsDecimal = calculateSegmentationStats(1000, 499);
    expect(statsDecimal.percent).toBe(49.9);
    expect(statsDecimal.level).toBe('ruim');
  });

  it('deve classificar como "medio" quando o percentual for entre 50% (inclusive) e 80% (exclusive)', () => {
    // Exatamente 50%
    const stats50 = calculateSegmentationStats(100, 50);
    expect(stats50.percent).toBe(50);
    expect(stats50.level).toBe('medio');

    // 75%
    const stats75 = calculateSegmentationStats(200, 150);
    expect(stats75.percent).toBe(75);
    expect(stats75.level).toBe('medio');

    // 79.9%
    const stats79 = calculateSegmentationStats(1000, 799);
    expect(stats79.percent).toBe(79.9);
    expect(stats79.level).toBe('medio');
  });

  it('deve classificar como "otimo" quando o percentual for maior ou igual a 80%', () => {
    // Exatamente 80%
    const stats80 = calculateSegmentationStats(100, 80);
    expect(stats80.percent).toBe(80);
    expect(stats80.level).toBe('otimo');

    // 96.8% (USP)
    const statsUSP = calculateSegmentationStats(633, 613, 20);
    expect(statsUSP.percent).toBe(96.8);
    expect(statsUSP.level).toBe('otimo');
    expect(statsUSP.highConfidenceCount).toBe(613);
    expect(statsUSP.lowConfidenceCount).toBe(20);

    // 100%
    const stats100 = calculateSegmentationStats(50, 50);
    expect(stats100.percent).toBe(100);
    expect(stats100.level).toBe('otimo');
  });
});
