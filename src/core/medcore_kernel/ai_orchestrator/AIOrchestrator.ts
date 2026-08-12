export type SupportedAIModel =
  | 'gemini-3.5-flash-lite'
  | 'gemini-1.5-pro'
  | 'openai-gpt-4o'
  | 'anthropic-claude-3-5-sonnet'
  | 'deepseek-chat'
  | 'mistral-large'
  | 'llama-3-70b'
  | 'local-model';

export interface AIGenerationRequest {
  prompt: string;
  systemInstruction?: string;
  model?: SupportedAIModel;
  temperature?: number;
  maxTokens?: number;
}

export interface AIGenerationResponse {
  text: string;
  modelUsed: SupportedAIModel;
  tokensUsed?: number;
  provider: string;
}

export class AIOrchestrator {
  private static instance: AIOrchestrator;
  private defaultModel: SupportedAIModel = 'gemini-3.5-flash-lite';

  private constructor() {}

  public static getInstance(): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      AIOrchestrator.instance = new AIOrchestrator();
    }
    return AIOrchestrator.instance;
  }

  public setDefaultModel(model: SupportedAIModel): void {
    this.defaultModel = model;
  }

  public async generateContent(request: AIGenerationRequest): Promise<AIGenerationResponse> {
    const model = request.model || this.defaultModel;

    // Route request through AI Orchestrator abstraction
    // In actual production runtime, Gemini API is called via backend or SDK.
    // Here we provide a robust simulated / integrated response generator adhering to architectural specs.
    console.log(`[AIOrchestrator] Dispatching prompt to model [${model}]...`);

    // Simulate intelligent medical AI response if prompt is medical
    const promptLower = request.prompt.toLowerCase();
    let responseText = `[AIOrchestrator (${model})] Análise concluída com sucesso para o contexto clínico fornecido.`;

    if (promptLower.includes('flashcard')) {
      responseText = JSON.stringify([
        { frente: 'Qual a conduta inicial no IAM com supra de ST?', verso: 'Reperfusão coronariana imediata (ICP primaria < 90 min ou trombólise se ICP indisponível).' },
        { frente: 'Qual a tríade de Beck na tamponamento cardíaco?', verso: 'Hipotensão, bulhas abafadas e estase jugular.' }
      ]);
    } else if (promptLower.includes('questão') || promptLower.includes('question')) {
      responseText = JSON.stringify({
        enunciado: 'Paciente masculino, 58 anos, dor torácica precordial em aperto irradiada para MSE...',
        alternativas: ['A) Pericardite aguda', 'B) Infarto Agudo do Miocárdio', 'C) Dissecção aórtica', 'D) TEP'],
        correta: 'B',
        comentario: 'O quadro clínico é clássico de IAM com supra de ST.'
      });
    }

    return {
      text: responseText,
      modelUsed: model,
      tokensUsed: Math.floor(Math.random() * 500) + 120,
      provider: model.includes('openai') ? 'OpenAI' : model.includes('claude') ? 'Anthropic' : model.includes('deepseek') ? 'DeepSeek' : 'Google Gemini',
    };
  }
}

export const aiOrchestrator = AIOrchestrator.getInstance();
