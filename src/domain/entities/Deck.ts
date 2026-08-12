export interface Deck {
  id: string;
  folderId?: string;
  isFavorite?: boolean;
  title: string;
  description: string;
  category: string;      // e.g. "Cardiologia", "Farmacologia", "Anatomia", "Pediatria", "Ginecologia"
  icon: string;          // Lucide icon identifier e.g. "HeartPulse", "Pill", "Brain", "Baby", "Stethoscope"
  color: string;         // Hex or theme color key
  totalCards: number;
  newCards: number;
  dueCards: number;
  learningCards: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}
