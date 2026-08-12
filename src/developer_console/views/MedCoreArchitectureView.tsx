import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu,
  FileSpreadsheet,
  Brain,
  Bot,
  HelpCircle,
  Network,
  ChevronRight,
  CheckCircle2,
  Zap,
  Sparkles,
  Layers,
  Copy,
  Check,
  Terminal,
  Activity,
  GitBranch,
  ShieldAlert,
  ArrowRight,
  BookOpen,
  FileText,
  Search,
  Settings2,
} from 'lucide-react';

export interface ArchitectureNode {
  id: string;
  name: string;
  category: 'root' | 'engine';
  icon: React.FC<{ className?: string }>;
  description: string;
  status: 'Ativo' | 'Em desenvolvimento' | 'Planejado';
  version: string;
  subModules: {
    name: string;
    description: string;
    status: 'Ready' | 'In Progress' | 'Planned';
    formatsOrTech?: string[];
  }[];
  metrics?: {
    label: string;
    value: string;
  }[];
}

export const MEDCORE_ARCHITECTURE: ArchitectureNode[] = [
  {
    id: 'import-engine',
    name: 'Import Engine',
    category: 'engine',
    icon: FileSpreadsheet,
    description: 'Motor universal de ingestão, conversão e parsing de documentos bibliográficos e médicos.',
    status: 'Ativo',
    version: 'v1.4.0',
    metrics: [
      { label: 'Formatos Suportados', value: 'PDF, DOCX, EPUB, PPTX, TXT' },
      { label: 'Vazão Ingestão', value: '45 pág/s (Parallel Chunking)' },
      { label: 'Precisão Parser', value: '98.5% Structure Retention' },
    ],
    subModules: [
      {
        name: 'Multi-Format Ingestion',
        description: 'Leitura streaming de arquivos locais e bibliotecas bibliográficas.',
        status: 'Ready',
        formatsOrTech: ['PDF.js', 'Mammoth DOCX', 'Epub.js', 'JSZip'],
      },
      {
        name: 'Vision OCR Engine',
        description: 'Digitalização e extração de texto de PDFs escaneados e imagens clínicas.',
        status: 'In Progress',
        formatsOrTech: ['Tesseract Vision', 'Canvas Binarizer'],
      },
      {
        name: 'Medical Document Segmenter',
        description: 'Quebra inteligente em capítulos, seções, quadros e tabelas epidemiológicas.',
        status: 'Ready',
        formatsOrTech: ['Semantic Boundary Detection', 'Header Heuristics'],
      },
      {
        name: 'Table & Metadata Extractor',
        description: 'Detecção de tabelas de posologia, critérios diagnósticos e citações.',
        status: 'Ready',
        formatsOrTech: ['Regex Normalizer', 'JSON Table Schema'],
      },
    ],
  },
  {
    id: 'medical-intelligence',
    name: 'Medical Intelligence',
    category: 'engine',
    icon: Brain,
    description: 'Camada de taxonomia, classificação por especialidades e cálculo de relevância probatória (High Yield).',
    status: 'Ativo',
    version: 'v2.1.0',
    metrics: [
      { label: 'Especialidades', value: '54 Áreas Médicas Categoriadas' },
      { label: 'Acurácia Classificador', value: '96.2% F1-Score' },
      { label: 'Consensos Mapeados', value: 'SBC, SBPT, SBD, AHA, ESC' },
    ],
    subModules: [
      {
        name: 'Medical Taxonomy Classifier',
        description: 'Mapeamento hierárquico em especialidades, subespecialidades e temas de prova.',
        status: 'Ready',
        formatsOrTech: ['CID-11', 'MeSH Terms', 'Taxonomia MedAnki'],
      },
      {
        name: 'High Yield Predictor',
        description: 'Algoritmo proprietário que atribui notas de relevância probatória (0 a 100%).',
        status: 'Ready',
        formatsOrTech: ['Incidence Weight Matrix', 'Banca Frequency Scale'],
      },
      {
        name: 'Guideline Delta Rule Engine',
        description: 'Identificação automática de atualizações em diretrizes e consensos médicos.',
        status: 'In Progress',
        formatsOrTech: ['Version Delta Diff', 'Clinical Protocol Guard'],
      },
      {
        name: 'Diagnostic Criteria Parser',
        description: 'Extração de critérios de inclusão/exclusão e escores clínicos (CURB-65, CHADS2-VASc).',
        status: 'Ready',
        formatsOrTech: ['Clinical Decision Rules', 'Score Calculator'],
      },
    ],
  },
  {
    id: 'knowledge-graph',
    name: 'Knowledge Graph',
    category: 'engine',
    icon: Network,
    description: 'Grafo de conhecimento bidirecional e índice vetorial denso para busca semântica RAG.',
    status: 'Ativo',
    version: 'v1.8.2',
    metrics: [
      { label: 'Embeddings Model', value: 'text-embedding-004 (768d)' },
      { label: 'Grafo Relacional', value: 'Relações Causa -> Sintoma -> Droga' },
      { label: 'Velocidade Busca', value: '< 12ms Cosine Similarity' },
    ],
    subModules: [
      {
        name: 'Vector Embeddings Index',
        description: 'Vetorização densa com Gemini Embeddings para busca semântica em tempo real.',
        status: 'Ready',
        formatsOrTech: ['text-embedding-004', 'In-Memory Cosine Sim'],
      },
      {
        name: 'Cross Reference Network',
        description: 'Relações automáticas entre doenças correlatas, diagnósticos diferenciais e farmacos.',
        status: 'Ready',
        formatsOrTech: ['Bi-directional Graph Edges', 'Cross-Ref Engine'],
      },
      {
        name: 'Semantic Entity Linker',
        description: 'Vinculação de sinônimos médicos, eponímos e abreviações (ex: HAS = Hipertensão Arterial).',
        status: 'Ready',
        formatsOrTech: ['UMLS Synonyms', 'Medical Dictionary Lookup'],
      },
      {
        name: 'Local Vector Store Cache',
        description: 'Persistência comprimida em banco local para suporte offline e navegação instantânea.',
        status: 'In Progress',
        formatsOrTech: ['IndexedDB Vector Store', 'Quantized Weights'],
      },
    ],
  },
  {
    id: 'ai-engine',
    name: 'AI Engine',
    category: 'engine',
    icon: Bot,
    description: 'Orquestrador de Inteligência Artificial generativa alimentado pelo Gemini para síntese e tutoramento.',
    status: 'Ativo',
    version: 'v2.5.0',
    metrics: [
      { label: 'Modelo Principal', value: 'Gemini 2.5 Flash / Pro' },
      { label: 'Geração Flashcards', value: 'Cloze Deletion Automático' },
      { label: 'Segurança API', value: 'Server-Side Proxy Securo' },
    ],
    subModules: [
      {
        name: 'Gemini RAG Orchestration',
        description: 'Geração grounded no acervo do usuário com prevenção rigorosa de alucinações.',
        status: 'Ready',
        formatsOrTech: ['Gemini 2.5 Flash', 'System Prompt Grounding'],
      },
      {
        name: 'MedAnki Flashcard Synthesizer',
        description: 'Criação automática de cards com técnica de omissão de palavras (Cloze Deletion).',
        status: 'Ready',
        formatsOrTech: ['Cloze Syntax Generator', 'M3 Card Schema'],
      },
      {
        name: 'Clinical Case Reasoning Agent',
        description: 'Geração de casos clínicos interativos com explicações passo a passo.',
        status: 'Ready',
        formatsOrTech: ['Chain-of-Thought Prompting', 'Differential Diagnosis'],
      },
      {
        name: 'Author & Professor Persona AI',
        description: 'Simulação do estilo explicativo e foco temático de professores de cursinho.',
        status: 'In Progress',
        formatsOrTech: ['Persona Prompt Injector', 'Pedagogical Tone Adjuster'],
      },
    ],
  },
  {
    id: 'question-engine',
    name: 'Question Engine',
    category: 'engine',
    icon: HelpCircle,
    description: 'Motor de banco de questões de residência, parsing de bancas, geração de distratores e repetição adaptativa.',
    status: 'Em desenvolvimento',
    version: 'v1.2.0',
    metrics: [
      { label: 'Bancas Mapeadas', value: 'USP, ENARE, AMP, UNICAMP, Revalida' },
      { label: 'Algoritmo SM-2', value: 'Repetição Espaçada Personalizada' },
      { label: 'Comentários IA', value: 'Justificativas para Alternativa A-E' },
    ],
    subModules: [
      {
        name: 'Exam PDF Question Splitter',
        description: 'Segmentador automático que isola enunciados, alternativas A-E e gabaritos.',
        status: 'In Progress',
        formatsOrTech: ['Regex Layout Parser', 'Bounding Box Extractor'],
      },
      {
        name: 'Banca Pattern Profiler',
        description: 'Análise estatística do perfil de cobrança de bancas examinadoras específicas.',
        status: 'In Progress',
        formatsOrTech: ['Banca Bias Clustering', 'Recurrence Matrix'],
      },
      {
        name: 'Distractor & Commentary Generator',
        description: 'Geração de pegadinhas frequentes e comentários aprofundados por alternativa.',
        status: 'Ready',
        formatsOrTech: ['Reasoning Explainer', 'Distractor Analyzer'],
      },
      {
        name: 'Adaptive Practice & SM-2 Queue',
        description: 'Fila inteligente de questões com base na taxa de acerto e retenção do aluno.',
        status: 'Ready',
        formatsOrTech: ['SuperMemo SM-2', 'Ease Factor Modifier'],
      },
    ],
  },
];

