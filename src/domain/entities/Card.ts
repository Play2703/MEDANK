import { SM2State } from '../../core/algorithm/sm2';
import { ReviewLog } from './StudySession';

export type CardType = 'cloze' | 'basic' | 'image_occlusion';
export type CardDifficulty = 'Fácil' | 'Médio' | 'Difícil';

export interface ImageOcclusionRect {
  id: string;      // ex: "c1", "c2"
  x: number;       // porcentagem (0-100) da largura da imagem
  y: number;       // porcentagem (0-100) da altura da imagem
  width: number;   // porcentagem (0-100) da largura da imagem
  height: number;  // porcentagem (0-100) da altura da imagem
  label?: string;  // dica/rótulo opcional
}

export interface FlashCard {
  id: string;
  deckId: string;
  type: CardType;
  front: string;          // Frente (Pergunta ou texto cloze {{c1::termo::dica}})
  back: string;           // Verso (Explicação clínica)
  imageUrl?: string;      // Imagem
  audioUrl?: string;      // Áudio (URL da gravação ou mídia)
  audioText?: string;     // Áudio (Texto para pronúncia/TTS)
  tags: string[];         // Tags
  subject?: string;       // Assunto
  subtopic?: string;      // Subtema
  topic?: string;         // Tópico
  difficulty?: CardDifficulty; // Grau de dificuldade ('Fácil' | 'Médio' | 'Difícil')
  highYield?: boolean;    // High-yield tag para provas de residência
  hint?: string;
  mnemonic?: string;
  generateReversed?: boolean; // Se verdadeiro no modo básico, cria também o card invertido
  occlusionRects?: ImageOcclusionRect[]; // Áreas ocultas para cards do tipo Oclusão de Imagem
  canonicalKeys?: string[];  // Cache de chaves de entidades clínicas vinculadas no Grafo
  parentCardId?: string;     // ID do card-pai se este card nasceu de uma expansão clínica
  childCardIds?: string[];   // IDs de cards-filhos gerados por expansões aprovadas
  createdAt: string;      // Data de criação
  updatedAt: string;
  sm2State: SM2State;     // Contém: lastReviewedAt (Última revisão), dueDate (Próxima revisão), easeFactor (Ease Factor), interval (Intervalo), repetitions (Repetições)
  history?: ReviewLog[];  // Histórico de revisões do card
}
