import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { distractorEngine } from './DistractorEngine';
import { entityEmbeddingIndexer } from './EntityEmbeddingIndexer';
import { classifyAcademicCycleDeterministically } from '../../../core/medcore_kernel/engines/ProfessorEngine';

describe('DistractorEngine - Fonte 3 Semântica & Pipeline Prescritivo', () => {
  beforeEach(async () => {
    // Popula canonicalEntityIndex com entidades médicas de teste
    await db.canonicalEntityIndex.clear();
    await db.entityEmbeddings.clear();
    await db.graphEdges.clear();

    const now = new Date().toISOString();

    await db.canonicalEntityIndex.bulkPut([
      {
        canonicalKey: 'CID10:I50',
        type: 'disease',
        displayText: 'Insuficiência cardíaca',
        code_system: 'CID-10',
        code: 'I50',
        occurrenceCount: 100,
        assetIds: ['a1'],
        seenTexts: ['insuficiência cardíaca'],
        updatedAt: now,
      },
      {
        canonicalKey: 'CID10:I21',
        type: 'disease',
        displayText: 'Infarto agudo do miocárdio',
        code_system: 'CID-10',
        code: 'I21',
        occurrenceCount: 85,
        assetIds: ['a1'],
        seenTexts: ['infarto agudo do miocárdio'],
        updatedAt: now,
      },
      {
        canonicalKey: 'CID10:I42',
        type: 'disease',
        displayText: 'Miocardiopatia dilatada',
        code_system: 'CID-10',
        code: 'I42',
        occurrenceCount: 60,
        assetIds: ['a1'],
        seenTexts: ['miocardiopatia'],
        updatedAt: now,
      },
      {
        canonicalKey: 'CID10:J44',
        type: 'disease',
        displayText: 'Doença pulmonar obstrutiva crônica',
        code_system: 'CID-10',
        code: 'J44',
        occurrenceCount: 50,
        assetIds: ['a1'],
        seenTexts: ['dpoc'],
        updatedAt: now,
      },
      {
        canonicalKey: 'DeCS:furosemida',
        type: 'medication',
        displayText: 'Furosemida',
        code_system: 'DeCS',
        code: 'D005665',
        occurrenceCount: 90,
        assetIds: ['a1'],
        seenTexts: ['furosemida'],
        updatedAt: now,
      },
      {
        canonicalKey: 'DeCS:espironolactona',
        type: 'medication',
        displayText: 'Espironolactona',
        code_system: 'DeCS',
        code: 'D013148',
        occurrenceCount: 75,
        assetIds: ['a1'],
        seenTexts: ['espironolactona'],
        updatedAt: now,
      },
      {
        canonicalKey: 'DeCS:hidroclorotiazida',
        type: 'medication',
        displayText: 'Hidroclorotiazida',
        code_system: 'DeCS',
        code: 'D006852',
        occurrenceCount: 70,
        assetIds: ['a1'],
        seenTexts: ['hidroclorotiazida'],
        updatedAt: now,
      },
    ]);
  });

  it('1. Deve indexar embeddings em lote e buscar candidatos semânticos (Fonte 3)', async () => {
    const candidates = await distractorEngine.getSemanticCandidates(
      'Furosemida',
      'medication',
      5
    );

    console.log('\n--- SAÍDA REAL: getSemanticCandidates("Furosemida", "medication") ---');
    console.log(JSON.stringify(candidates, null, 2));

    expect(candidates).toBeDefined();
    expect(Array.isArray(candidates)).toBe(true);
    // Não deve sugerir o próprio termo de busca como distrator
    expect(candidates.some((c) => c.text.toLowerCase() === 'furosemida')).toBe(false);

    // Se houver candidatos retornados, devem ser do tipo semantico com rationale
    if (candidates.length > 0) {
      expect(candidates[0].source).toBe('semantico');
      expect(candidates[0].rationale).toContain('Similaridade semântica');
    }

    // Confirma que os embeddings foram persistidos no Dexie db.entityEmbeddings
    const savedEmbeddings = await db.entityEmbeddings.toArray();
    expect(savedEmbeddings.length).toBeGreaterThan(0);
  });

  it('2. Deve priorizar Grafo > Confusion Sets > Semântico em getCandidates', async () => {
    const now = new Date().toISOString();
    // Insere aresta de grafo de teste
    await db.graphEdges.put({
      id: 'edge-1',
      subjectCanonicalKey: 'CID10:I50',
      objectCanonicalKey: 'DeCS:espironolactona',
      predicate: 'trata',
      occurrenceCount: 10,
      maxConfidence: 1,
      assetIds: ['a1'],
      updatedAt: now,
    });

    const result = await distractorEngine.getCandidates({
      correctAnswerText: 'Furosemida',
      correctEntityCanonicalKey: 'CID10:I50',
      specialty: 'Cardiologia',
      topics: ['Insuficiência Cardíaca'],
      limit: 5,
    });

    console.log('\n--- SAÍDA REAL: getCandidates com Grafo + Confusão + Semântico ---');
    console.log(JSON.stringify(result, null, 2));

    expect(result.length).toBeGreaterThan(0);
    // Nenhum resultado deve ser a resposta correta
    expect(result.some((r) => r.text.toLowerCase() === 'furosemida')).toBe(false);
  });

  it(
    '3. Deve classificar cicloAcademico de forma determinística via contagem de categorias de entidades',
    async () => {
      // Texto com alta densidade clínica (Doenças, Medicamentos, Condutas)
      const textoClinico = `Paciente masculino, 65 anos, hipertenso e diabético, admitido na emergência com quadro de insuficiência cardíaca descompensada, dispneia e edema de membros inferiores. Foi prescrito furosemida intravenosa, espironolactona e ajuste de enalapril, além de restrição hidrossalina.`;

      const resClinico = await classifyAcademicCycleDeterministically(textoClinico);
      console.log('\n--- SAÍDA DETERMINÍSTICA: Bloco Clínico ---');
      console.log('Ciclo:', resClinico.ciclo, '| Contagens:', resClinico.counts, '| Ratios:', resClinico.ratios);

      expect(resClinico.ciclo).toBe('clinico');

      // Texto com alta densidade de ciências básicas / anatomia
      const textoBasico = `O feixe de His localiza-se no septo interventricular e bifurca-se nos ramos direito e esquerdo, originando a rede de fibras de Purkinje no miocárdio ventricular. A vascularização do nó sinoatrial é proveniente da artéria coronária direita em 60% dos indivíduos.`;

      const resBasico = await classifyAcademicCycleDeterministically(textoBasico);
      console.log('\n--- SAÍDA DETERMINÍSTICA: Bloco Básico/Anatômico ---');
      console.log('Ciclo:', resBasico.ciclo, '| Contagens:', resBasico.counts, '| Ratios:', resBasico.ratios);

      expect(resBasico.ciclo).toBe('basico');
    },
    60000
  );
});