export const MedCoreArchitectureView: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('import-engine');
  const [viewMode, setViewMode] = useState<'visual' | 'ascii' | 'pipeline'>('visual');
  const [copiedAscii, setCopiedAscii] = useState<boolean>(false);

  const selectedNode = MEDCORE_ARCHITECTURE.find((n) => n.id === selectedNodeId) || MEDCORE_ARCHITECTURE[0];

  const asciiTreeText = `MedCore Engine (Clean Architecture Core)
├── Import Engine (Multi-format Ingestion, OCR Vision, Document Parser)
├── Medical Intelligence (Taxonomy, High Yield Rating, Guideline Delta)
├── Knowledge Graph (Vector Embeddings, Cross Reference, Entity Linker)
├── AI Engine (Gemini 2.5 Flash, Cloze Flashcards, Clinical Agent)
└── Question Engine (Exam Bank Parser, Banca Profiles, SM-2 Queue)`;

  const handleCopyAscii = () => {
    navigator.clipboard.writeText(asciiTreeText);
    setCopiedAscii(true);
    setTimeout(() => setCopiedAscii(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Tabs */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Arquitetura MedCore</h2>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                Clean Domain Stack
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Arquitetura em 5 pilares fundamentais para processamento, inteligência médica e geração por IA
            </p>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 self-start md:self-auto">
          <button
            onClick={() => setViewMode('visual')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'visual'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Árvore Visual</span>
          </button>
          <button
            onClick={() => setViewMode('ascii')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'ascii'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal ASCII</span>
          </button>
          <button
            onClick={() => setViewMode('pipeline')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'pipeline'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Pipeline Matrix</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: VISUAL TREE DIAGRAM */}
      {viewMode === 'visual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Tree Hierarchy Column */}
          <div className="lg:col-span-5 space-y-4">
            {/* MedCore Root Box */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/80 to-slate-900 border-2 border-indigo-500/40 shadow-lg shadow-indigo-950/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">MedCore</h3>
                  <p className="text-[11px] text-indigo-300 font-mono">Central Intelligence Orchestrator</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                ROOT ENGINE
              </span>
            </div>

            {/* Tree Branch Links */}
            <div className="pl-4 space-y-2 relative before:absolute before:left-6 before:top-0 before:bottom-6 before:w-0.5 before:bg-slate-800">
              {MEDCORE_ARCHITECTURE.map((node, idx) => {
                const IconComponent = node.icon;
                const isSelected = node.id === selectedNodeId;
                const isLast = idx === MEDCORE_ARCHITECTURE.length - 1;

                return (
                  <div key={node.id} className="relative flex items-center gap-2">
                    {/* Horizontal Connector */}
                    <div className="w-4 h-0.5 bg-slate-800 shrink-0" />

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`flex-1 p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-slate-800 border-indigo-500/60 shadow-md shadow-indigo-950/50 ring-1 ring-indigo-500/40'
                          : 'bg-slate-900/80 hover:bg-slate-800/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-indigo-500 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <h4
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-white' : 'text-slate-300'
                            }`}
                          >
                            {node.name}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-mono truncate">
                            {node.subModules.length} Submódulos • {node.version}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                            node.status === 'Ativo'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {node.status}
                        </span>
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${
                            isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-slate-600'
                          }`}
                        />
                      </div>
                    </motion.button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Selected Engine Inspector Column */}
          <div className="lg:col-span-7 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedNode.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6"
              >
                {/* Node Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                      {React.createElement(selectedNode.icon, { className: 'w-6 h-6' })}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{selectedNode.name}</h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          {selectedNode.version}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{selectedNode.description}</p>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                {selectedNode.metrics && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {selectedNode.metrics.map((m, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1"
                      >
                        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{m.label}</p>
                        <p className="text-xs font-bold text-indigo-300 font-mono truncate">{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* SubModules Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Submódulos do Pipeline ({selectedNode.subModules.length})</span>
                  </h4>

                  <div className="grid grid-cols-1 gap-3">
                    {selectedNode.subModules.map((sub, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <h5 className="text-xs font-bold text-white">{sub.name}</h5>
                          </div>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-md border ${
                              sub.status === 'Ready'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : sub.status === 'In Progress'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{sub.description}</p>

                        {sub.formatsOrTech && sub.formatsOrTech.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                            {sub.formatsOrTech.map((tech, tIdx) => (
                              <span
                                key={tIdx}
                                className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-900 text-slate-400 border border-slate-800"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: TERMINAL ASCII */}
      {viewMode === 'ascii' && (
        <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-300 font-bold">medcore-architecture.tree</span>
            </div>
            <button
              onClick={handleCopyAscii}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 text-[11px]"
            >
              {copiedAscii ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copiar Estrutura ASCII</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-4 rounded-2xl bg-slate-900 border border-slate-800/80 text-emerald-400 overflow-x-auto leading-relaxed">
            {asciiTreeText}
          </pre>

          <div className="pt-2 text-slate-400 space-y-2 text-[11px] font-sans">
            <p className="font-bold text-slate-300">Resumo Teórico do Pipeline:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">Import Engine:</strong> Recebe acervos bibliográficos bruto (PDF, DOCX, EPUB) e executa parsing estrutural.</li>
              <li><strong className="text-white">Medical Intelligence:</strong> Aplica a taxonomia de 54 especialidades, calcula o índice High Yield e gera regras de consensos.</li>
              <li><strong className="text-white">Knowledge Graph:</strong> Converte trechos em vetores densos (text-embedding-004) e conecta termos médicos em grafo bidirecional.</li>
              <li><strong className="text-white">AI Engine:</strong> Consome os contextos recuperados e gera flashcards MedAnki e explicações com Gemini 2.5 Flash.</li>
              <li><strong className="text-white">Question Engine:</strong> Organiza bancos de questões por banca examinadora e gerencia a repetição espaçada SM-2.</li>
            </ul>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: PIPELINE MATRIX */}
      {viewMode === 'pipeline' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Fluxo Sequencial de Dados no MedCore</h3>
              <p className="text-xs text-slate-400">
                Transformação de documentos brutos em conhecimento médico estruturado e flashcards
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {MEDCORE_ARCHITECTURE.map((node, idx) => (
              <div key={node.id} className="relative group">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 h-full flex flex-col justify-between hover:border-indigo-500/50 transition-all">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                        Etapa {idx + 1}
                      </span>
                      {React.createElement(node.icon, { className: 'w-4 h-4 text-indigo-400' })}
                    </div>
                    <h4 className="text-xs font-bold text-white">{node.name}</h4>
                    <p className="text-[11px] text-slate-400 leading-snug">{node.description}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>{node.version}</span>
                  </div>
                </div>

                {/* Arrow connector between steps on desktop */}
                {idx < MEDCORE_ARCHITECTURE.length - 1 && (
                  <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 items-center justify-center text-slate-400">
                    <ArrowRight className="w-3 h-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
