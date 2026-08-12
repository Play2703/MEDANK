export interface MedicalConcept {
  canonicalId: string;
  preferredTerm: string;
  synonyms: string[];
  category: string;
  icd10?: string;
}

export class MedicalOntologyEngine {
  private static instance: MedicalOntologyEngine;
  private ontologyMap: Map<string, MedicalConcept> = new Map();

  private constructor() {
    this.registerDefaultConcepts();
  }

  public static getInstance(): MedicalOntologyEngine {
    if (!MedicalOntologyEngine.instance) {
      MedicalOntologyEngine.instance = new MedicalOntologyEngine();
    }
    return MedicalOntologyEngine.instance;
  }

  private registerDefaultConcepts(): void {
    const concepts: MedicalConcept[] = [
      {
        canonicalId: 'IAM_001',
        preferredTerm: 'Infarto Agudo do Miocárdio',
        synonyms: ['IAM', 'Acute Myocardial Infarction', 'AMI', 'Ataque Cardíaco', 'Infarto do Miocárdio'],
        category: 'Cardiologia',
        icd10: 'I21',
      },
      {
        canonicalId: 'AVC_002',
        preferredTerm: 'Acidente Vascular Cerebral',
        synonyms: ['AVC', 'Stroke', 'CVA', 'DAVP', 'Derrame Cerebral'],
        category: 'Neurologia',
        icd10: 'I64',
      },
      {
        canonicalId: 'HAS_003',
        preferredTerm: 'Hipertensão Arterial Sistêmica',
        synonyms: ['HAS', 'Pressão Alta', 'Hypertension', 'HTN'],
        category: 'Cardiologia',
        icd10: 'I10',
      },
      {
        canonicalId: 'DM_004',
        preferredTerm: 'Diabetes Mellitus',
        synonyms: ['DM', 'Diabetes', 'DM2', 'DM1'],
        category: 'Endocrinologia',
        icd10: 'E11',
      },
    ];

    for (const concept of concepts) {
      this.ontologyMap.set(concept.canonicalId, concept);
      for (const syn of concept.synonyms) {
        this.ontologyMap.set(syn.toLowerCase(), concept);
      }
      this.ontologyMap.set(concept.preferredTerm.toLowerCase(), concept);
    }
  }

  public normalizeTerm(term: string): MedicalConcept | null {
    const lower = term.toLowerCase().trim();
    return this.ontologyMap.get(lower) || null;
  }

  public getCanonicalTerm(term: string): string {
    const concept = this.normalizeTerm(term);
    return concept ? concept.preferredTerm : term;
  }
}

export const medicalOntologyEngine = MedicalOntologyEngine.getInstance();
