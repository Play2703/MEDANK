import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { distractorEngine } from './DistractorEngine';
import { BASIC_CYCLE_SPECIALTIES, CLINICAL_CYCLE_SPECIALTIES } from '../../curriculumTopics';

describe('DistractorEngine - Graph & ConfusionSets Integration', () => {
  beforeEach(async () => {
    await db.graphEdges.clear();
    await db.canonicalEntityIndex.clear();
  });

  it('deve retornar candidatos do grafo quando topicCanonicalKeys é informado e possui conexões em db.graphEdges', async () => {
    const now = new Date().toISOString();

    // Popula o índice canônico
    await db.canonicalEntityIndex.bulkPut([
      {
        canonicalKey: 'captopril',
        type: 'medication',
        displayText: 'Captopril',
        code_system: 'DeCS',
        code: null,
        seenTexts: ['captopril', 'captoprila'],
        assetIds: ['asset-cardio'],
        occurrenceCount: 5,
        updatedAt: now,
      },
      {
        canonicalKey: 'losartana',
        type: 'medication',
        displayText: 'Losartana Potássica',
        code_system: 'DeCS',
        code: null,
        seenTexts: ['losartana', 'losartan'],
        assetIds: ['asset-cardio'],
        occurrenceCount: 4,
        updatedAt: now,
      },
    ]);

    // Popula as arestas do grafo relacional
    await db.graphEdges.bulkPut([
      {
        id: 'enalapril::trata::hipertensao_arterial',
        subjectCanonicalKey: 'enalapril',
        predicate: 'trata',
        objectCanonicalKey: 'hipertensao_arterial',
        occurrenceCount: 3,
        maxConfidence: 0.95,
        assetIds: ['asset-cardio'],
        updatedAt: now,
      },
      {
        id: 'losartana::trata::hipertensao_arterial',
        subjectCanonicalKey: 'losartana',
        predicate: 'trata',
        objectCanonicalKey: 'hipertensao_arterial',
        occurrenceCount: 2,
        maxConfidence: 0.9,
        assetIds: ['asset-cardio'],
        updatedAt: now,
      },
      {
        id: 'captopril::trata::hipertensao_arterial',
        subjectCanonicalKey: 'captopril',
        predicate: 'trata',
        objectCanonicalKey: 'hipertensao_arterial',
        occurrenceCount: 4,
        maxConfidence: 0.92,
        assetIds: ['asset-cardio'],
        updatedAt: now,
      },
    ]);

    const candidates = await distractorEngine.getCandidates({
      topicCanonicalKeys: ['enalapril'],
      specialty: 'Cardiologia',
      topics: ['Hipertensão Arterial'],
      limit: 5,
    });

    expect(candidates).toBeDefined();
    expect(candidates.length).toBeGreaterThan(0);

    // Deve conter os candidatos dinâmicos do grafo relacional
    const graphCandidates = candidates.filter((c) => c.source === 'grafo');
    expect(graphCandidates.length).toBeGreaterThan(0);
    const candidateTexts = graphCandidates.map((c) => c.text);
    expect(candidateTexts).toContain('Losartana Potássica');
    expect(candidateTexts).toContain('Captopril');
  });

  it('deve usar fallback estático de forma transparente quando topicCanonicalKeys estiver vazio', async () => {
    const candidates = await distractorEngine.getCandidates({
      topicCanonicalKeys: [],
      specialty: 'Cardiologia',
      topics: ['Insuficiência Cardíaca'],
      limit: 5,
    });

    expect(candidates).toBeDefined();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.source === 'banco_estatico')).toBe(true);
  });

  it('deve retornar candidatos estáticos válidos para cada especialidade do Ciclo Básico', async () => {
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

  it('deve retornar candidatos estáticos válidos para especialidades principais do Ciclo Clínico', async () => {
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
