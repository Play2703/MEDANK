import fs from 'fs';
import path from 'path';
import { PDFExamRenderService } from '../services/PDFExamRenderService';
import { QuestionSet } from '../domain/entities/Question';

async function main() {
  const fakeSet: QuestionSet = {
    id: 'qset-test-pdf',
    title: 'Simulado de Emergências Médicas e Sinais Vitais',
    request: {
      id: 'req-pdf',
      bancaName: 'Banca ENARE / Medicina de Emergência',
      createdAt: new Date().toISOString(),
      configuration: {
        specialty: 'Medicina de Emergência',
        topics: ['Insuficiência Respiratória Aguda', 'Choque Anafilático', 'Parada Cardiorrespiratória (PCR)'],
        quantity: 10,
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
    },
    totalQuestions: 10,
    answeredCount: 0,
    correctCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: [
      {
        id: 'q-1',
        setId: 'qset-test-pdf',
        statement: 'Paciente masculino, 45 anos, levado ao pronto-socorro com quadro de dispneia súbita, estidores inspiratórios e urticária disseminada minutos após ingestão de frutos do mar. Ao exame: PA 80/50 mmHg, FC 125 bpm, FR 28 irpm, SpO2 88% em ar ambiente. Diante desse cenário de anafilaxia grave com colapso circulatório, qual a conduta imediata de primeira linha indicada?',
        options: [
          { id: 'opt-1-A', letter: 'A', text: 'Administrar Hidrocortisona 500mg IV e Anti-histamínico H1 IV de imediato.', isCorrect: false, explanation: 'Corticoides têm início de ação lento (4-6 horas) e não revertem colapso hemodinâmico agudo.' },
          { id: 'opt-1-B', letter: 'B', text: 'Aplicar Adrenalina (Epinefrina) 1:1.000 (0,5 mg) IM na face anterolateral da coxa.', isCorrect: true, explanation: 'A adrenalina IM é o único fármaco de 1ª linha na anafilaxia grave, agindo rapidamente nos receptores alfa e beta.' },
          { id: 'opt-1-C', letter: 'C', text: 'Iniciar nebulização contínua com Fenoterol e Ipratrópio antes de qualquer medicação parenterais.', isCorrect: false, explanation: 'Broncodilatadores inalatórios tratam broncoespasmo, mas não tratam o edema laríngeo nem a hipotensão grave.' },
          { id: 'opt-1-D', letter: 'D', text: 'Solicitar intubação orotraquial de sequência rápida sem tentativa prévia de oxigenoterapia.', isCorrect: false, explanation: 'Intubação é reservada para via aérea iminentemente obstruída; a adrenalina IM imediata previne o colapso das vias aéreas.' },
        ],
        correctOptionId: 'opt-1-B',
        commentary: {
          correta: 'Na anafilaxia (envolvimento de 2 ou mais sistemas ou hipotensão arterial pós-exposição a alérgeno provável), a Adrenalina intramuscular (1:1.000, dose de 0.3 a 0.5 mg em adultos) na coxa anterolateral é a intervenção prioritária e salva-vidas de primeira linha.',
          porOpcao: {
            A: 'Corticoides e anti-histamínicos têm início de ação lento e não revertem o colapso vascular agudo nem o edema laríngeo.',
            B: 'Epinefrina IM é o único fármaco de 1ª linha capaz de agir em receptores alfa-1 e beta-2 simultaneamente.',
            C: 'Broncodilatadores inalatórios atuam no broncoespasmo mas não tratam a vasodilatação sistêmica nem a via aérea superior.',
            D: 'A intubação sem tentativa de adrenalina IM e oxigenação agrava a instabilidade hemodinâmica.',
          },
          correlacaoClinica: 'Conduta imediata salva-vidas na anafilaxia grave conforme diretriz WAO / ASBAI.',
        },
        references: ['Guidelines da WAO (World Allergy Organization) 2020', 'Diretriz Brasileira de Anafilaxia - ASBAI'],
        specialty: 'Medicina de Emergência',
        topic: 'Choque Anafilático',
        difficulty: 'media',
        questionType: 'caso_clinico',
        isAnswered: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q-2',
        setId: 'qset-test-pdf',
        statement: 'Durante o atendimento a uma parada cardiorrespiratória (PCR) em ritmo chocável (Fibrilação Ventricular) no ambiente hospitalar, qual a sequência correta de choques e medicações de acordo com as diretrizes da AHA (American Heart Association)?',
        options: [
          { id: 'opt-2-A', letter: 'A', text: '1º Choque -> Adrenalina 1mg IV imediatamente -> 2º Choque -> Amiodarona 300mg IV.', isCorrect: false, explanation: 'A Adrenalina na FV/TVSP só é administrada após o 2º choque.' },
          { id: 'opt-2-B', letter: 'B', text: '1º Choque -> RCP 2 min -> 2º Choque -> Adrenalina 1mg IV -> RCP 2 min -> 3º Choque -> Amiodarona 300mg IV.', isCorrect: true, explanation: 'Sequência oficial AHA para ritmos chocáveis: desfibrilação precoce, vasopressor após 2º choque, antiarrítmico após 3º choque.' },
          { id: 'opt-2-C', letter: 'C', text: 'Adrenalina 1mg IV de entrada -> Desfibrilação com 360J -> Sulfato de Magnésio 2g IV.', isCorrect: false, explanation: 'Magnésio só é indicado em Torsades de Pointes.' },
          { id: 'opt-2-D', letter: 'D', text: '1º Choque -> Amiodarona 150mg IV -> RCP 2 min -> Adrenalina 2mg IV.', isCorrect: false, explanation: 'Doses e ordem incorretas.' },
        ],
        correctOptionId: 'opt-2-B',
        commentary: 'Na PCR por FV ou TV sem pulso, a prioridade absoluta é a desfibrilação precoce associada à RCP de alta qualidade. Adrenalina 1mg IV/IO é administrada a cada 3 a 5 minutos a partir da 2ª desfibrilação. Amiodarona (300mg 1ª dose, 150mg 2ª dose) ou Lidocaína é indicada se refratariedade após o 3º choque.',
        references: ['AHA ACLS Guidelines 2020/2023'],
        specialty: 'Medicina de Emergência',
        topic: 'Parada Cardiorrespiratória',
        difficulty: 'media',
        questionType: 'caso_clinico',
        isAnswered: false,
        createdAt: new Date().toISOString(),
      },
    ],
  };

  // Add 8 more questions to make 10 questions total for test
  for (let i = 3; i <= 10; i++) {
    fakeSet.questions.push({
      id: `q-${i}`,
      setId: 'qset-test-pdf',
      statement: `Questão modelo #${i} de emergência clínica e monitorização de sinais vitais em paciente crítico. Avalie a hipótese diagnóstica principal baseada nas diretrizes médicas de conduta urgencial.`,
      options: [
        { id: `opt-${i}-A`, letter: 'A', text: `Alternativa A de teste para a questão de número ${i}.`, isCorrect: i % 4 === 1, explanation: 'Explicação A' },
        { id: `opt-${i}-B`, letter: 'B', text: `Alternativa B de teste para a questão de número ${i}.`, isCorrect: i % 4 === 2, explanation: 'Explicação B' },
        { id: `opt-${i}-C`, letter: 'C', text: `Alternativa C de teste para a questão de número ${i}.`, isCorrect: i % 4 === 3, explanation: 'Explicação C' },
        { id: `opt-${i}-D`, letter: 'D', text: `Alternativa D de teste para a questão de número ${i}.`, isCorrect: i % 4 === 0, explanation: 'Explicação D' },
      ],
      correctOptionId: `opt-${i}-${['D', 'A', 'B', 'C'][i % 4]}`,
      commentary: `Comentário detalhado da questão #${i} abordando a conduta diagnóstica e terapêutica preconizada pelas sociedades de emergência médica.`,
      references: ['Diretriz Brasileira de Medicina de Emergência'],
      specialty: 'Medicina de Emergência',
      topic: 'Sinais Vitais e Emergências',
      difficulty: 'media',
      questionType: 'caso_clinico',
      isAnswered: false,
      createdAt: new Date().toISOString(),
    });
  }

  const pdfBuffer = await PDFExamRenderService.generatePDFBuffer(fakeSet);
  const outputPath = path.join(process.cwd(), 'EMERGÊNCIAS_MÉDICAS_E_SINAIS_VITAIS.pdf');
  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`✅ PDF gerado com sucesso em: ${outputPath} (${pdfBuffer.length} bytes)`);
}

main().catch(console.error);
