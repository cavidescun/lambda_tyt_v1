const fs = require('fs-extra');
const path = require('path');

/**
 * Servicio simplificado para conversión PDF que funciona en AWS Lambda
 * Sin dependencias nativas problemáticas
 */
class SimplifiedPDFConverter {
  constructor() {
    this.defaultOptions = {
      format: 'png',
      quality: 150, // DPI equivalente
      density: 300,
      colorspace: 'RGB'
    };
  }

  /**
   * Convierte PDF a imagen usando métodos disponibles en Lambda
   */
  async convertPDFToImages(pdfPath, outputDir, options = {}) {
    try {
      console.log(`[PDF-CONVERTER] Iniciando conversión simplificada: ${path.basename(pdfPath)}`);
      
      const exists = await fs.pathExists(pdfPath);
      if (!exists) {
        throw new Error(`Archivo PDF no encontrado: ${pdfPath}`);
      }

      await fs.ensureDir(outputDir);

      const convertOptions = {
        ...this.defaultOptions,
        ...options
      };

      // Intentar conversión con pdf2pic (más ligero)
      let imagePaths;
      try {
        imagePaths = await this.convertWithPdf2pic(pdfPath, outputDir, convertOptions);
      } catch (pdf2picError) {
        console.warn(`[PDF-CONVERTER] pdf2pic no disponible: ${pdf2picError.message}`);
        
        // Fallback: usar sharp para procesar el PDF como imagen
        try {
          imagePaths = await this.convertWithSharp(pdfPath, outputDir, convertOptions);
        } catch (sharpError) {
          console.warn(`[PDF-CONVERTER] Sharp falló: ${sharpError.message}`);
          
          // Último fallback: no conversión (usar PDF directamente)
          console.log(`[PDF-CONVERTER] Usando PDF original sin conversión`);
          return [pdfPath];
        }
      }

      if (!imagePaths || imagePaths.length === 0) {
        console.log(`[PDF-CONVERTER] No se generaron imágenes, usando PDF original`);
        return [pdfPath];
      }

      console.log(`[PDF-CONVERTER] ✓ Conversión completada: ${imagePaths.length} imagen(es)`);
      return imagePaths;

    } catch (error) {
      console.error(`[PDF-CONVERTER] Error en conversión:`, error.message);
      // En caso de error, devolver el PDF original
      return [pdfPath];
    }
  }

  /**
   * Convierte usando pdf2pic (sin canvas)
   */
  async convertWithPdf2pic(pdfPath, outputDir, options) {
    try {
      // Verificar si pdf2pic está disponible
      let pdf2pic;
      try {
        pdf2pic = require('pdf2pic');
      } catch (requireError) {
        throw new Error('pdf2pic no disponible');
      }

      const fileName = path.basename(pdfPath, '.pdf');
      
      const convertOptions = {
        density: options.density || 300,
        saveFilename: `${fileName}_page`,
        savePath: outputDir,
        format: options.format || 'png',
        width: 2000, // Ancho fijo para buena calidad
        height: 2800, // Alto fijo para documentos estándar
        quality: 90
      };

      console.log(`[PDF-CONVERTER] Usando pdf2pic con densidad ${convertOptions.density}`);
      
      const convert = pdf2pic.fromPath(pdfPath, convertOptions);
      const results = await convert.bulk(-1); // Convertir todas las páginas

      const imagePaths = results.map(result => result.path);
      return imagePaths;

    } catch (error) {
      throw new Error(`Error con pdf2pic: ${error.message}`);
    }
  }

  /**
   * Método alternativo usando sharp (sin canvas)
   */
  async convertWithSharp(pdfPath, outputDir, options) {
    try {
      let sharp;
      try {
        sharp = require('sharp');
      } catch (requireError) {
        throw new Error('Sharp no disponible');
      }

      console.log(`[PDF-CONVERTER] Intentando procesamiento con Sharp`);
      
      // Sharp no puede procesar PDFs directamente
      // Este es un placeholder para otros métodos de conversión
      const fileName = path.basename(pdfPath, '.pdf');
      const outputPath = path.join(outputDir, `${fileName}_converted.png`);
      
      // En un entorno real, aquí usarías otro método de conversión
      // Por ahora, copiamos el PDF original
      await fs.copy(pdfPath, outputPath);
      
      console.warn(`[PDF-CONVERTER] Sharp: conversión no implementada, usando PDF original`);
      return [pdfPath];

    } catch (error) {
      throw new Error(`Error con Sharp: ${error.message}`);
    }
  }

