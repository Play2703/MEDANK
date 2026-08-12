export interface NoteChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  time: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;              // texto livre, markdown simples
  specialty?: string;           // reaproveitar curriculumTopics.ts
  topic?: string;
  chatHistory: NoteChatMessage[];
  createdAt: string;
  updatedAt: string;
}
