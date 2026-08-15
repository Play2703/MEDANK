import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { distractorEngine } from './DistractorEngine';

describe('DistractorEngine - Fonte 4 DeCS/CID-10 Integration', () => {
  beforeEach(async () => {
    await db.canonicalEntityIndex.clear();
    await db.entityEmbeddings.clear();
    await db.graphEdges.clear();
    vi.restoreAllMocks();
  });

  it('1. Deve consultar /api/decs-siblings e retornar candidatos formatados com source: "decs"', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/decs-siblings')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            siblings: ['Enalapril', 'Ramipril', 'Lisinopril'],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const candidates = await distractorEngine.getDecsCandidates('Captopril', 'medication', 5);

    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toEqual({
      text: 'Enalapril',
      entityType: 'medication',
      source: 'decs',
      rationale: 'Mesma categoria DeCS (classe farmacológica/diagnóstica)',
    });
    expect(candidates.map((c) => c.text)).not.toContain('Captopril');
  });

  it('2. Deve integrar candidatos DeCS em getCandidates() quando houver espaço após banco estático', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/decs-siblings')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            siblings: ['Losartana', 'Valsartana', 'Candesartana'],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const candidates = await distractorEngine.getCandidates({
      correctAnswerText: 'Captopril',
      specialty: 'TerapiaExperimental',
      topics: ['Inovação'],
      limit: 4,
    });

    expect(candidates.length).toBeGreaterThan(0);
    const decsFound = candidates.filter((c) => c.source === 'decs');
    expect(decsFound.length).toBeGreaterThan(0);
    expect(decsFound[0].text).toBe('Losartana');
  });

  it('3. Deve degradar graciosamente para array vazio se a requisição ao endpoint /api/decs-siblings falhar', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const candidates = await distractorEngine.getDecsCandidates('Captopril');
    expect(candidates).toEqual([]);

    // getCandidates não deve quebrar mesmo com a falha de rede
    const result = await distractorEngine.getCandidates({
      correctAnswerText: 'Captopril',
      specialty: 'Farmacologia',
      topics: ['Cardiologia'],
      limit: 3,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});
