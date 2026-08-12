import { describe, it, expect } from 'vitest';
import { distractorEngine } from './DistractorEngine';
import { BASIC_CYCLE_SPECIALTIES, CLINICAL_CYCLE_SPECIALTIES } from '../../curriculumTopics';

describe('DistractorEngine - ConfusionSets Expansion', () => {
  it('deve retornar candidatos estáticos válidos (não vazios) para cada especialidade do Ciclo Básico', async () => {
    for (const specialty of BASIC_CYCLE_SPECIALTIES) {
      const candidates = await distractorEngine.getCandidates({
        correctAnswerText: 'Exemplo de conceito',
        specialty,
        topics: [specialty],
        limit: 5,
      });

      expect(candidates).toBeDefined();
      expect(candidates.length).toBeGreaterThan(0);
    }
  });

  it('deve retornar candidatos estáticos válidos (não vazios) para especialidades principais do Ciclo Clínico', async () => {
    const targetClinical = [
      'Clínica Médica',
      'Cardiologia',
      'Pneumologia',
      'Gastroenterologia',
      'Nefrologia',
      'Endocrinologia',
      'Hematologia',
      'Reumatologia',
      'Neurologia',
      'Psiquiatria',
      'Dermatologia',
      'Oftalmologia',
      'Otorrinolaringologia',
      'Urologia',
      'Cirurgia Geral',
      'Ortopedia e Traumatologia',
      'Ginecologia e Obstetrícia',
      'Pediatria',
      'Infectologia',
      'Medicina de Família e Comunidade',
    ];

    for (const specialty of targetClinical) {
      const candidates = await distractorEngine.getCandidates({
        correctAnswerText: 'Exemplo de conduta clínica',
        specialty,
        topics: [specialty],
        limit: 5,
      });

      expect(candidates).toBeDefined();
      expect(candidates.length).toBeGreaterThan(0);
    }
  });
});
