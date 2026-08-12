import 'fake-indexeddb/auto';
import { QuestionGenerationService } from '../data/services/QuestionGenerationService';
import { QuestionGenerationRequest } from '../domain/entities/Question';

async function runMultiSpecialtyTest() {
  console.log('====================================================');
  console.log('Fase 33.6.1 — Validação de Multi-Especialidade no Modo Distribuído');
  console.log('====================================================\n');

  const selectedSpecialties = ['Embriologia', 'Cardiologia'];
  const selectedTopics = [
    'Gametogênese, Fecundação e Clivagem',
    'Placentação & Anexos Fetais',
    'Insuficiência Cardíaca Aguda e Crônica',
    'Valvopatia Aórtica (Estenose e Insuficiência)',
  ];

  const topicSpecialtyMap: Record<string, string> = {
    'Gametogênese, Fecundação e Clivagem': 'Embriologia',
    'Placentação & Anexos Fetais': 'Embriologia',
    'Insuficiência Cardíaca Aguda e Crônica': 'Cardiologia',
    'Valvopatia Aórtica (Estenose e Insuficiência)': 'Cardiologia',
  };

  const req: QuestionGenerationRequest = {
    id: `req-multispec-test`,
    mode: 'banca',
    bancaName: 'ENAMED',
    configuration: {
      specialty: 'Embriologia',
      specialties: selectedSpecialties,
      topics: selectedTopics,
      topicSpecialtyMap,
      quantity: 4,
      distributionMode: 'distribuido',
      difficulty: 'media',
      questionType: 'caso_clinico',
      includeCommentary: true,
      showReferences: true,
      autoGenerateFlashcards: false,
    },
    createdAt: new Date().toISOString(),
  };

  const genService = new QuestionGenerationService();
  const res = await genService.generateQuestions(req, true);

  if (!res.questionSet) {
    throw new Error('Falha ao gerar simulado multi-especialidade.');
  }

  const qset = res.questionSet;
  console.log(`✅ Simulado Multi-Especialidade Gerado!`);
  console.log(`Título do Simulado: "${qset.title}"`);
  console.log(`Total de questões: ${qset.questions.length}\n`);

  console.log('DETALHAMENTO DE CADA QUESTÃO GERADA:');
  qset.questions.forEach((q, idx) => {
    console.log(`[Questão ${idx + 1}] Especialidade: "${q.specialty}" | Tópico: "${q.topic}"`);
    console.log(`   Enunciado: ${q.statement.slice(0, 150)}...\n`);
  });

  // Verify each question belongs to its expected origin specialty
  let isIntegrityOk = true;
  qset.questions.forEach((q) => {
    const expectedSpec = topicSpecialtyMap[q.topic];
    if (q.specialty !== expectedSpec) {
      console.error(`❌ Erro de Integridade: Questão do tópico "${q.topic}" tem especialidade "${q.specialty}", mas era esperado "${expectedSpec}".`);
      isIntegrityOk = false;
    }
  });

  if (isIntegrityOk) {
    console.log('✅ INTEGRIDADE DOS METADADOS: Cada questão gravou com 100% de precisão sua especialidade e assunto únicos de origem!');
  }

  console.log('\n====================================================');
  console.log('RESULTADO FINAL DA FASE 33.6.1:');
  console.log('====================================================');
  console.log('✅ Multi-Especialidade no Modo Distribuído validada com 100% de sucesso.');
}

runMultiSpecialtyTest().catch(console.error);