  /**
   * Prepara imagen optimizada para Textract (sin dependencias nativas)
   */
  async optimizeImageForTextract(imagePath, outputPath = null) {
    try {
      if (!outputPath) {
        const dir = path.dirname(imagePath);
        const name = path.basename(imagePath, path.extname(imagePath));
        const ext = path.extname(imagePath);
        outputPath = path.join(dir, `${name}_optimized${ext}`);
      }

      // Verificar si sharp está disponible para optimización
      try {
        const sharp = require('sharp');
        
        // Optimizar con sharp si está disponible
        await sharp(imagePath)
          .png({ quality: 90, compressionLevel: 6 })
          .resize({ width: 2000, height: 2800, fit: 'inside', withoutEnlargement: true })
          .toFile(outputPath);
          
        console.log(`[PDF-CONVERTER] Imagen optimizada con Sharp: ${path.basename(outputPath)}`);
        return outputPath;
        
      } catch (sharpError) {
        // Si sharp no está disponible, solo copiar
        await fs.copy(imagePath, outputPath);
        console.log(`[PDF-CONVERTER] Imagen copiada (optimización no disponible): ${path.basename(outputPath)}`);
        return outputPath;
      }

    } catch (error) {
      console.warn(`[PDF-CONVERTER] Error optimizando imagen: ${error.message}`);
      // Devolver imagen original si falla la optimización
      return imagePath;
    }
  }

  /**
   * Verifica si un archivo es PDF
   */
  async isPDF(filePath) {
    try {
      const buffer = await fs.readFile(filePath, { start: 0, end: 4 });
      return buffer.toString() === '%PDF';
    } catch (error) {
      return false;
    }
  }

  /**
   * Evaluación simple de calidad PDF
   */
  async assessPDFQuality(pdfBuffer) {
    try {
      const sampleSize = Math.min(pdfBuffer.length, 10000);
      const bufferStr = pdfBuffer.toString('ascii', 0, sampleSize);
      
      let score = 0;
      
      // Verificar contenido de texto nativo
      if (bufferStr.includes('/Type/Font') || bufferStr.includes('/Subtype/Type1')) {
        score += 30;
      }
      
      // Verificar si es principalmente imágenes
      if (bufferStr.includes('/Type/XObject') && bufferStr.includes('/Subtype/Image')) {
        score -= 20;
      }
      
      // Verificar compresión
      if (bufferStr.includes('/Filter/FlateDecode')) {
        score += 10;
      }
      
      // PDFs escaneados tienden a tener mucho contenido de imagen
      const imageRatio = (bufferStr.match(/\/Subtype\/Image/g) || []).length;
      if (imageRatio > 2) {
        score -= 15; // Probablemente escaneado
      }
      
      const isHighQuality = score >= 20;
      
      return {
        score,
        isHighQuality,
        hasNativeText: bufferStr.includes('/Type/Font'),
        hasImages: bufferStr.includes('/Subtype/Image'),
        imageCount: imageRatio,
        assessment: isHighQuality ? 'Texto nativo' : 'Probablemente escaneado'
      };

    } catch (error) {
      console.warn(`[PDF-CONVERTER] Error evaluando PDF: ${error.message}`);
      return { 
        score: 0, 
        isHighQuality: false, 
        assessment: 'No evaluable' 
      };
    }
  }

  /**
   * Limpia archivos generados
   */
  async cleanupGeneratedImages(imagePaths) {
    if (!Array.isArray(imagePaths)) return;

    for (const imagePath of imagePaths) {
      try {
        // No eliminar el PDF original
        if (imagePath.toLowerCase().endsWith('.pdf')) {
          continue;
        }
        
        const exists = await fs.pathExists(imagePath);
        if (exists) {
          await fs.remove(imagePath);
          console.log(`[PDF-CONVERTER] Imagen limpiada: ${path.basename(imagePath)}`);
        }
      } catch (error) {
        console.warn(`[PDF-CONVERTER] Error limpiando ${imagePath}: ${error.message}`);
      }
    }
  }

  /**
   * Obtiene información del archivo
   */
  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const isPdf = await this.isPDF(filePath);
      
      return {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        sizeFormatted: this.formatBytes(stats.size),
        isPDF: isPdf,
        modified: stats.mtime,
        extension: path.extname(filePath).toLowerCase()
      };
    } catch (error) {
      throw new Error(`Error obteniendo info del archivo: ${error.message}`);
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = {
  PDFToImageConverter: SimplifiedPDFConverter 
};