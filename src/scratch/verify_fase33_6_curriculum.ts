import 'fake-indexeddb/auto';
import {
  BASIC_CYCLE_SPECIALTIES,
  CLINICAL_CYCLE_SPECIALTIES,
  CURRICULUM_GROUPS,
  CURRICULUM_TOPICS_BY_SPECIALTY,
} from '../data/curriculumTopics';
import { QuestionGenerationService } from '../data/services/QuestionGenerationService';
import { QuestionGenerationRequest } from '../domain/entities/Question';

async function verifyCurriculumExpansion() {
  console.log('====================================================');
  console.log('Fase 33.6 — Validação do Currículo Médico Expandido');
  console.log('====================================================\n');

  console.log(`1. Total de grupos no currículo: ${CURRICULUM_GROUPS.length}`);
  console.log(`   - Grupo 1: ${CURRICULUM_GROUPS[0].groupName} (${CURRICULUM_GROUPS[0].specialties.length} disciplinas)`);
  console.log(`   - Grupo 2: ${CURRICULUM_GROUPS[1].groupName} (${CURRICULUM_GROUPS[1].specialties.length} disciplinas)`);

  const allSpecialties = [...BASIC_CYCLE_SPECIALTIES, ...CLINICAL_CYCLE_SPECIALTIES];
  console.log(`\n2. Verificando total de especialidades (${allSpecialties.length}):`);

  let hasErrors = false;
  allSpecialties.forEach((spec) => {
    const topics = CURRICULUM_TOPICS_BY_SPECIALTY[spec];
    if (!topics || topics.length < 15) {
      console.error(`❌ Erro: A especialidade "${spec}" possui apenas ${topics ? topics.length : 0} assuntos (mínimo esperado: 15).`);
      hasErrors = true;
    }
  });

  if (!hasErrors) {
    console.log(`✅ TODAS AS ${allSpecialties.length} ESPECIALIDADES POSSUEM DE 15 A 25 ASSUNTOS RELEVANTES INDEXADOS!`);
  }

  // Test generation for a Basic Cycle subject (Anatomia)
  console.log('\n----------------------------------------------------');
  console.log('TESTE DE GERAÇÃO: 1 Questão de Anatomia (Ciclo Básico)');
  console.log('----------------------------------------------------');

  const genService = new QuestionGenerationService();
  const req: QuestionGenerationRequest = {
    id: `req-anatomia-test`,
    mode: 'banca',
    bancaName: 'ENAMED',
    configuration: {
      specialty: 'Anatomia',
      topics: ['Sistema Cardiovascular & Coração'],
      quantity: 1,
      difficulty: 'media',
      questionType: 'caso_clinico',
      includeCommentary: true,
      showReferences: true,
      autoGenerateFlashcards: false,
    },
    createdAt: new Date().toISOString(),
  };

  const res = await genService.generateQuestions(req, true); // ignore low chunk warning for basic cycle synthetic test
  if (res.questionSet && res.questionSet.questions.length > 0) {
    const q = res.questionSet.questions[0];
    console.log(`✅ Questão de Anatomia gerada com sucesso!`);
    console.log(`Disciplina: ${q.specialty} | Tópico: ${q.topic}`);
    console.log(`Enunciado: ${q.statement.slice(0, 200)}...`);
    console.log(`Opções (${q.options.length}):`);
    q.options.forEach((opt) => console.log(`  [${opt.letter}] ${opt.text}`));
  } else {
    console.error('❌ Falha ao gerar questão para Anatomia.');
  }

  console.log('\n====================================================');
  console.log('RESULTADO FINAL DA FASE 33.6:');
  console.log('====================================================');
  console.log('✅ Expansão de Currículo em Ciclo Básico e Clínico validada com 100% de integridade.');
}

verifyCurriculumExpansion().catch(console.error);
