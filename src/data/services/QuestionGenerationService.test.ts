import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { QuestionGenerationService } from './QuestionGenerationService';
import { questionSimilarityEngine } from './QuestionSimilarityEngine';
import { distractorEngine } from './distractorEngine/DistractorEngine';
import { ragEngine } from './RAGEngine';
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
      maxSimilarity: 0.95, // Excede SIMILARITY_THRESHOLD (0.92)
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

  it('deve extrair canonicalKeys dos chunks recuperados e repassar para o DistractorEngine', async () => {
    const distractorSpy = vi.spyOn(distractorEngine, 'getCandidates');
    vi.spyOn(ragEngine, 'retrieveContext').mockResolvedValue([
      {
        assetId: 'asset-1',
        chunkIndex: 0,
        content: 'Paciente com insuficiência cardíaca crônica...',
        similarity: 0.9,
        entities: [
          {
            text: 'insuficiência cardíaca',
            normalizedText: 'insuficiencia cardiaca',
            canonicalKey: 'insuficiencia_cardiaca',
            type: 'disease',
            code_system: 'CID-10',
            code: 'I50',
            confidence: 0.95,
          },
          {
            text: 'furosemida',
            normalizedText: 'furosemida',
            canonicalKey: 'furosemida',
            type: 'medication',
            code_system: 'DeCS',
            code: null,
            confidence: 0.9,
          },
        ],
      },
      {
        assetId: 'asset-1',
        chunkIndex: 1,
        content: 'IECA como enalapril...',
        similarity: 0.85,
        entities: [
          {
            text: 'enalapril',
            normalizedText: 'enalapril',
            canonicalKey: 'enalapril',
            type: 'medication',
            code_system: 'DeCS',
            code: null,
            confidence: 0.92,
          },
        ],
      },


      {
        assetId: 'asset-1',
        chunkIndex: 2,
        content: 'Ecocardiograma com fração de ejeção reduzida...',
        similarity: 0.8,
      },
    ]);

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-questions')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: 'q-distractor-test',
                statement: 'Enunciado de IC',
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Opção A', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Opção B', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Opção C', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Opção D', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Comentário' },
                specialty: 'Cardiologia',
                topic: 'Insuficiência Cardíaca',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-distractor-graph',
      mode: 'geral',
      configuration: {
        specialty: 'Cardiologia',
        topics: ['Insuficiência Cardíaca'],
        quantity: 1,
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

    expect(distractorSpy).toHaveBeenCalled();
    const lastDistractorCall = distractorSpy.mock.calls[0][0];
    expect(lastDistractorCall.topicCanonicalKeys).toEqual(
      expect.arrayContaining(['insuficiencia_cardiaca', 'furosemida', 'enalapril'])
    );
  });

  it('deve incluir subtópicos específicos na busca do RAG e no payload de geração ao refinar por tema', async () => {
    let capturedBody: any = null;
    const ragRetrieveSpy = vi.spyOn(ragEngine, 'retrieveContext').mockResolvedValue([
      {
        assetId: 'asset-physio-1',
        chunkIndex: 0,
        content: 'Na relação ventilação/perfusão (V/Q), o ápice pulmonar apresenta maior relação V/Q comparado à base...',
        similarity: 0.92,
      },
      {
        assetId: 'asset-physio-1',
        chunkIndex: 1,
        content: 'O efeito shunt ocorre quando áreas perfundidas não são ventiladas (V/Q = 0)...',
        similarity: 0.88,
      },
      {
        assetId: 'asset-physio-1',
        chunkIndex: 2,
        content: 'O espaço morto alveolar representa áreas ventiladas mas não perfundidas (V/Q tendendo ao infinito)...',
        similarity: 0.85,
      },
    ]);

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes('/api/generate-questions')) {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: 'q-physio-1',
                statement: 'Em relação à fisiologia respiratória e à relação V/Q...',
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Opção correta sobre V/Q', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Opção incorreta 1', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Opção incorreta 2', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Opção incorreta 3', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Explicação detalhada da relação V/Q' },
                specialty: 'Fisiologia',
                topic: 'Mecânica Ventilatória e Trocas Gasosas',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const specificSubtopic = 'Fisiologia Respiratória: Ventilação, Perfusão, Relação V/Q';
    const request: QuestionGenerationRequest = {
      id: 'req-test-subtopics-e2e',
      mode: 'geral',
      configuration: {
        specialty: 'Fisiologia',
        topics: ['Mecânica Ventilatória e Trocas Gasosas'],
        topicSpecialtyMap: {
          'Mecânica Ventilatória e Trocas Gasosas': 'Fisiologia',
        },
        selectedSubtopics: [specificSubtopic],
        topicSubtopicsMap: {
          'Mecânica Ventilatória e Trocas Gasosas': [specificSubtopic],
        },
        quantity: 1,
        distributionMode: 'distribuido',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    const result = await service.generateQuestions(request, true);

    expect(result.questionSet).toBeDefined();
    expect(ragRetrieveSpy).toHaveBeenCalled();
    const calledSearchQuery = ragRetrieveSpy.mock.calls[0][0];
    expect(calledSearchQuery).toContain('Fisiologia');
    expect(calledSearchQuery).toContain('Mecânica Ventilatória e Trocas Gasosas');
    expect(calledSearchQuery).toContain('Fisiologia Respiratória: Ventilação, Perfusão, Relação V/Q');

    expect(capturedBody).toBeDefined();
    expect(capturedBody.subtopics).toContain(specificSubtopic);

    ragRetrieveSpy.mockRestore();
  });

  it('deve deduplicar tópicos repetidos na geração distribuída evitando chamadas duplicadas de IA', async () => {
    let callCount = 0;
    const warnSpy = vi.spyOn(console, 'warn');

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-questions')) {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: `q-dup-${callCount}`,
                statement: 'Questão sobre Insuficiência Cardíaca...',
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Opção A', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Opção B', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Opção C', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Opção D', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Comentário' },
                specialty: 'Cardiologia',
                topic: 'Insuficiência Cardíaca',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-dedup-topics',
      mode: 'geral',
      configuration: {
        specialty: 'Cardiologia',
        // Tópico duplicado de propósito 3 vezes
        topics: ['Insuficiência Cardíaca', 'Insuficiência Cardíaca', 'Insuficiência Cardíaca'],
        quantity: 1,
        distributionMode: 'distribuido',
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    const result = await service.generateQuestions(request, true);

    expect(result.questionSet).toBeDefined();
    // Apenas 1 chamada deve ter sido disparada para o único tópico deduplicado
    expect(callCount).toBe(1);
    // Deve emitir aviso informando a remoção de 2 tópicos duplicados
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[QuestionGenerationService] 2 tópico(s) duplicado(s) removido(s)')
    );
  });

  it('deve repassar needsReview: true para questões com status "low_anchoring" no localValidation', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-questions')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: 'q-anchored',
                statement: 'Paciente com dispneia e estase jugular...',
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Insuficiência Cardíaca', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Pneumonia', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Asma', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'DPOC', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Comentário clínico' },
                specialty: 'Cardiologia',
                topic: 'Insuficiência Cardíaca',
              },
              {
                id: 'q-low-anchoring',
                statement: 'Questão genérica sem termos médicos identificados...',
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Alternativa 1', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Alternativa 2', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Alternativa 3', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Alternativa 4', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Comentário genérico' },
                specialty: 'Cardiologia',
                topic: 'Insuficiência Cardíaca',
              },
            ],
            localValidation: {
              items: [
                { index: 0, itemType: 'question', status: 'well_anchored', anchoringConfidence: 0.9 },
                { index: 1, itemType: 'question', status: 'low_anchoring', anchoringConfidence: 0.2 },
              ],
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-needs-review',
      mode: 'geral',
      configuration: {
        specialty: 'Cardiologia',
        topics: ['Insuficiência Cardíaca'],
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

    expect(result.questionSet).toBeDefined();
    expect(result.questionSet?.questions).toHaveLength(2);
    expect(result.questionSet?.questions[0].needsReview).toBe(false);
    expect(result.questionSet?.questions[1].needsReview).toBe(true);
  });

  it('deve podar chunks para 4500 tokens, enviar useLightModel: true e contabilizar similarityRegenStats na regeneração por similaridade', async () => {
    const capturedPayloads: any[] = [];

    // Mock embedding response: primeira questão tem alta similaridade (0.96 > 0.92)
    vi.spyOn(questionSimilarityEngine, 'findMaxSimilarity')
      .mockResolvedValueOnce({ maxSimilarity: 0.96, embedding: [0.9, 0.9, 0.9] }) // inicial
      .mockResolvedValueOnce({ maxSimilarity: 0.85, embedding: [0.5, 0.5, 0.5] }); // candidato regenerado (sucesso)

    // Mock RAG retornando chunks longos
    vi.spyOn(ragEngine, 'retrieveContext').mockResolvedValue([
      { assetId: 'a1', chunkIndex: 0, content: 'Texto longo '.repeat(100), score: 0.9 },
      { assetId: 'a2', chunkIndex: 1, content: 'Outro texto longo '.repeat(100), score: 0.8 },
    ] as any);

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/generate-questions')) {
        const payload = JSON.parse(init?.body as string);
        capturedPayloads.push(payload);

        return {
          ok: true,
          json: async () => ({
            success: true,
            questions: [
              {
                id: `q-gen-${capturedPayloads.length}`,
                statement: `Enunciado ${capturedPayloads.length}`,
                options: [
                  { id: 'opt-a', letter: 'A', text: 'Opção A', isCorrect: true },
                  { id: 'opt-b', letter: 'B', text: 'Opção B', isCorrect: false },
                  { id: 'opt-c', letter: 'C', text: 'Opção C', isCorrect: false },
                  { id: 'opt-d', letter: 'D', text: 'Opção D', isCorrect: false },
                ],
                correctOptionLetter: 'A',
                commentary: { correta: 'Comentário explicativo' },
                specialty: 'Infectologia',
                topic: 'Dengue',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-test-similarity-regen-light-model',
      mode: 'geral',
      configuration: {
        specialty: 'Infectologia',
        topics: ['Dengue'],
        quantity: 1,
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

    expect(result.questionSet).toBeDefined();
    expect(result.questionSet?.questions).toHaveLength(1);

    // Deve ter havido pelo menos 2 chamadas à API: 1 original + 1 regeneração por similaridade
    expect(capturedPayloads.length).toBe(2);

    // 1ª Chamada: Geração original (useLightModel não enviado ou falso)
    expect(capturedPayloads[0].useLightModel).toBeFalsy();

    // 2ª Chamada: Regeneração por similaridade
    expect(capturedPayloads[1].useLightModel).toBe(true);
    expect(capturedPayloads[1].quantity).toBe(1);
    expect(capturedPayloads[1].topics).toEqual(['Dengue']);

    // Chunks da regeneração devem estar truncados (max 600 chars por chunk)
    for (const chunk of capturedPayloads[1].retrievedChunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(601);
    }

    // Deve ter registrado estatísticas de regeneração
    expect(result.similarityRegenStats).toBeDefined();
    expect(result.similarityRegenStats?.count).toBe(1);
    expect(result.similarityRegenStats?.estimatedTokens).toBeGreaterThan(0);
  });
});



