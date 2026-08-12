import { FlashCard } from '../entities/Card';
import { createInitialSM2State } from '../../core/algorithm/sm2';
import { apiUrl } from '../../lib/apiBaseUrl';

export interface GenerateCardsOptions {
  text: string;
  deckId: string;
  subject?: string;
  cardCount?: number;
  cardType?: 'cloze' | 'basic' | 'mixed';
}

export class GenerateAICardsUseCase {
  async execute(options: GenerateCardsOptions): Promise<FlashCard[]> {
    const response = await fetch(apiUrl('/api/generate-cards'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro ao comunicar com a API Gemini.');
    }

    const data = await response.json();
    const rawCards = data.cards || [];

    return rawCards.map((rc: any, index: number) => ({
      id: `ai-card-${Date.now()}-${index}`,
      deckId: options.deckId,
      type: rc.type || 'cloze',
      front: rc.front || '',
      back: rc.back || '',
      hint: rc.hint || undefined,
      tags: rc.tags || ['IA', options.subject || 'Medicina'],
      highYield: Boolean(rc.highYield),
      mnemonic: rc.mnemonic || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sm2State: createInitialSM2State(),
    }));
  }
}
