import fs from 'fs';
import path from 'path';

interface RawItem {
  ciclo: string;
  cat1: string;
  cat2: string;
  tema: string;
  url: string;
}

const rawItems: RawItem[] = JSON.parse(fs.readFileSync('/tmp/sanar_all_raw_topics.json', 'utf-8'));

// Mapa final: Especialidade do MedAnki -> Set de Temas únicos
const specialtyTopicsMap = new Map<string, Set<string>>();

function addTopic(specialty: string, topic: string) {
  const cleanTopic = topic.trim();
  if (!cleanTopic) return;
  if (!specialtyTopicsMap.has(specialty)) {
    specialtyTopicsMap.set(specialty, new Set<string>());
  }
  specialtyTopicsMap.get(specialty)!.add(cleanTopic);
}

// Conjunto para rastrear temas já atribuídos e evitar duplicações entre especialidades
const assignedTopicSet = new Set<string>();

function assignUnique(specialty: string, topic: string, contextNote?: string): boolean {
  const norm = topic.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (assignedTopicSet.has(norm)) {
    // Tema já atribuído a outra especialidade com maior relevância
    return false;
  }
  assignedTopicSet.add(norm);
  addTopic(specialty, topic);
  return true;
}

// 1. Processar Ciclo Clínico e Residência Médica primeiro (prioridade pedagógica das especialidades clínicas)
for (const item of rawItems) {
  if (item.ciclo !== 'Questões Ciclo Clínico e Residência Médica') continue;

  const cat1 = item.cat1;
  const cat2 = item.cat2;
  const tema = item.tema;

  if (cat1 === 'Cirurgia') {
    if (cat2 === 'Ortopedia') {
      assignUnique('Ortopedia e Traumatologia', tema, 'Cirurgia -> Ortopedia');
    } else if (cat2 === 'Oftalmologia') {
      assignUnique('Oftalmologia', tema, 'Cirurgia -> Oftalmologia');
    } else if (cat2 === 'Otorrinolaringologia') {
      assignUnique('Otorrinolaringologia', tema, 'Cirurgia -> Otorrinolaringologia');
    } else if (cat2 === 'Urologia') {
      assignUnique('Urologia', tema, 'Cirurgia -> Urologia');
    } else {
      // Cirurgia de Cabeça e Pescoço, Cirurgia do Aparelho Digestivo, Cirurgia Geral,
      // Cirurgia Infantil, Cirurgia Plástica, Cirurgia Torácica, Cirurgia Vascular, Trauma
      assignUnique('Cirurgia Geral', tema, `Cirurgia -> ${cat2}`);
    }
  } else if (cat1 === 'Clínica médica') {
    if (cat2 === 'Cardiologia') assignUnique('Cardiologia', tema);
    else if (cat2 === 'Dermatologia') assignUnique('Dermatologia', tema);
    else if (cat2 === 'Endocrinologia') assignUnique('Endocrinologia', tema);
    else if (cat2 === 'Gastroenterologia') assignUnique('Gastroenterologia', tema);
    else if (cat2 === 'Genética médica') assignUnique('Genética Médica', tema, 'Mantido no ciclo básico');
    else if (cat2 === 'Geriatria') assignUnique('Clínica Médica', tema, 'Geriatria alocada em Clínica Médica');
    else if (cat2 === 'Hematologia') assignUnique('Hematologia', tema);
    else if (cat2 === 'Imunologia') assignUnique('Imunologia', tema);
    else if (cat2 === 'Infectologia') assignUnique('Infectologia', tema);
    else if (cat2 === 'Nefrologia') assignUnique('Nefrologia', tema);
    else if (cat2 === 'Neurologia') assignUnique('Neurologia', tema);
    else if (cat2 === 'Oncologia') assignUnique('Oncologia', tema);
    else if (cat2 === 'Pneumologia') assignUnique('Pneumologia', tema);
    else if (cat2 === 'Psiquiatria') assignUnique('Psiquiatria', tema);
    else if (cat2 === 'Reumatologia') assignUnique('Reumatologia', tema);
    else if (cat2 === 'Terapia intensiva') assignUnique('Medicina Intensiva', tema);
    else assignUnique('Clínica Médica', tema);
  } else if (cat1 === 'Ginecologia e Obstetrícia') {
    assignUnique('Ginecologia e Obstetrícia', tema);
  } else if (cat1 === 'Pediatria') {
    assignUnique('Pediatria', tema);
  } else if (cat1 === 'Preventiva') {
    if (cat2 === 'Epidemiologia' || cat2 === 'Estatística') {
      assignUnique('Bioestatística & Epidemiologia', tema);
    } else if (cat2 === 'Medicina da família e comunidade') {
      assignUnique('Medicina de Família e Comunidade', tema);
    } else {
      assignUnique('Medicina Preventiva & SUS', tema);
    }
  }
}

