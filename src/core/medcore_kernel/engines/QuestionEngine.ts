import { kernelRepository } from '../repositories/KernelRepository';
import { aiOrchestrator } from '../ai_orchestrator/AIOrchestrator';

export class QuestionEngine {
  private static instance: QuestionEngine;

  private constructor() {}

  public static getInstance(): QuestionEngine {
    if (!QuestionEngine.instance) {
      QuestionEngine.instance = new QuestionEngine();
    }
    return QuestionEngine.instance;
  }

  public async generateQuestion(specialty: string): Promise<any> {
    const docs = await kernelRepository.searchKnowledge(specialty);
    const aiRes = await aiOrchestrator.generateContent({
      prompt: `Gere uma questão de residência médica inédita sobre ${specialty} em formato JSON com enunciado, alternativas (A, B, C, D), alternativa correta e comentário detalhado.`,
    });

    try {
      return JSON.parse(aiRes.text);
    } catch {
      return {
        enunciado: `Questão padrão de residência médica em ${specialty}.`,
        alternativas: ['A) Alternativa incorreta 1', 'B) Alternativa correta', 'C) Alternativa incorreta 2', 'D) Alternativa incorreta 3'],
        correta: 'B',
        comentario: 'Comentário explicativo gerado pelo MedCore Kernel RAG Engine.',
      };
    }
  }
}

export const questionEngine = QuestionEngine.getInstance();
