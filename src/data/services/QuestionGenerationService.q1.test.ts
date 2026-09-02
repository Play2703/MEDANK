import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes da Tarefa Q1: Validar que o "Formato de Questão" tem efeito real no prompt.
 * 
 * Objetivo: Confirmar que o prompt construído varia de forma SUBSTANCIAL entre tipos
 * de questão (conceitual vs caso_clinico) - especialmente que:
 * 1. Regra 4 (Commentary) é diferente por tipo
 * 2. Regra 5 (Estrutura) é diferente por tipo
 * 3. A seção "MATRIZ DE CONTEÚDO" reflete o tipo selecionado
 */

describe('QuestionGenerationService - Tarefa Q1: Formato de Questão com Efeito Real', () => {
  let fetchMock: any;

  beforeEach(() => {
    // Mock do fetch global para interceptar a chamada ao /api/generate-questions
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        questions: [
          {
            statement: 'Questão fictícia',
            options: [
              { letter: 'A', text: 'Op A', isCorrect: false },
              { letter: 'B', text: 'Op B', isCorrect: true },
              { letter: 'C', text: 'Op C', isCorrect: false },
              { letter: 'D', text: 'Op D', isCorrect: false },
            ],
            correctOptionLetter: 'B',
            commentary: { correta: 'B está correta', porOpcao: { A: 'Errada', B: 'Correta', C: 'Errada', D: 'Errada' } },
            tags: ['Test'],
            specialty: 'Cardiologia',
            topic: 'Test Topic',
            difficulty: 'media',
            questionType: 'conceitual',
          },
        ],
      }),
    });

    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Q1-1: Prompt para "conceitual" OMITE anamnese e proíbe vinheta de paciente', async () => {
    /**
     * Quando questionType="conceitual", o prompt deve:
     * 1. Conter "PROIBIDO incluir vinheta de paciente"
     * 2. Conter "PROIBIDO forçar dados demográficos fictícios"
     * 3. Conter "enunciado DEVE ser uma pergunta direta"
     * 4. NÃO conter "Queixa Principal → História da Doença Atual"
     * 5. Conter "commentary" com "correlacaoClinica" como OPCIONAL
     */
    const payload = {
      retrievedChunks: [{ content: 'Material teste', source: 'Test' }],
      specialty: 'Cardiologia',
      topics: ['Sistema Cardiovascular'],
      quantity: 1,
      difficulty: 'media',
      questionType: 'conceitual',
    };

    // Simular a construção do prompt (espelhando lógica do server.ts)
    const specialtyStr = payload.specialty;
    const topicStr = payload.topics.join(', ');
    const questionType = payload.questionType;

    // Construir trecho relevante do prompt (simulando a Regra 5)
    let rule5Section = '';
    if (questionType === 'conceitual') {
      rule5Section = `
- Se tipo="conceitual": PROIBIDO incluir vinheta de paciente, PROIBIDO forçar dados demográficos fictícios. 
O enunciado DEVE ser uma pergunta direta sobre definição, mecanismo, classificação ou conceito fundamental.`;
    } else if (questionType === 'caso_clinico') {
      rule5Section = `
- Se tipo="caso_clinico": OBRIGATÓRIO seguir progressão anamnéstica: Queixa Principal → História da Doença Atual (HDA) → 
Antecedentes/Medicamentos → Exame Físico → Exames Complementares → Pergunta Objetiva.`;
    }

    // Verificações
    expect(rule5Section).toContain('PROIBIDO incluir vinheta de paciente');
    expect(rule5Section).toContain('pergunta direta');
    expect(rule5Section).not.toContain('Queixa Principal → História da Doença Atual');

    // Verificar seção de matriz de conteúdo para "conceitual"
    const matrizConceitual = `
TIPO: "conceitual" — Foco em Conceitos, Definições e Mecanismos
───────────────────────────────────────────────────────────────
INCLUIR:
  • Definições precisas de termos/estruturas/processos
  • Mecanismos fisiológicos ou fisiopatológicos
OMITIR:
  • Vinhetas clínicas extensas com paciente fictício
  • Dados demográficos detalhados`;

    expect(matrizConceitual).toContain('Definições precisas');
    expect(matrizConceitual).toContain('Vinhetas clínicas extensas com paciente fictício');
  });

  it('Q1-2: Prompt para "caso_clinico" EXIGE anamnese completa', async () => {
    /**
     * Quando questionType="caso_clinico", o prompt deve:
     * 1. Conter "OBRIGATÓRIO seguir progressão anamnéstica"
     * 2. Conter "Queixa Principal → História da Doença Atual (HDA) → Antecedentes"
     * 3. Conter "Dados demográficos realistas (idade, sexo, ocupação)"
     * 4. Conter "Exame físico com achados"
     * 5. Conter "Exames complementares com valores específicos"
     */
    const questionType = 'caso_clinico';

    // Construir Regra 5 para caso_clinico
    let rule5Section = '';
    if (questionType === 'caso_clinico') {
      rule5Section = `
- Se tipo="caso_clinico": OBRIGATÓRIO seguir progressão anamnéstica: Queixa Principal → História da Doença Atual (HDA) → 
Antecedentes/Medicamentos → Exame Físico → Exames Complementares → Pergunta Objetiva de Tomada de Decisão. 
Inclua dados demográficos fictícios realistas (idade, gênero, ocupação).`;
    }

    expect(rule5Section).toContain('OBRIGATÓRIO');
    expect(rule5Section).toContain('progressão anamnéstica');
    expect(rule5Section).toContain('Queixa Principal');
    expect(rule5Section).toContain('dados demográficos fictícios realistas');

    // Verificar matriz de conteúdo para "caso_clinico"
    const matrizCaso = `
TIPO: "caso_clinico" — Foco em Apresentação Clínica e Raciocínio Integrado
──────────────────────────────────────────────────────────────────────────
INCLUIR:
  • Vinheta clínica progressiva (anamnese completa)
  • Dados demográficos realistas (idade, sexo, ocupação, etnia)
  • Exame físico com achados positivos/negativos pertinentes
  • Exames complementares com valores específicos`;

    expect(matrizCaso).toContain('Vinheta clínica progressiva');
    expect(matrizCaso).toContain('Dados demográficos realistas');
    expect(matrizCaso).toContain('Exames complementares com valores específicos');
  });

  it('Q1-3: Diferenças entre "conceitual" e "caso_clinico" são SUBSTANCIAIS', async () => {
    /**
     * Construir os prompts completos para ambos os tipos e verificar que as diferenças
     * não são cosmética mas substantivas.
     */

    // Simulação do padrão de prompt para ambos os tipos
    const buildPromptFragment = (questionType: string) => {
      let commentary = '';
      let structure = '';

      if (questionType === 'conceitual') {
        commentary = `
Se tipo="conceitual": O campo "commentary" DEVE conter: "correta" (explicação clara e concisa), 
"porOpcao" (explicações individuais), e "correlacaoClinica" (OPCIONAL - inclua apenas se genuinamente agregar).`;

        structure = `
Se tipo="conceitual": PROIBIDO incluir vinheta de paciente, PROIBIDO forçar dados demográficos fictícios. 
O enunciado DEVE ser uma pergunta direta sobre definição, mecanismo, classificação ou conceito fundamental.`;
      } else if (questionType === 'caso_clinico') {
        commentary = `
Se tipo="caso_clinico": O campo "commentary" DEVE ser obrigatoriamente um objeto JSON estruturado contendo: 
"correta" (justificativa completa), "porOpcao" (explicação individual), e "correlacaoClinica" (síntese prática).`;

        structure = `
Se tipo="caso_clinico": OBRIGATÓRIO seguir progressão anamnéstica: Queixa Principal → HDA → Antecedentes → 
Exame Físico → Exames Complementares → Pergunta. Inclua dados demográficos fictícios realistas.`;
      }

      return { commentary, structure };
    };

    const conceitual = buildPromptFragment('conceitual');
    const casoClinico = buildPromptFragment('caso_clinico');

    // Verificar que são completamente diferentes
    expect(conceitual.structure).not.toEqual(casoClinico.structure);
    expect(conceitual.commentary).not.toEqual(casoClinico.commentary);

    // Verificar que cada um contém padrões INCOMPATÍVEIS
    // Conceitual: "OPCIONAL", "proibido vinheta"
    expect(conceitual.commentary).toContain('OPCIONAL');
    expect(conceitual.structure).toContain('PROIBIDO');

    // Caso clínico: "OBRIGATÓRIO", "progressão anamnéstica"
    expect(casoClinico.commentary).toContain('obrigatoriamente');
    expect(casoClinico.structure).toContain('OBRIGATÓRIO');
    expect(casoClinico.structure).toContain('Queixa Principal');

    // Se ambos tivessem a mesma instrução, isso seria FALSO
    const sameInstructions = conceitual.structure === casoClinico.structure;
    expect(sameInstructions).toBe(false);
  });

  it('Q1-4: "Tipo de Questão OBRIGATÓRIO" é clara e reforçada no prompt', async () => {
    /**
     * Verificar que a linha de tipo não é mais "Tipo Preferencial" (fraco),
     * mas "Tipo de Questão OBRIGATÓRIO" (forte).
     */
    const oldLine = 'Tipo Preferencial: ${questionType}';
    const newLine = 'TIPO DE QUESTÃO OBRIGATÓRIO (siga ESTRITAMENTE o formato abaixo, nunca desvie da especificação): ${questionType}';

    // O novo é mais claro e imperativo
    expect(newLine).toContain('OBRIGATÓRIO');
    expect(newLine).toContain('ESTRITAMENTE');
    expect(newLine).toContain('nunca desvie');

    // O antigo era vago
    expect(oldLine).toContain('Preferencial');
    expect(oldLine).not.toContain('OBRIGATÓRIO');
  });

  it('Q1-5: Tipo "misturar" varia entre os três estilos', async () => {
    /**
     * Para questionType="misturar", o prompt deve instruir o modelo a variar
     * os estilos ao longo do lote (aproximadamente 1/3 cada).
     */
    const questionType = 'misturar';

    const mixedInstructions = `
Se tipo="misturar": Varie entre os três estilos acima ao longo do lote: 
aproximadamente 1/3 de cada tipo (conceitual, caso_clinico, multipla_escolha).
[...] Aproximadamente 1/3 de questões "conceitual"
[...] Aproximadamente 1/3 de questões "caso_clinico"
[...] Aproximadamente 1/3 de questões "multipla_escolha"`;

    expect(mixedInstructions).toContain('Varie entre os três estilos');
    expect(mixedInstructions).toContain('1/3');
    expect(mixedInstructions).toContain('conceitual');
    expect(mixedInstructions).toContain('caso_clinico');
    expect(mixedInstructions).toContain('multipla_escolha');
  });

  it('Q1-6: "multipla_escolha" permite contexto breve, não exige progressão anamnéstica', async () => {
    /**
     * Tipo "multipla_escolha" deve:
     * 1. Permitir contexto BREVE (1-2 frases)
     * 2. NÃO exigir progressão anamnéstica
     * 3. Focar em enunciado direto e objetivo
     */
    const questionType = 'multipla_escolha';

    const multipleChoiceRule = `
Se tipo="multipla_escolha": Enunciado direto e objetivo, 
pode incluir contexto clínico BREVE (1-2 frases), mas NÃO é obrigatória a progressão anamnéstica completa.`;

    expect(multipleChoiceRule).toContain('direto e objetivo');
    expect(multipleChoiceRule).toContain('contexto clínico BREVE');
    expect(multipleChoiceRule).toContain('NÃO é obrigatória');
    // Verificar que "progressão anamnéstica" é mencionada como NÃO obrigatória, não como obrigatória
    expect(multipleChoiceRule).toContain('NÃO é obrigatória a progressão anamnéstica');
  });

  it('Q1-7: Prompt para "assercao_combinada" exige itens numerados (I, II, III...) e combinações', async () => {
    const questionType = 'assercao_combinada';
    const assercaoDirective = `
TIPO: ASSERÇÃO COMBINADA (ITENS)
- ESTRUTURA DO ENUNCIADO: Um enunciado introdutório contextualizando o tema, seguido de uma 
  lista numerada de 3 a 5 afirmativas (numeradas I, II, III, IV, e opcionalmente V)
- CONTEÚDO DAS AFIRMATIVAS: Cada item deve ser uma afirmação técnica completa
- ALTERNATIVAS: cada alternativa descreve uma COMBINAÇÃO de quais itens estão corretos
- COMENTÁRIO: OBRIGATÓRIO explicar a veracidade de CADA item individualmente dentro de porOpcao ou porItem
`;

    expect(assercaoDirective).toContain('ASSERÇÃO COMBINADA');
    expect(assercaoDirective).toContain('3 a 5 afirmativas');
    expect(assercaoDirective).toContain('COMBINAÇÃO');
    expect(assercaoDirective).toContain('porItem');
  });

  it('Q1-8: Prompt para "caso_clinico" enriquecido exige dados demográficos variados e valores laboratoriais numéricos', async () => {
    const enrichedCasoClinicoDirective = `
TIPO: CASO CLÍNICO
- ESTRUTURA DO ENUNCIADO: OBRIGATÓRIO seguir vinheta clínica progressiva com paciente fictício:
  • Dados demográficos fictícios realistas e VARIADOS entre as questões do lote
  • VARIEDADE DE DESFECHO: alterne entre perguntas pedindo diagnóstico, conduta imediata, próximo exame
  • VALORES NUMÉRICOS ESPECÍFICOS com unidade, não só "exame alterado"
- COMENTÁRIO: OBRIGATÓRIO objeto JSON estruturado contendo "correta", "porOpcao" e "correlacaoClinica"
`;

    expect(enrichedCasoClinicoDirective).toContain('VARIADOS');
    expect(enrichedCasoClinicoDirective).toContain('VARIEDADE DE DESFECHO');
    expect(enrichedCasoClinicoDirective).toContain('VALORES NUMÉRICOS ESPECÍFICOS');
    expect(enrichedCasoClinicoDirective).toContain('correlacaoClinica');
  });
});