// 2. Processar Ciclo Básico (aplicando exclusões e regras específicas)
for (const item of rawItems) {
  if (item.ciclo !== 'Questões Ciclo Básico') continue;

  const cat1 = item.cat1;
  const cat2 = item.cat2;
  const tema = item.tema;

  // EXCLUSÕES OBRIGATÓRIAS (Item 2 do prompt)
  if (cat1 === 'Biofísica' || cat2 === 'Biofísica') continue;
  if (cat1 === 'Bioestatística' || cat2 === 'Bioestatística') continue; // Já coberto por Bioestatística & Epidemiologia
  if (cat1 === 'Eletrocardiograma (ECG)' || cat2 === 'Eletrocardiograma (ECG)') continue;

  // FARMACOLOGIA: Unificar tudo em Farmacologia Básica (Item 3 do prompt)
  if (cat1 === 'Farmacologia' || cat2 === 'Farmacologia' || cat1 === 'Antibioticoterapia' || cat2 === 'Antibioticoterapia') {
    assignUnique('Farmacologia Básica', tema, 'Unificado em Farmacologia Básica');
    continue;
  }

  // GENÉTICA: Manter no Ciclo Básico em Genética Médica (Item 4 do prompt)
  if (cat1 === 'Genética' || cat2 === 'Genética') {
    assignUnique('Genética Médica', tema);
    continue;
  }

  // DISCIPLINAS TRADICIONAIS DO CICLO BÁSICO
  if (cat1 === 'Anatomia do Sistema Locomotor' || cat1 === 'Anatomia dos Órgãos e Sistemas') {
    assignUnique('Anatomia', tema);
  } else if (cat1 === 'Biologia Molecular e Celular' || cat1 === 'Bioquímica') {
    assignUnique('Bioquímica', tema);
  } else if (cat1 === 'Curso de Sutura') {
    assignUnique('Cirurgia Geral', tema, 'Técnica cirúrgica / Sutura em Cirurgia Geral');
  } else if (cat1 === 'Embriologia') {
    assignUnique('Embriologia', tema);
  } else if (cat1 === 'Exames Laboratoriais') {
    assignUnique('Patologia Clínica/Laboratorial', tema);
  } else if (cat1 === 'Fisiologia') {
    assignUnique('Fisiologia', tema);
  } else if (cat1 === 'Histologia') {
    assignUnique('Histologia', tema);
  } else if (cat1 === 'Imunologia') {
    assignUnique('Imunologia', tema);
  } else if (cat1 === 'Microbiologia') {
    assignUnique('Microbiologia', tema);
  } else if (cat1 === 'Neuroanatomia') {
    assignUnique('Neuroanatomia', tema);
  } else if (cat1 === 'Parasitologia') {
    assignUnique('Parasitologia', tema);
  } else if (cat1 === 'Patologia') {
    assignUnique('Patologia Geral', tema);
  } else if (cat1 === 'Primeiros Socorros') {
    assignUnique('Emergências Médicas', tema);
  } else if (cat1 === 'Semiologia') {
    assignUnique('Semiologia Médica', tema);
  } else if (cat1 === 'Ética Médica') {
    assignUnique('Medicina Preventiva & SUS', tema);
  }
  // MÓDULOS DE SISTEMAS INTEGRADOS (Classificação inteligente por prefixo do tema)
  else if (cat1.startsWith('Sistema')) {
    const tLower = tema.toLowerCase();

    if (tLower.startsWith('anatomia')) {
      assignUnique('Anatomia', tema);
    } else if (tLower.startsWith('histologia') || tLower.includes('estrutura anatomica e histologica')) {
      assignUnique('Histologia', tema);
    } else if (tLower.startsWith('embriologia') || tLower.startsWith('desenvolvimento embrionario') || tLower.startsWith('circulacao fetal')) {
      assignUnique('Embriologia', tema);
    } else if (tLower.startsWith('fisiologia') || tLower.startsWith('propriedades mecanicas')) {
      assignUnique('Fisiologia', tema);
    } else if (tLower.startsWith('exame fisico')) {
      assignUnique('Semiologia Médica', tema);
    } else {
      // Temas patológicos / clínicos do módulo de sistema -> atribuir à especialidade clínica correspondente
      if (cat1 === 'Sistema Cardiovascular e Linfático') assignUnique('Cardiologia', tema);
      else if (cat1 === 'Sistema Digestivo') assignUnique('Gastroenterologia', tema);
      else if (cat1 === 'Sistema Endócrino') assignUnique('Endocrinologia', tema);
      else if (cat1 === 'Sistema Esquelético e Muscular') assignUnique('Ortopedia e Traumatologia', tema);
      else if (cat1 === 'Sistema Imunológico e Sanguíneo') assignUnique('Hematologia', tema);
      else if (cat1 === 'Sistema Nervoso e Sensorial') assignUnique('Neurologia', tema);
      else if (cat1 === 'Sistema Reprodutor') assignUnique('Ginecologia e Obstetrícia', tema);
      else if (cat1 === 'Sistema Respiratório') assignUnique('Pneumologia', tema);
      else if (cat1 === 'Sistema Tegumentar') assignUnique('Dermatologia', tema);
      else if (cat1 === 'Sistema Urinário e Renal') assignUnique('Nefrologia', tema);
      else assignUnique('Clínica Médica', tema);
    }
  }
}

// Converter Map para Record<string, string[]> ordenado
const result: Record<string, string[]> = {};
const sortedSpecialties = Array.from(specialtyTopicsMap.keys()).sort();

let totalTopics = 0;
for (const spec of sortedSpecialties) {
  const topicsArray = Array.from(specialtyTopicsMap.get(spec)!).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  result[spec] = topicsArray;
  totalTopics += topicsArray.length;
}

const outputPath = path.resolve(process.cwd(), 'src/data/sanarTopicsSeed.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

console.log(`✅ Gerado ${outputPath}`);
console.log(`Total de especialidades: ${sortedSpecialties.length}`);
console.log(`Total de temas únicos consolidados: ${totalTopics}\n`);

console.log('Distribuição por Especialidade:');
for (const spec of sortedSpecialties) {
  console.log(` - ${spec}: ${result[spec].length} temas`);
}
