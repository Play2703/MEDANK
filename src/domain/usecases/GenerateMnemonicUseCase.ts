import { apiUrl } from '../../lib/apiBaseUrl';

export interface MnemonicResult {
  mnemonic: string;
  explanation: string;
  clinicalTip: string;
}

export class GenerateMnemonicUseCase {
  async execute(front: string, back?: string, subject?: string): Promise<MnemonicResult> {
    const response = await fetch(apiUrl('/api/generate-mnemonic'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ front, back, subject }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro ao gerar mnemônico médico.');
    }

    const data = await response.json();
    return {
      mnemonic: data.mnemonic || 'Mnemônico gerado',
      explanation: data.explanation || '',
      clinicalTip: data.clinicalTip || '',
    };
  }
}
