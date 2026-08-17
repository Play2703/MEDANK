export enum KnowledgeCategory {
  book = 'book',
  residencyExam = 'residencyExam',
  professorExam = 'professorExam',
  guideline = 'guideline',
  article = 'article',
  slide = 'slide',
  summary = 'summary',
  protocol = 'protocol',
  clinicalCase = 'clinicalCase',
  flashcard = 'flashcard',
  manual = 'manual',
  apostila = 'apostila',
  other = 'other',
}

export class KnowledgeCategoryMapper {
  public static toDisplayName(category: KnowledgeCategory): string {
    switch (category) {
      case KnowledgeCategory.book:
        return 'Livro';
      case KnowledgeCategory.residencyExam:
        return 'Provas & Banco de Questões';
      case KnowledgeCategory.professorExam:
        return 'Prova de Professor';
      case KnowledgeCategory.guideline:
        return 'Diretriz';
      case KnowledgeCategory.article:
        return 'Artigo';
      case KnowledgeCategory.slide:
        return 'Slide';
      case KnowledgeCategory.summary:
        return 'Resumo';
      case KnowledgeCategory.protocol:
        return 'Protocolo';
      case KnowledgeCategory.clinicalCase:
        return 'Caso Clínico';
      case KnowledgeCategory.flashcard:
        return 'Flashcard';
      case KnowledgeCategory.manual:
        return 'Manual';
      case KnowledgeCategory.apostila:
        return 'Apostila';
      case KnowledgeCategory.other:
      default:
        return 'Outro';
    }
  }

  public static fromDisplayName(name: string): KnowledgeCategory {
    const normalized = name.toLowerCase().trim();
    if (normalized.includes('livro') || normalized.includes('book')) return KnowledgeCategory.book;
    if (
      normalized.includes('prova') ||
      normalized.includes('residencia') ||
      normalized.includes('residency') ||
      normalized.includes('questoes') ||
      normalized.includes('question') ||
      normalized.includes('banco')
    ) {
      return KnowledgeCategory.residencyExam;
    }
    if (normalized.includes('professor') || normalized.includes('banca')) return KnowledgeCategory.professorExam;
    if (normalized.includes('diretriz') || normalized.includes('guideline') || normalized.includes('sbc') || normalized.includes('amb')) return KnowledgeCategory.guideline;
    if (normalized.includes('artigo') || normalized.includes('article') || normalized.includes('paper')) return KnowledgeCategory.article;
    if (normalized.includes('slide') || normalized.includes('apresentacao')) return KnowledgeCategory.slide;
    if (normalized.includes('resumo') || normalized.includes('summary')) return KnowledgeCategory.summary;
    if (normalized.includes('protocolo') || normalized.includes('protocol')) return KnowledgeCategory.protocol;
    if (normalized.includes('caso') || normalized.includes('clinical')) return KnowledgeCategory.clinicalCase;
    if (normalized.includes('flashcard') || normalized.includes('anki')) return KnowledgeCategory.flashcard;
    if (normalized.includes('manual')) return KnowledgeCategory.manual;
    if (normalized.includes('apostila')) return KnowledgeCategory.apostila;
    return KnowledgeCategory.other;
  }

  public static fromFileName(fileName: string): KnowledgeCategory {
    const lower = fileName.toLowerCase();
    if (lower.includes('harrison') || lower.includes('goldman') || lower.includes('sabiston') || lower.includes('netter') || lower.includes('livro') || lower.includes('book')) {
      return KnowledgeCategory.book;
    }
    if (
      lower.includes('enare') ||
      lower.includes('residência') ||
      lower.includes('residencia') ||
      lower.includes('usp') ||
      lower.includes('unifesp') ||
      lower.includes('revalida') ||
      lower.includes('prova') ||
      lower.includes('exam') ||
      lower.includes('questoes')
    ) {
      return KnowledgeCategory.residencyExam;
    }
    if (lower.includes('sbc') || lower.includes('diretriz') || lower.includes('guideline') || lower.includes('protocolo')) {
      return KnowledgeCategory.guideline;
    }
    if (lower.includes('artigo') || lower.includes('nejm') || lower.includes('lancet') || lower.includes('jama')) {
      return KnowledgeCategory.article;
    }
    if (lower.includes('apostila') || lower.includes('manual')) {
      return KnowledgeCategory.manual;
    }
    return KnowledgeCategory.other;
  }

  public static fromMetadata(metadata: any): KnowledgeCategory {
    if (!metadata) return KnowledgeCategory.other;
    if (metadata.category) return this.fromDisplayName(metadata.category);
    if (metadata.tipo) return this.fromDisplayName(metadata.tipo);
    if (metadata.filename) return this.fromFileName(metadata.filename);
    return KnowledgeCategory.other;
  }

  public static getIcon(category: KnowledgeCategory): string {
    switch (category) {
      case KnowledgeCategory.book:
        return 'menu_book';
      case KnowledgeCategory.residencyExam:
      case KnowledgeCategory.professorExam:
        return 'quiz';
      case KnowledgeCategory.guideline:
      case KnowledgeCategory.protocol:
        return 'gavel';
      case KnowledgeCategory.article:
      case KnowledgeCategory.summary:
      case KnowledgeCategory.slide:
        return 'description';
      case KnowledgeCategory.clinicalCase:
        return 'local_hospital';
      case KnowledgeCategory.flashcard:
        return 'style';
      case KnowledgeCategory.manual:
      case KnowledgeCategory.apostila:
        return 'menu_book';
      case KnowledgeCategory.other:
      default:
        return 'folder';
    }
  }

  public static getColor(category: KnowledgeCategory): string {
    switch (category) {
      case KnowledgeCategory.book:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case KnowledgeCategory.residencyExam:
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case KnowledgeCategory.guideline:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case KnowledgeCategory.article:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    }
  }

  public static isMedicalContent(category: KnowledgeCategory): boolean {
    return category !== KnowledgeCategory.other;
  }

  public static isQuestionSource(category: KnowledgeCategory): boolean {
    return (
      category === KnowledgeCategory.residencyExam ||
      category === KnowledgeCategory.professorExam
    );
  }

  public supportsOCR(category: KnowledgeCategory): boolean {
    return true;
  }

  public supportsEmbeddings(category: KnowledgeCategory): boolean {
    return true;
  }

  public supportsKnowledgeGraph(category: KnowledgeCategory): boolean {
    return category !== KnowledgeCategory.other;
  }
}
