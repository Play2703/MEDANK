import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { QuestionGenerationService } from './QuestionGenerationService';
import { questionSimilarityEngine } from './QuestionSimilarityEngine';
import { QuestionGenerationRequest } from '../../domain/entities/Question';

describe('QuestionGenerationService customContext Unit Tests', () => {
  let service: QuestionGenerationService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new QuestionGenerationService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('deve incluir customContext no payload enviado ao backend ao gerar questões interdisciplinares', async () => {
    const mockCustomContext = 'Texto de nota sobre Cetoacidose Diabética: glicemia 450, pH 7.10, cetonúria 3+';
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes('/api/generate-questions')) {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: 'q-1',
                statement: 'Paciente com cetoacidose diabética...',
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Opção A', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Opção B', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Opção C', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Opção D', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Explicação' },
                specialty: 'Endocrinologia',
                topic: 'Diabetes Mellitus',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-1',
      mode: 'geral',
      configuration: {
        specialty: 'Endocrinologia',
        topics: ['Diabetes Mellitus'],
        quantity: 1,
        distributionMode: 'interdisciplinar',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
        customContext: mockCustomContext,
      },
      createdAt: new Date().toISOString(),
    };

    const result = await service.generateQuestions(request, true);

    expect(result.questionSet).toBeDefined();
    expect(capturedBody).toBeDefined();
    expect(capturedBody.customContext).toBe(mockCustomContext);
  });

  it('deve incluir customContext no payload enviado ao backend ao gerar questões distribuídas por tópico', async () => {
    const mockCustomContext = 'Resumo de Cardiologia: Insuficiência Cardíaca Aguda com congestão e hipoperfusão (Perfil C)';
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes('/api/generate-questions')) {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: 'q-2',
                statement: 'Paciente em perfil C de IC aguda...',
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Inotrópico + Diurético', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Beta-bloqueador isolado', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'IECA em dose máxima', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Bloqueador de canal de cálcio', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Perfil C necessita inotrópico' },
                specialty: 'Cardiologia',
                topic: 'Insuficiência Cardíaca Aguda e Crônica',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-2',
      mode: 'geral',
      configuration: {
        specialty: 'Cardiologia',
        topics: ['Insuficiência Cardíaca Aguda e Crônica'],
        quantity: 1,
        distributionMode: 'distribuido',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
        customContext: mockCustomContext,
      },
      createdAt: new Date().toISOString(),
    };

    const result = await service.generateQuestions(request, true);

    expect(result.questionSet).toBeDefined();
    expect(capturedBody).toBeDefined();
    expect(capturedBody.customContext).toBe(mockCustomContext);
  });

  it('deve lançar erro claro quando nenhuma questão válida for retornada após todas as filtragens e reposições', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-questions')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                // Questão inválida / malformada (sem statement e sem opções válidas)
                id: 'q-bad',
                statement: '',
                options: [],
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-bad',
      mode: 'geral',
      configuration: {
        specialty: 'Neurologia',
        topics: ['AVC Isquêmico'],
        quantity: 2,
        distributionMode: 'interdisciplinar',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    await expect(service.generateQuestions(request, true)).rejects.toThrow(
      'Não foi possível gerar nenhuma questão válida. Tente novamente ou ajuste os tópicos selecionados.'
    );
  });

  it('deve disparar reposição de déficit quando questões forem filtradas e retornar resultado com shortfall se permanecer incompleto', async () => {
    let callCount = 0;

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-questions')) {
        callCount++;
        // Na primeira chamada (geração inicial), retorna 1 questão válida e 1 inválida (solicitadas: 2)
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              questions: [
                {
                  id: 'q-valid-1',
                  statement: 'Paciente 50 anos com hemiparesia...',
                  options: [
                    { id: 'opt-a', letter: 'A', text: 'Trombólise', isCorrect: true },
                    { id: 'opt-b', letter: 'B', text: 'AAS apenas', isCorrect: false },
                    { id: 'opt-c', letter: 'C', text: 'Heparização', isCorrect: false },
                    { id: 'opt-d', letter: 'D', text: 'Observação', isCorrect: false },
                  ],
                  correctOptionLetter: 'A',
                  commentary: { correta: 'Trombólise é indicada' },
                  specialty: 'Neurologia',
                  topic: 'AVC Isquêmico',
                },
                {
                  id: 'q-invalid',
                  statement: '',
                  options: [],
                },
              ],
            }),
          } as Response;
        } else {
          // Na chamada de reposição, retorna outra questão inválida
          return {
            ok: true,
            json: async () => ({
              success: true,
              questions: [{ id: 'q-invalid-2', statement: '', options: [] }],
            }),
          } as Response;
        }
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-replacement',
      mode: 'geral',
      configuration: {
        specialty: 'Neurologia',
        topics: ['AVC Isquêmico'],
        quantity: 2,
        distributionMode: 'interdisciplinar',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    const result = await service.generateQuestions(request, true);

    // Deve ter chamado a API mais de uma vez (geração inicial + reposições)
    expect(callCount).toBeGreaterThan(1);
    expect(result.questionSet).toBeDefined();
    expect(result.questionSet?.questions.length).toBe(1);
    expect(result.shortfall).toBeDefined();
    expect(result.shortfall?.requested).toBe(2);
    expect(result.shortfall?.actual).toBe(1);
  });

  it('deve aceitar todas as 5 questões de um lote sem descartar o tópico mesmo se a API /api/embeddings falhar (degradação graciosa)', async () => {
    const mock5Questions = Array.from({ length: 5 }, (_, i) => ({
      id: `q-batch-${i + 1}`,
      statement: `Enunciado da questão número ${i + 1} sobre Asma brônquica`,
      options: [
        { id: `opt-${i}-a`, letter: 'A', text: 'Opção A', isCorrect: true },
        { id: `opt-${i}-b`, letter: 'B', text: 'Opção B', isCorrect: false },
        { id: `opt-${i}-c`, letter: 'C', text: 'Opção C', isCorrect: false },
        { id: `opt-${i}-d`, letter: 'D', text: 'Opção D', isCorrect: false },
      ],
      correctOptionLetter: 'A',
      commentary: { correta: 'Explicação detalhada' },
      specialty: 'Pneumologia',
      topic: 'Asma Brônquica',
    }));

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/embeddings')) {
        // Simula falha total do serviço de embeddings
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response;
      }
      if (urlStr.includes('/api/generate-questions')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: mock5Questions,
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-embed-fail',
      mode: 'geral',
      configuration: {
        specialty: 'Pneumologia',
        topics: ['Asma Brônquica'],
        quantity: 5,
        distributionMode: 'interdisciplinar',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    const result = await service.generateQuestions(request, true);

    // Todas as 5 questões devem ser mantidas no resultado final, sem exceções e sem derrubar o tópico
    expect(result.questionSet).toBeDefined();
    expect(result.questionSet?.questions.length).toBe(5);
    expect(result.shortfall).toBeUndefined();
  }, 15000);

  it('deve incluir avoidTopics no payload de reposição quando um tópico atingir o limite de tentativas de regeneração', async () => {
    let capturedReplacementPayloads: any[] = [];
    let callIndex = 0;

    // Mock embedding response com alta similaridade
    vi.spyOn(questionSimilarityEngine, 'findMaxSimilarity').mockResolvedValue({
      maxSimilarity: 0.95, // Excede SIMILARITY_THRESHOLD (0.88)
      embedding: [0.9, 0.9, 0.9],
    });

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/generate-questions')) {
        callIndex++;
        const payload = JSON.parse(init?.body as string);

        if (payload.avoidTopics) {
          capturedReplacementPayloads.push(payload);
        }

        // Primeira chamada retorna 1 questão válida e 1 inválida para forçar chamada de reposição
        if (callIndex === 1) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              questions: [
                {
                  id: 'q-valid-1',
                  statement: 'Paciente com sintomas raros de amiloide...',
                  options: [
                    { id: 'opt-a', letter: 'A', text: 'Opção A', isCorrect: true },
                    { id: 'opt-b', letter: 'B', text: 'Opção B', isCorrect: false },
                    { id: 'opt-c', letter: 'C', text: 'Opção C', isCorrect: false },
                    { id: 'opt-d', letter: 'D', text: 'Opção D', isCorrect: false },
                  ],
                  correctOptionLetter: 'A',
                  commentary: { correta: 'Comentário' },
                  specialty: 'Hematologia',
                  topic: 'Amiloidose',
                },
                { id: 'q-invalid', statement: '', options: [] },
              ],
            }),
          } as Response;
        }

        // Respostas das chamadas de regeneração / reposição
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: `q-rep-${callIndex}`,
                statement: `Reposição ${callIndex}`,
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Opção A', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Opção B', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Opção C', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Opção D', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Comentário' },
                specialty: 'Hematologia',
                topic: 'Amiloidose',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-saturated-topics',
      mode: 'geral',
      configuration: {
        specialty: 'Hematologia',
        topics: ['Amiloidose'],
        quantity: 2,
        distributionMode: 'interdisciplinar',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    await service.generateQuestions(request, true);

    expect(capturedReplacementPayloads.length).toBeGreaterThan(0);
    const repPayload = capturedReplacementPayloads[0];
    expect(repPayload.avoidTopics).toContain('Amiloidose');
  }, 15000);
});
