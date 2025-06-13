const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const archiver = require("archiver");

const CONFIG = {
  sourceDir: path.join(__dirname),
  buildDir: path.join(__dirname, "build"),
  zipFile: path.join(__dirname, "lambda-tyt-prod.zip"),
};

async function cleanPrevious() {
  console.log("🗑️  Limpiando archivos anteriores...");

  try {
    await fs.remove(CONFIG.buildDir);
    await fs.remove(CONFIG.zipFile);
    console.log("✅ Limpieza completada");
  } catch (error) {
    console.log("⚠️  Algunos archivos no existían para limpiar");
  }
}

async function createBuild() {
  console.log("📁 Creando directorio de build...");

  await fs.ensureDir(CONFIG.buildDir);
  console.log("✅ Directorio de build creado");
}

async function copyFiles() {
  console.log("📋 Copiando archivos...");

  // Copiar src/
  const srcPath = path.join(CONFIG.sourceDir, "src");
  if (await fs.pathExists(srcPath)) {
    await fs.copy(srcPath, path.join(CONFIG.buildDir, "src"));
    console.log("✅ Archivos src/ copiados");
  } else {
    throw new Error("Directorio src/ no encontrado");
  }

  // Copiar diccionarios si existen
  const dictPath = path.join(CONFIG.sourceDir, "dictionaries");
  if (await fs.pathExists(dictPath)) {
    await fs.copy(dictPath, path.join(CONFIG.buildDir, "dictionaries"));
    console.log("✅ Diccionarios copiados");
  }
}

async function createPackage() {
  console.log("📦 Creando package.json...");

  const packageJson = {
    name: "lambda-document-processor",
    version: "1.0.0",
    main: "src/index.js",
    dependencies: {
      archiver: "^6.0.1",
      "aws-sdk": "^2.1514.0",
      "axios": "^1.6.0",
      "dotenv": "^16.3.0",
      "fs-extra": "^11.2.0",
      "glob": "^10.3.0",
      "googleapis": "^128.0.0",
      "readline": "^1.3.0",
    },
  };

  await fs.writeFile(
    path.join(CONFIG.buildDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  console.log("✅ package.json creado");
}

async function installDeps() {
  console.log("⬇️  Instalando dependencias...");

  execSync("npm install --production", {
    cwd: CONFIG.buildDir,
    stdio: "inherit",
  });

  console.log("✅ Dependencias instaladas");
}

async function createZip() {
  console.log("📦 Creando ZIP...");

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(CONFIG.zipFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ ZIP creado: ${sizeInMB} MB`);
      resolve();
    });

    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(CONFIG.buildDir, false);
    archive.finalize();
  });
}

async function showResult() {
  console.log("\n🎉 ¡Build completado!");
  console.log(`📦 Archivo: ${CONFIG.zipFile}`);
  console.log("\n📋 Para desplegar:");
  console.log("1. Subir lambda-deployment.zip a AWS Lambda");
  console.log("2. Handler: src/index.handler");
  console.log("3. Runtime: nodejs18.x");
  console.log("4. Configurar variables de entorno");
}

// Función principal
async function main() {
  try {
    console.log("🚀 Iniciando build para AWS Lambda...\n");

    await cleanPrevious();
    await createBuild();
    await copyFiles();
    await createPackage();
    await installDeps();
    await createZip();
    await showResult();
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    process.exit(1);
  }
}

// Solo ejecutar si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { main };
