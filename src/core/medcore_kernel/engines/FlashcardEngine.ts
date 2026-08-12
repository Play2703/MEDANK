import { kernelRepository } from '../repositories/KernelRepository';
import { aiOrchestrator } from '../ai_orchestrator/AIOrchestrator';

export class FlashcardEngine {
  private static instance: FlashcardEngine;

  private constructor() {}

  public static getInstance(): FlashcardEngine {
    if (!FlashcardEngine.instance) {
      FlashcardEngine.instance = new FlashcardEngine();
    }
    return FlashcardEngine.instance;
  }

  public async generateFlashcardsForTopic(topic: string): Promise<any[]> {
    const docs = await kernelRepository.searchKnowledge(topic);
    const context = docs.length > 0 ? docs[0].descricao : 'Medicina baseada em evidências';

    const aiRes = await aiOrchestrator.generateContent({
      prompt: `Gere flashcards de alta qualidade em formato JSON para o tópico médico: ${topic}. Contexto: ${context}`,
      systemInstruction: 'Você é um gerador especializado em flashcards médicos do MedAnki.',
    });

    try {
      return JSON.parse(aiRes.text);
    } catch {
      return [
        { frente: `O que é ${topic}?`, verso: `Conceito fundamental abordado no MedCore Kernel para ${topic}.` }
      ];
    }
  }
}

export const flashcardEngine = FlashcardEngine.getInstance();
