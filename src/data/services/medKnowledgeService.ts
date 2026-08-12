import { apiUrl } from '../../lib/apiBaseUrl';

export interface GenerateQuestionsParams {
  specialtyName: string;
  subjectName: string;
  subthemeName?: string;
  topicName?: string;
  sourceReference?: string;
  difficulty?: string;
  questionType?: string;
  styleProfile?: any;
  customContext?: string;
  count?: number;
  mixSubjects?: boolean;
  shuffleAlternatives?: boolean;
  allowThemeRepetition?: boolean;
}

export interface CloneExamStyleParams {
  profileName: string;
  sourceExamName: string;
  examText: string;
}

export interface GenerateFlashcardsParams {
  subjectName: string;
  topicName: string;
  customText?: string;
  count?: number;
}

export interface ChatNoteParams {
  noteTitle: string;
  noteContent: string;
  userMessage: string;
  chatHistory?: { id: string; sender: 'user' | 'ai'; text: string; time: string }[];
}

class MedKnowledgeService {
  async generateQuestions(params: GenerateQuestionsParams): Promise<any[]> {
    const res = await fetch(apiUrl('/api/generate-questions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!data.success || !Array.isArray(data.questions)) {
      throw new Error(data.error || 'Falha ao gerar questões médicas por IA.');
    }

    return data.questions;
  }

  async cloneExamStyle(params: CloneExamStyleParams): Promise<any> {
    const res = await fetch(apiUrl('/api/clone-exam-style'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!data.success || !data.profile) {
      throw new Error(data.error || 'Falha ao analisar e clonar estilo de prova.');
    }

    return data.profile;
  }

  async generateFlashcards(params: GenerateFlashcardsParams): Promise<any[]> {
    const res = await fetch(apiUrl('/api/generate-flashcards'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!data.success || !Array.isArray(data.flashcards)) {
      throw new Error(data.error || 'Falha ao gerar flashcards por IA.');
    }

    return data.flashcards;
  }

  async chatNote(params: ChatNoteParams): Promise<string> {
    const res = await fetch(apiUrl('/api/chat-note'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!data.success || !data.reply) {
      throw new Error(data.error || 'Erro ao conversar com a IA sobre a nota.');
    }

    return data.reply;
  }
}

export const medKnowledgeService = new MedKnowledgeService();
