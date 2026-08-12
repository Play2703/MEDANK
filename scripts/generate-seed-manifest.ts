/**
 * Gera/atualiza scripts/seed-source/manifest.json automaticamente a partir dos arquivos
 * que estiverem na pasta scripts/seed-source/.
 *
 * Uso: npm run seed:manifest
 * (adicionar em package.json: "seed:manifest": "tsx scripts/generate-seed-manifest.ts")
 *
 * O que faz:
 * - Varre scripts/seed-source/ procurando arquivos suportados (pdf, docx, pptx, txt, epub).
 * - Para cada arquivo que ainda NÃO está no manifest.json, cria uma entrada nova com um
 *   título derivado do nome do arquivo e categoria/ano padrão — você só precisa ajustar
 *   discipline/specialty (e o resto, se quiser) depois.
 * - NÃO sobrescreve entradas que já existem no manifest (preserva o que você já editou).
 * - Avisa se algum "file" do manifest não existe mais na pasta (entrada órfã).
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const SEED_DIR = join(process.cwd(), "scripts", "seed-source");
const MANIFEST_PATH = join(SEED_DIR, "manifest.json");
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".epub"];

interface SeedManifestEntry {
  file: string;
  title: string;
  category: string;
  discipline: string;
  specialty: string;
  author?: string;
  board?: string;
  professor?: string;
  year?: number;
}

function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const spaced = withoutExt.replace(/[-_]+/g, " ").trim();
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function main() {
  if (!existsSync(SEED_DIR)) {
    console.error(`Pasta não encontrada: ${SEED_DIR}`);
    console.error('Crie a pasta "scripts/seed-source/" e coloque os arquivos lá antes de rodar este script.');
    process.exit(1);
  }

  const filesInFolder = readdirSync(SEED_DIR).filter((name) =>
    SUPPORTED_EXTENSIONS.includes(("." + name.split(".").pop()) as string)
  );

  let manifest: SeedManifestEntry[] = [];
  if (existsSync(MANIFEST_PATH)) {
    try {
      const raw = readFileSync(MANIFEST_PATH, "utf-8");
      manifest = JSON.parse(raw);
      if (!Array.isArray(manifest)) {
        throw new Error("manifest.json não é um array.");
      }
    } catch (err) {
      console.error("Erro ao ler manifest.json existente:", err);
      process.exit(1);
    }
  }

  const existingFiles = new Set(manifest.map((entry) => entry.file));
  const currentYear = new Date().getFullYear();

  let addedCount = 0;
  for (const filename of filesInFolder) {
    if (existingFiles.has(filename)) continue;

    manifest.push({
      file: filename,
      title: titleFromFilename(filename),
      category: "apostila",
      discipline: "",
      specialty: "",
      year: currentYear,
    });
    addedCount++;
    console.log(`+ Adicionado ao manifest: ${filename} (título gerado: "${titleFromFilename(filename)}")`);
  }

  const folderFileSet = new Set(filesInFolder);
  const orphanedEntries = manifest.filter((entry) => !folderFileSet.has(entry.file));
  if (orphanedEntries.length > 0) {
    console.warn("\n⚠️  Entradas no manifest.json sem arquivo correspondente na pasta:");
    for (const entry of orphanedEntries) {
      console.warn(`   - "${entry.file}" (referenciado no manifest, mas não encontrado em scripts/seed-source/)`);
    }
    console.warn("   Essas entradas serão IGNORADAS pelo build-seed-bundle. Corrija o nome do arquivo ou remova a entrada.\n");
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log(`\nConcluído. ${addedCount} entrada(s) nova(s) adicionada(s).`);
  console.log(`Total no manifest agora: ${manifest.length}.`);
  if (addedCount > 0) {
    console.log(
      '\nAbra scripts/seed-source/manifest.json e preencha "discipline" e "specialty" (ficaram vazios) ' +
        'para cada entrada nova antes de rodar "npm run seed:build".'
    );
  }
}

main();
