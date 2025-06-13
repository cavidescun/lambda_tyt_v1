const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const tempDirectories = [];

async function createTempDirectory() {
  const timestamp = Date.now();
  const nanoTime = process.hrtime.bigint().toString();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const processId = process.pid || Math.floor(Math.random() * 100000);
  const randomSuffix = Math.random().toString(36).substring(2, 15);

  const uniqueId = `${timestamp}-${processId}-${randomBytes}-${randomSuffix}-${nanoTime.slice(-8)}`;
  const tempDirName = `pdf-processor-${uniqueId}`;
  
  console.log(`[TEMP] Generando directorio temporal único: ${tempDirName}`);

  const possiblePaths = [
    path.join(os.tmpdir(), tempDirName),
    path.join('/tmp', tempDirName),
    path.join(process.cwd(), 'temp', tempDirName)
  ];
  
  for (let i = 0; i < possiblePaths.length; i++) {
    const tempDir = possiblePaths[i];
    
    try {
      console.log(`[TEMP] Intentando crear directorio en: ${tempDir}`);

      const exists = await fs.pathExists(tempDir);
      if (exists) {
        console.warn(`[TEMP] Directorio ya existe, generando nuevo ID...`);
        const newRandomBytes = crypto.randomBytes(8).toString('hex');
        const newPath = `${tempDir}-${newRandomBytes}`;
        await createDirectoryRobust(newPath);
        tempDirectories.push(newPath);
        return newPath;
      }

      await createDirectoryRobust(tempDir);

      tempDirectories.push(tempDir);
      
      console.log(`[TEMP] ✓ Directorio creado exitosamente: ${path.basename(tempDir)}`);
      return tempDir;
      
    } catch (error) {
      console.warn(`[TEMP] ⚠️ Falló creación en ${tempDir}: ${error.message}`);

      if (i === possiblePaths.length - 1) {
        throw new Error(`No se pudo crear directorio temporal después de ${possiblePaths.length} intentos: ${error.message}`);
      }
    }
  }
}

async function createDirectoryRobust(dirPath) {
  try {
    const parentDir = path.dirname(dirPath);
    await fs.ensureDir(parentDir);

    await fs.ensureDir(dirPath);

    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error('El path creado no es un directorio válido');
    }

    try {
      await fs.chmod(dirPath, 0o755);
    } catch (chmodError) {
      console.warn(`[TEMP] No se pudieron configurar permisos para ${dirPath}: ${chmodError.message}`);
    }
    const testFile = path.join(dirPath, '.test');
    await fs.writeFile(testFile, 'test');
    await fs.remove(testFile);
    
    console.log(`[TEMP] Directorio verificado y funcional: ${path.basename(dirPath)}`);
    
  } catch (error) {
    throw new Error(`Error creando directorio ${dirPath}: ${error.message}`);
  }
}

async function cleanupTempFiles() {
  if (tempDirectories.length === 0) {
    console.log(`[TEMP] No hay directorios temporales para limpiar`);
    return;
  }
  
  console.log(`[TEMP] Iniciando limpieza de ${tempDirectories.length} directorio(s) temporal(es)...`);
  
  const cleanupPromises = tempDirectories.map(async (dir, index) => {
    try {
      const dirName = path.basename(dir);
      console.log(`[TEMP] Limpiando ${index + 1}/${tempDirectories.length}: ${dirName}`);

      const exists = await fs.pathExists(dir);
      if (!exists) {
        console.log(`[TEMP] ✓ Directorio ${dirName} ya no existe`);
        return;
      }
      let fileCount = 0;
      let totalSize = 0;
      try {
        const files = await fs.readdir(dir);
        fileCount = files.length;
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      } catch (dirError) {
        console.warn(`[TEMP] No se pudo analizar contenido de ${dirName}: ${dirError.message}`);
      }

      await fs.remove(dir);

      const stillExists = await fs.pathExists(dir);
      if (stillExists) {
        throw new Error(`El directorio ${dirName} aún existe después de la eliminación`);
      }
      console.log(`[TEMP] ✓ ${dirName} eliminado (${fileCount} archivos, ${formatBytes(totalSize)})`);
    } catch (error) {
      console.error(`[TEMP] ✗ Error limpiando ${path.basename(dir)}: ${error.message}`);
    }
  });
  await Promise.allSettled(cleanupPromises);

  tempDirectories.length = 0;
  console.log(`[TEMP] ✓ Limpieza completada`);
}

function getTempDirectoryStatus() {
  return {
    count: tempDirectories.length,
    directories: tempDirectories.map(dir => ({
      path: dir,
      name: path.basename(dir),
      created: new Date().toISOString()
    }))
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

process.on('beforeExit', async () => {
  console.log(`[TEMP] Proceso finalizando, ejecutando cleanup automático...`);
  try {
    await cleanupTempFiles();
  } catch (error) {
    console.error(`[TEMP] Error en cleanup automático:`, error.message);
  }
});

process.on('SIGTERM', async () => {
  console.log(`[TEMP] SIGTERM recibido, limpiando archivos temporales...`);
  try {
    await cleanupTempFiles();
  } catch (error) {
    console.error(`[TEMP] Error en cleanup por SIGTERM:`, error.message);
  }
});

module.exports = {
  createTempDirectory,
  cleanupTempFiles,
  getTempDirectoryStatus
};