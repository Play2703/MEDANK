export type FileImportStatus = 'pending' | 'reading' | 'completed' | 'error';

export interface ImportedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  formattedSize: string;
  extension: string;
  type: 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'image';
  pageCount?: number;
  status: FileImportStatus;
  progress: number;
  extractedText?: string;
  errorMsg?: string;
}

export interface DocumentImportRecord {
  id: string;
  deckId: string;
  sourceFileName: string;
  importDate: string;
  cardsGeneratedCount: number;
}

export type FlashcardGenerationMode = 'basic' | 'cloze' | 'mixed';
export type FlashcardGenerationLevel = 'resumido' | 'intermediario' | 'completo';

export interface FlashcardGenerationOptions {
  // text é mantido para compatibilidade retroativa, mas agora representa:
  // - conteúdo médico bruto (de arquivo ou colado) que será passado ao prompt
  // - OU material de consulta RAG quando há chunks disponíveis
  text: string;
  // userInstructions: direção/foco do usuário (opcional) - como quer que os cards sejam gerados
  userInstructions?: string;
  deckId: string;
  subject: string;
  cardCount: number;
  cardType: FlashcardGenerationMode;
  level: FlashcardGenerationLevel;
  examBoard?: string;
  professor?: string;
  filesInfo?: { name: string; type: string }[];
  // retrievedChunks é adicionado durante processamento no cliente
  retrievedChunks?: any[];
}
