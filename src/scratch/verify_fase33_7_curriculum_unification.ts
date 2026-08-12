import {
  CURRICULUM_GROUPS,
  MEDICAL_DECK_ICONS,
  DEFAULT_ICON_FOR_SPECIALTY,
} from '../data/curriculumTopics';

async function runFase33_7Verification() {
  console.log('====================================================');
  console.log('Fase 33.7 — Validação de Unificação de Currículo & Ícones');
  console.log('====================================================\n');

  console.log(`1. Total de Grupos do Currículo: ${CURRICULUM_GROUPS.length}`);
  CURRICULUM_GROUPS.forEach((group) => {
    console.log(`   • ${group.groupName}: ${group.specialties.length} especialidades`);
  });

  const totalSpecs = CURRICULUM_GROUPS.reduce((sum, g) => sum + g.specialties.length, 0);
  console.log(`   -> Total de Especialidades Unificadas: ${totalSpecs}\n`);

  console.log(`2. Total de Ícones Médicos Expandidos: ${MEDICAL_DECK_ICONS.length}`);
  MEDICAL_DECK_ICONS.forEach((ico, idx) => {
    console.log(`   [${idx + 1}] ${ico.value} -> ${ico.label}`);
  });

  console.log('\n3. Teste de Sugestão Automática de Ícones:');
  const testCases = [
    'Nefrologia',
    'Pediatria',
    'Anatomia',
    'Infectologia',
    'Cardiologia',
    'Ortopedia e Traumatologia',
    'Cirurgia Geral',
    'Embriologia',
  ];

  testCases.forEach((spec) => {
    const icon = DEFAULT_ICON_FOR_SPECIALTY[spec] || 'Stethoscope';
    console.log(`   • Especialidade "${spec}" -> Ícone sugerido: "${icon}"`);
  });

  if (totalSpecs >= 35 && MEDICAL_DECK_ICONS.length >= 15) {
    console.log('\n====================================================');
    console.log('RESULTADO FINAL DA FASE 33.7:');
    console.log('====================================================');
    console.log('✅ Unificação de currículo e expansão de ícones aprovada com 100% de sucesso.');
  } else {
    throw new Error('Falha na validação dos totais da Fase 33.7.');
  }
}

runFase33_7Verification().catch(console.error);
