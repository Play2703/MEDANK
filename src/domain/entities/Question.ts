import { ImportedFile } from './DocumentImport';

export type GenerationMode = 'geral' | 'banca' | 'professor';

export type DistributionMode = 'interdisciplinar' | 'distribuido';

export type QuestionDifficulty = 'facil' | 'media' | 'dificil' | 'misturar';

export type QuestionType = 'conceitual' | 'caso_clinico' | 'multipla_escolha' | 'assercao_combinada' | 'misturar';

export interface QuestionConfiguration {
  specialty: string;                 // Especialidade principal ou primeira selecionada
  specialties?: string[];            // Múltiplas especialidades (e.g. ["Embriologia", "Cardiologia"])
  topics: string[];                  // Múltiplos assuntos selecionados
  topicSpecialtyMap?: Record<string, string>; // Mapeamento assunto -> especialidade de origem
  subtopic?: string;                 // Subtema
  topicDetail?: string;              // Tópico específico
  selectedSubtopics?: string[];      // Subtópicos / temas específicos selecionados
  topicSubtopicsMap?: Record<string, string[]>; // Mapeamento tópico -> lista de subtópicos refinados
  quantity: number;                  // Quantidade de questões (ex: 10, 20)
  distributionMode?: DistributionMode; // 'interdisciplinar' | 'distribuido'
  customTopicQuantities?: Record<string, number>; // Se distribuição manual no modo distribuído
  difficulty: QuestionDifficulty;    // Dificuldade
  questionType: QuestionType;        // Tipo de questão
  includeCommentary: boolean;        // Questões comentadas
  showReferences: boolean;           // Mostrar referências após responder
  autoGenerateFlashcards: boolean;   // Gerar flashcards automaticamente ao finalizar
  prioritizeLocalQuestions?: boolean;// Priorizar questões do meu banco local (economia máxima)
  customContext?: string;            // Contexto livre / Texto-fonte prioritário (ex: notas de estudo)
  strictCustomContextOnly?: boolean; // Restringir estritamente ao texto-fonte (desativa RAG geral)
  autoCapLimitedQuantity?: boolean;  // Ajustar quantidade automaticamente para a capacidade estimada do conteúdo
  forceQuantityDespiteLimit?: boolean; // Forçar quantidade solicitada mesmo se o conteúdo for limitado
}

export interface QuestionGenerationRequest {
  id: string;
  mode?: GenerationMode;              // Modo 'geral' (default), 'banca' ou 'professor'
  bancaId?: string;                   // Se modo == 'banca'
  bancaName?: string;
  professorProfileId?: string;       // Se modo == 'professor'
  professorName?: string;
  configuration: QuestionConfiguration;
  createdAt: string;
}

export type AcademicCycle = 'basico' | 'clinico' | 'misto';

export interface ClinicalCycleDNA {
  contextoClinico: number;      // 0-1: peso de vinhetas clínicas vs. questão conceitual direta
  casosLongos: number;          // 0-1: complexidade/extensão do enunciado
  pegadinhas: number;           // 0-1: frequência de armadilhas/distratores sutis
  epidemiologia: number;        // 0-1: peso de dados epidemiológicos/estatísticos
  farmacologia: number;         // 0-1: peso de detalhes farmacológicos (doses, interações, classes)
  achadosDeImagem: number;      // 0-1: frequência de achados de imagem/ECG descritos textualmente
  condutaImediata: number;      // 0-1: peso de decisão de conduta vs. só diagnóstico
  diretrizesOficiais: number;   // 0-1: peso de citação/adesão a protocolos e sociedades específicas
  comorbidadesMultiplas: number;// 0-1: frequência de casos com múltiplas condições simultâneas
}

export interface BasicCycleDNA {
  memorizacaoDireta: number;        // 0-1: cobra definição/nomenclatura direta vs. raciocínio aplicado
  correlacaoAnatomoclinica: number; // 0-1: conecta estrutura a relevância clínica (vs. puramente descritivo)
  nomenclaturaTecnica: number;      // 0-1: exige precisão de termos técnicos/latinos/epônimos
  mecanismoFisiopatologico: number; // 0-1: profundidade de mecanismo bioquímico/fisiológico
  reconhecimentoEstrutural: number; // 0-1: identificação de estrutura em imagem histológica/anatômica (descrita textualmente)
  integracaoMultissistemica: number;// 0-1: cobra integração entre sistemas diferentes
  basesBioquimicas: number;         // 0-1: profundidade de vias metabólicas/bioquímicas
}

export interface DeterministicExamStats {
  totalQuestions: number;
  answerKeyDistribution: Record<string, number>; // Distribuição percentual (A, B, C, D, E)
  averageStatementChars: number;
  averageStatementWords: number;
  clinicalVignetteRatio: number; // 0-1: Proporção de questões com vinheta clínica
  trickPatternsFrequency: number; // 0-1: Frequência de marcadores de pegadinha (EXCETO, INCORRETA, etc.)
  calculatedAt: string;
}

export interface ExamDNA {
  cicloAcademico: AcademicCycle;
  clinico?: ClinicalCycleDNA;   // presente se cicloAcademico for 'clinico' ou 'misto'
  basico?: BasicCycleDNA;       // presente se cicloAcademico for 'basico' ou 'misto'
  version: number;              // contador de quantas vezes foi recalculado (pra média móvel)
  dataSource?: 'ai-only' | 'ai-anchored-by-real-data';
  deterministicStats?: DeterministicExamStats;
  updatedAt: string;
}

