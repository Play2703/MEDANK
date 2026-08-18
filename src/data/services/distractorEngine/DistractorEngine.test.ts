import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { distractorEngine } from './DistractorEngine';
import { CONFUSION_SETS } from './confusionSets';

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

  it('deve usar fallback estático quando o tópico casar com o contexto do ConfusionSet', async () => {
    const candidates = await distractorEngine.getCandidates({
      topicCanonicalKeys: [],
      specialty: 'Cardiologia',
      topics: ['Hipertensão Arterial'],
      limit: 5,
    });

    expect(candidates).toBeDefined();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.source === 'banco_estatico')).toBe(true);
    const texts = candidates.map((c) => c.text);
    expect(texts).toContain('Inibidor da ECA (IECA)');
    expect(texts).toContain('Bloqueador do Receptor de Angiotensina (BRA)');
  });

  it('TAREFA 3: getStaticCandidates NÃO deve incluir Pré-carga/Pós-carga/Contratilidade para questão de Transporte de Gases / Efeito Bohr', () => {
    const staticCandidates = distractorEngine.getStaticCandidates(
      'Efeito Bohr',
      'Fisiologia',
      ['Transporte de Gases no Sangue', 'Fisiologia Respiratória']
    );

    const texts = staticCandidates.map((c) => c.text);
    expect(texts).not.toContain('Pré-carga');
    expect(texts).not.toContain('Pós-carga');
    expect(texts).not.toContain('Contratilidade');
    expect(texts).not.toContain('Complacência Ventricular');
    // Como não há confusion set específico para transporte de gases, deve retornar vazio
    expect(staticCandidates).toEqual([]);
  });

  it('deve incluir determinantes do débito cardíaco quando o contexto for de Débito Cardíaco / Ciclo Cardíaco', () => {
    const staticCandidates = distractorEngine.getStaticCandidates(
      'Fração de Ejeção',
      'Fisiologia',
      ['Débito Cardíaco e Hemodinâmica', 'Ciclo Cardíaco']
    );

    const texts = staticCandidates.map((c) => c.text);
    expect(texts).toContain('Pré-carga');
    expect(texts).toContain('Pós-carga');
    expect(texts).toContain('Contratilidade');
    expect(texts).toContain('Complacência Ventricular');
  });

  it('deve incluir o ConfusionSet quando a resposta correta for um membro conhecido (isMemberMatch)', () => {
    const staticCandidates = distractorEngine.getStaticCandidates(
      'Pré-carga',
      'Fisiologia',
      ['Outro Tópico Geral']
    );

    const texts = staticCandidates.map((c) => c.text);
    // Exclui a própria resposta correta ('Pré-carga')
    expect(texts).not.toContain('Pré-carga');
    // Inclui os outros membros do set
    expect(texts).toContain('Pós-carga');
    expect(texts).toContain('Contratilidade');
    expect(texts).toContain('Complacência Ventricular');
  });

  it('deve validar que todos os CONFUSION_SETS possuem contextos específicos sem strings genéricas', () => {
    for (const set of CONFUSION_SETS) {
      expect(set.context.length).toBeGreaterThan(0);
      for (const ctx of set.context) {
        expect(ctx.trim().length).toBeGreaterThan(1);
        // Não deve ser apenas a especialidade crua genérica
        expect(['fisiologia', 'medicina', 'clinica', 'cirurgia']).not.toContain(ctx.toLowerCase().trim());
      }
    }
  });
});
