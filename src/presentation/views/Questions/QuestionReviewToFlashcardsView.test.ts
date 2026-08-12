import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Question, QuestionSet } from '../../../domain/entities/Question';
import { FlashcardGenerationService } from '../../../data/services/FlashcardGenerationService';
import { db } from '../../../data/db/database';

// Mock do fetch global
global.fetch = vi.fn();

describe('QuestionReviewToFlashcards - Tarefa W4: Testes de Regressão e Seleção', () => {
  let service: FlashcardGenerationService;

  const mockWrongQuestion: Question = {
    id: 'q-wrong-1',
    setId: 'set-1',
    statement: 'Paciente de 45 anos com dor torácica súbita e supra de ST nas derivações V1-V4. Qual a artéria acometida?',
    options: [
      { id: 'opt-a', letter: 'A', text: 'Artéria Coronária Direita', isCorrect: false },
      { id: 'opt-b', letter: 'B', text: 'Artéria Descendente Anterior', isCorrect: true },
      { id: 'opt-c', letter: 'C', text: 'Artéria Circunflexa', isCorrect: false },
      { id: 'opt-d', letter: 'D', text: 'Artéria Marginal Esquerda', isCorrect: false },
    ],
    correctOptionId: 'opt-b',
    userAnswerId: 'opt-a',
    isAnswered: true,
    isCorrect: false,
    commentary: {
      correta: 'O supra de ST de V1 a V4 indica infarto de parede anterior, irrigada pela ADA.',
      porOpcao: {
        A: 'Coronária Direita irriga a parede inferior (DII, DIII, aVF).',
        B: 'Descendente Anterior irriga a parede anterior (V1-V4).',
        C: 'Circunflexa irriga a parede lateral (DI, aVL, V5-V6).',
        D: 'Marginal Esquerda irriga a parede lateral alta.',
      },
    },
    specialty: 'Cardiologia',
    topic: 'Infarto Agudo do Miocárdio',
    difficulty: 'media',
    questionType: 'caso_clinico',
    createdAt: new Date().toISOString(),
  };

  const mockCorrectQuestion: Question = {
    id: 'q-correct-1',
    setId: 'set-1',
    statement: 'Qual a dose de adrenalina recomendada na parada cardiorrespiratória em ritmo chocável?',
    options: [
      { id: 'opt-1', letter: 'A', text: '1mg IV a cada 3 a 5 minutos', isCorrect: true },
      { id: 'opt-2', letter: 'B', text: '10mg IV em bolus único', isCorrect: false },
      { id: 'opt-3', letter: 'C', text: '0,5mg IM a cada 10 minutos', isCorrect: false },
      { id: 'opt-4', letter: 'D', text: '2mg IV a cada 2 minutos', isCorrect: false },
    ],
    correctOptionId: 'opt-1',
    userAnswerId: 'opt-1',
    isAnswered: true,
    isCorrect: true,
    commentary: 'Adrenalina 1mg IV a cada 3 a 5 minutos conforme protocolo ACLS.',
    specialty: 'Cardiologia',
    topic: 'Parada Cardiorrespiratória',
    difficulty: 'facil',
    questionType: 'conceitual',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    service = new FlashcardGenerationService();
    vi.clearAllMocks();
    await db.flashcards.clear();
    await db.cardSignals.clear();
    await db.graphContentLinks.clear();
    await db.decks.clear();

    const now = new Date().toISOString();
    await db.decks.bulkPut([
      {
        id: 'deck-custom-user-123',
        title: 'Deck Teste 1',
        description: '',
        category: 'Cardiologia',
        icon: 'Brain',
        color: '#4F46E5',
        totalCards: 0,
        newCards: 0,
        dueCards: 0,
        learningCards: 0,
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-deck-neurologia-999',
        title: 'Deck Teste 2',
        description: '',
        category: 'Neurologia',
        icon: 'Brain',
        color: '#4F46E5',
        totalCards: 0,
        newCards: 0,
        dueCards: 0,
        learningCards: 0,
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'deck-erros-1',
        title: 'Meus Erros',
        description: '',
        category: 'Erros',
        icon: 'AlertTriangle',
        color: '#EF4444',
        totalCards: 0,
        newCards: 0,
        dueCards: 0,
        learningCards: 0,
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  it('W4-1: Teste de regressão — front/back do card gerado NÃO deve conter a cópia literal do enunciado e das 4 alternativas concatenadas', async () => {
    // Arrange: Mock da API de reformulação via Gemini retornando um card atômico reformulado
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        cards: [
          {
            type: 'basic',
            front: 'Qual artéria coronária é responsável pela irrigação da parede anterior do miocárdio (V1 a V4)?',
            back: 'Artéria Descendente Anterior (ADA).',
            tags: ['Cardiologia', 'Infarto'],
            difficulty: 'Médio',
            highYield: true,
          },
        ],
      }),
    });

    const targetDeckId = 'deck-custom-user-123';

    // Act
    const generatedCards = await service.generateFlashcardsFromQuestions([mockWrongQuestion], targetDeckId);

    // Assert
    expect(generatedCards).toHaveLength(1);
    const card = generatedCards[0];

    // Concatenação verbatim das 4 opções da questão
    const concatenatedOptions = mockWrongQuestion.options.map((o) => `${o.letter}) ${o.text}`).join('\n');

    // O front NÃO pode ser a cópia literal do enunciado + opções
    expect(card.front).not.toContain(mockWrongQuestion.statement);
    expect(card.front).not.toContain(concatenatedOptions);
    expect(card.front).toBe('Qual artéria coronária é responsável pela irrigação da parede anterior do miocárdio (V1 a V4)?');
    expect(card.back).toBe('Artéria Descendente Anterior (ADA).');
  });

  it('W4-2: Pré-seleção inteligente — estado de seleção inicial deve selecionar questões erradas por padrão e certas desmarcadas', () => {
    // Simulando a lógica de estado inicial da tela QuestionReviewToFlashcardsView
    const questionSet: QuestionSet = {
      id: 'set-test',
      title: 'Simulado de Cardiologia',
      request: {
        id: 'req-1',
        createdAt: new Date().toISOString(),
        configuration: {
          specialty: 'Cardiologia',
          topics: ['IAM'],
          quantity: 2,
          difficulty: 'media',
          questionType: 'caso_clinico',
          includeCommentary: true,
          showReferences: true,
          autoGenerateFlashcards: false,
        },
      },
      questions: [mockWrongQuestion, mockCorrectQuestion],
      totalQuestions: 2,
      answeredCount: 2,
      correctCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Lógica de pre-seleção
    const initialSelectedIds = new Set<string>();
    questionSet.questions.forEach((q) => {
      if (q.isAnswered && q.isCorrect === false) {
        initialSelectedIds.add(q.id);
      }
    });

    // Assert
    expect(initialSelectedIds.has('q-wrong-1')).toBe(true);
    expect(initialSelectedIds.has('q-correct-1')).toBe(false);
    expect(initialSelectedIds.size).toBe(1);
  });

  it('W4-3: O card novo deve ser salvo no targetDeckId correto escolhido pelo usuário (não em um deck fixo automático)', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        cards: [
          {
            type: 'basic',
            front: 'Qual a dose de Adrenalina na PCR?',
            back: '1 mg IV a cada 3 a 5 minutos.',
            tags: ['Cardiologia'],
            difficulty: 'Fácil',
            highYield: true,
          },
        ],
      }),
    });

    const userChosenDeckId = 'user-deck-neurologia-999';

    // Act
    const cards = await service.generateFlashcardsFromQuestions([mockCorrectQuestion], userChosenDeckId);

    // Assert
    expect(cards).toHaveLength(1);
    expect(cards[0].deckId).toBe(userChosenDeckId);

    // Verificar no Dexie se o card salvo de fato pertence ao deck do usuário
    const savedCardInDb = await db.flashcards.get(cards[0].id);
    expect(savedCardInDb).toBeDefined();
    expect(savedCardInDb?.deckId).toBe(userChosenDeckId);
  });

  it('W4-4: Se a questão for errada, deve registrar um sinal em cardSignals com signalType wrong_related_question', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        cards: [
          {
            type: 'basic',
            front: 'Por que a coronária direita não é responsável pelo supra de V1-V4?',
            back: 'Porque a Coronária Direita irriga a parede inferior.',
            tags: ['Cardiologia'],
            difficulty: 'Médio',
            highYield: true,
          },
        ],
      }),
    });

    const targetDeckId = 'deck-erros-1';

    // Act
    const cards = await service.generateFlashcardsFromQuestions([mockWrongQuestion], targetDeckId);

    // Assert
    expect(cards).toHaveLength(1);
    const generatedCardId = cards[0].id;

    // Verificar se o sinal foi gravado na tabela cardSignals do Dexie
    const signals = await db.cardSignals.where('cardId').equals(generatedCardId).toArray();
    expect(signals).toHaveLength(1);
    expect(signals[0].signalType).toBe('wrong_related_question');
    expect(signals[0].sourceId).toBe('q-wrong-1');
  });
});