export interface ExtractedExamQuestionRecord {
  id: string;
  sourceAssetId?: string;
  questionNumber: number;
  statement: string;
  options: {
    letter: string;
    text: string;
    letterConfidence?: number;
    inferredLetter?: boolean;
    rawMarker?: string;
  }[];
  correctLetter?: string;
  specialty?: string;
  confidence: 'high' | 'medium' | 'low';
  pageNumber?: number;
  endPageNumber?: number;
  extractionMethod?: 'native-text' | 'local-ocr' | 'remote-ocr' | 'manual';
  ocrConfidence?: number;
  warning?: string;
  createdAt: string;
}

export interface ExamProfile {
  id: string;
  name: string;                      // Ex: 'ENARE', 'ENAMED', 'Revalida', 'USP'
  code: string;
  description: string;
  styleDescription: string;           // Características do estilo da banca
  typicalQuestionTypes: QuestionType[];
  averageLength: 'curto' | 'medio' | 'longo';
  difficultyTrend: 'alta' | 'media' | 'variavel';
  commonTopics: string[];
  isPredefined: boolean;
  examDNA?: ExamDNA;
  createdAt: string;
}

export interface ImportedDocument {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'image';
  fileSize: number;                  // Bytes
  formattedSize: string;             // e.g. "2.4 MB"
  uploadProgress: number;            // 0 a 100
  status: 'pending' | 'reading' | 'completed' | 'error';
  extractedTextLength?: number;
  extractedExcerpt?: string;
  uploadedAt: string;
}

export interface ProfessorElaborationStyle {
  writingStyle: string;              // Ex: "Direto e focado em fisiopatologia"
  averageStatementLength: 'curto' | 'medio' | 'longo';
  difficultyDegree: 'facil' | 'media' | 'dificil' | 'desafiador';
  clinicalCasesFrequency: string;    // Ex: "80% Casos Clínicos"
  optionsPattern: string;            // Ex: "4 alternativas concisas"
  recurringThemes: string[];         // Ex: ["Eletrocardiograma", "Valvopatias"]
  interdisciplinaryIntegration: string; // Ex: "Integra farmacologia e anatomia"
}

export interface ProfessorStyleAnalysis {
  temasFavoritos: string[];          // tópicos/temas que mais aparecem nas provas dele
  estiloDeQuestao: string;           // ex. "prefere vinhetas clínicas longas", "cobra definição direta"
  nivelCognitivo: string;            // ex. memorização vs aplicação/raciocínio clínico
  pegadinhasRecorrentes: string[];   // padrões de pegadinha que ele repete
  resumoEstiloGeral: string;         // síntese em 2-3 frases
  examDNA?: ExamDNA;
  analyzedAt?: string;
}

export interface ProfessorProfile {
  id: string;
  name: string;                      // Ex: 'Prof. Dr. Silva - Cardiologia'
  description?: string;
  documents: ImportedDocument[];
  totalExamsCount: number;
  totalFilesSize: number;
  formattedTotalSize: string;
  elaborationStyle: ProfessorElaborationStyle;
  styleAnalysis?: ProfessorStyleAnalysis;
  examDNA?: ExamDNA;
  createdAt: string;
  updatedAt: string;
}

export interface StructuredCommentary {
  correta: string;                  // por que a alternativa correta está certa
  porOpcao: Record<string, string>; // uma explicação por CADA alternativa (ex: { "A": "...", "B": "..." })
  porItem?: Record<string, string>; // explicação por CADA item (ex: { "I": "...", "II": "..." })
  correlacaoClinica?: string;       // resumo de correlação clínica
}

export type QuestionCommentary = string | StructuredCommentary;

export type DistractorType = 
  | 'inversão_função'
  | 'ordem_errada'
  | 'componente_relacionado'
  | 'terminologia_parcial';

export interface QuestionOption {
  id: string;
  letter: string;                    // 'A', 'B', 'C', 'D'
  text: string;
  isCorrect: boolean;
  explanation?: string;
  distractorType?: DistractorType;
}

export interface CoverageUnit {
  id: string;                         // Ex: "unit-1"
  label: string;                      // Rótulo curto descritivo
  content: string;                    // Conteúdo textual da unidade
  charCount: number;
  wordCount: number;
  sourceType: 'heading' | 'bullet' | 'numbered' | 'paragraph_semantic' | 'raw';
}

export interface Question {
  id: string;
  setId: string;
  statement: string;
  clinicalContext?: string;
  assertionItems?: { numeral: string; text: string }[]; // Ex: [{numeral: "I", text: "..."}]
  options: QuestionOption[];
  correctOptionId: string;
  commentary: QuestionCommentary;
  references?: string[];
  tags?: string[];
  specialty: string;
  topic: string;
  subtopic?: string;
  difficulty: QuestionDifficulty;
  questionType: QuestionType;
  originSource?: string;             // Ex: 'Banca ENARE' ou 'Prof. Dr. Silva'
  needsReview?: boolean;             // true quando o dicionário local não reconheceu termos médicos suficientes (baixa ancoragem)
  sourceContextExcerpt?: string;     // Trecho do customContext de onde a questão se originou
  coverageUnitId?: string;           // ID da unidade de cobertura
  coverageUnitLabel?: string;        // Rótulo da unidade de cobertura
  flaggedSimilar?: boolean;          // true quando a questão atingiu o limite de diversidade ou similaridade
  similarityWarning?: string;        // Mensagem explicativa para o usuário
  userAnswerId?: string;
  isAnswered: boolean;
  isCorrect?: boolean;
  answeredAt?: string;
  createdAt: string;
}

export interface QuestionSet {
  id: string;
  title: string;
  request: QuestionGenerationRequest;
  questions: Question[];
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
