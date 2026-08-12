import { describe, it, expect } from 'vitest';
import { DocumentParserService } from './DocumentParserService';

describe('DocumentParserService', () => {
  const service = new DocumentParserService();

  it('deve retornar true para texto médico real em português', () => {
    const realMedicalText = `
      Paciente do sexo masculino, 58 anos, com histórico de hipertensão arterial sistêmica e diabetes mellitus tipo 2,
      dar entrada na emergência com queixa de dor precordial em aperto, irradiada para o membro superior esquerdo,
      associada a diaforese e dispneia aos mínimos esforços. Ao exame físico, apresenta-se normotenso, com bulhas cardíacas rítmicas.
      Eletrocardiograma de 12 derivadas evidencia supra de ST nas derivações V1 a V4.
    `;

    expect(service.isLikelyValidExtractedText(realMedicalText)).toBe(true);
  });

  it('deve retornar false para lixo binário decodificado de PDF/DOCX (replacement chars e bytes de controle)', () => {
    const binaryGarbage = `\uFFFD\uFFFD\u0000\u0001\u0002PK\u0003\u0004\u0014\u0000\u0006\u0000\u0008\u0000\uFFFD\uFFFD\uFFFD\uFFFD word/document.xml \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD`;

    expect(service.isLikelyValidExtractedText(binaryGarbage)).toBe(false);
  });

  it('deve retornar false para texto muito curto ou vazio', () => {
    expect(service.isLikelyValidExtractedText('')).toBe(false);
    expect(service.isLikelyValidExtractedText('   ')).toBe(false);
    expect(service.isLikelyValidExtractedText('Texto curto')).toBe(false);
  });
});
