const AWS = require("aws-sdk");
const fs = require("fs-extra");
const path = require("path");
const { PDFToImageConverter } = require("../utils/pdfToImage");

const textract = new AWS.Textract({
  httpOptions: {
    timeout: 60000,
    retries: 3,
  },
});

const DOCUMENT_FEATURES = {
  cedula: ['FORMS', 'SIGNATURES'],
  diploma_bachiller: ['FORMS', 'TABLES'],
  diploma_tecnico: ['FORMS', 'TABLES'],
  diploma_tecnologo: ['FORMS', 'TABLES'],
  titulo_profesional: ['FORMS', 'TABLES'],
  prueba_tt: ['FORMS', 'TABLES', 'LAYOUT'],
  icfes: ['FORMS', 'TABLES', 'LAYOUT'],
  recibo_pago: ['FORMS', 'TABLES'],
  encuesta_m0: ['FORMS'],
  acta_homologacion: ['FORMS', 'TABLES'],
  soporte_prueba_saberProtyt: ['FORMS', 'TABLES', 'LAYOUT']
};

const SIZE_LIMITS = {
  SYNC_BYTES: 5 * 1024 * 1024,
  ASYNC_BYTES: 500 * 1024 * 1024
};

// Configuración simplificada para conversión PDF
const PDF_CONVERSION_CONFIG = {
  // Tipos de documento que se benefician de conversión a imagen
  CONVERT_TO_IMAGE_TYPES: [
    'soporte_prueba_saberProtyt',
    'diploma_bachiller',
    'diploma_tecnico', 
    'diploma_tecnologo',
    'titulo_profesional'
  ],
  
  // Solo intentar conversión si el PDF parece ser de baja calidad
  MIN_SIZE_FOR_CONVERSION: 50 * 1024, // 50KB
  MAX_SIZE_FOR_CONVERSION: 20 * 1024 * 1024, // 20MB
  
  // Umbral de calidad para decidir conversión
  QUALITY_THRESHOLD: 15 // Score menor = más probable conversión
};

class SimplifiedTextractService {
  constructor() {
    this.pdfConverter = new PDFToImageConverter();
    this.generatedImages = [];
  }

  /**
   * Extrae texto de un documento con conversión inteligente de PDF
   */
  async extractTextFromDocument(filePath, documentType = null) {
    try {
      console.log(`[SIMPLIFIED-TEXTRACT] Iniciando extracción para: ${path.basename(filePath)}`);
      
      const documentBuffer = await fs.readFile(filePath);
      await this.validateDocument(documentBuffer, filePath);

      let finalFilePath = filePath;
      let conversionAttempted = false;
      let conversionSucceeded = false;

      // Solo intentar conversión si es beneficioso
      const shouldTryConversion = await this.shouldAttemptConversion(filePath, documentType, documentBuffer);
      
      if (shouldTryConversion) {
        try {
          console.log(`[SIMPLIFIED-TEXTRACT] Intentando conversión PDF mejorada...`);
          const convertedPath = await this.attemptPDFConversion(filePath, documentType);
          
          if (convertedPath && convertedPath !== filePath) {
            finalFilePath = convertedPath;
            conversionSucceeded = true;
            console.log(`[SIMPLIFIED-TEXTRACT] ✓ Conversión exitosa`);
          }
          conversionAttempted = true;
        } catch (conversionError) {
          console.warn(`[SIMPLIFIED-TEXTRACT] Conversión falló, continuando con PDF original: ${conversionError.message}`);
          conversionAttempted = true;
          conversionSucceeded = false;
        }
      }

      // Extraer texto del archivo final
      const extractedText = await this.performTextExtraction(finalFilePath, documentType);
      
      // Log del resultado
      this.logExtractionResult(extractedText, conversionAttempted, conversionSucceeded);
      
      return extractedText;
      
    } catch (error) {
      console.error(`[SIMPLIFIED-TEXTRACT] Error en extracción:`, error.message);
      throw error;
    }
  }

  /**
   * Determina si vale la pena intentar conversión
   */
  async shouldAttemptConversion(filePath, documentType, documentBuffer) {
    try {
      // Solo PDFs
      const isPDF = await this.pdfConverter.isPDF(filePath);
      if (!isPDF) {
        return false;
      }

      // Solo ciertos tipos de documento
      if (!documentType || !PDF_CONVERSION_CONFIG.CONVERT_TO_IMAGE_TYPES.includes(documentType)) {
        console.log(`[SIMPLIFIED-TEXTRACT] Tipo ${documentType} no requiere conversión`);
        return false;
      }

      // Verificar tamaño
      const fileSize = documentBuffer.length;
      if (fileSize < PDF_CONVERSION_CONFIG.MIN_SIZE_FOR_CONVERSION) {
        console.log(`[SIMPLIFIED-TEXTRACT] Archivo muy pequeño: ${this.formatBytes(fileSize)}`);
        return false;
      }

      if (fileSize > PDF_CONVERSION_CONFIG.MAX_SIZE_FOR_CONVERSION) {
        console.log(`[SIMPLIFIED-TEXTRACT] Archivo muy grande: ${this.formatBytes(fileSize)}`);
        return false;
      }

      // Evaluar calidad del PDF
      const quality = await this.pdfConverter.assessPDFQuality(documentBuffer);
      console.log(`[SIMPLIFIED-TEXTRACT] Calidad PDF: ${quality.score} (${quality.assessment})`);
      
      // Solo convertir si la calidad es baja (probablemente escaneado)
      if (quality.score < PDF_CONVERSION_CONFIG.QUALITY_THRESHOLD) {
        console.log(`[SIMPLIFIED-TEXTRACT] PDF de baja calidad, conversión recomendada`);
        return true;
      }

      console.log(`[SIMPLIFIED-TEXTRACT] PDF de buena calidad, conversión no necesaria`);
      return false;

    } catch (error) {
      console.warn(`[SIMPLIFIED-TEXTRACT] Error evaluando conversión: ${error.message}`);
      return false;
    }
  }

  /**
   * Intenta conversión PDF con manejo de errores robusto
   */
  async attemptPDFConversion(pdfPath, documentType) {
    try {
      const tempDir = path.dirname(pdfPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const imageDir = path.join(tempDir, `${baseName}_converted`);
      
      await fs.ensureDir(imageDir);

      // Configuración de conversión
      const conversionOptions = {
        format: 'png',
        density: documentType === 'soporte_prueba_saberProtyt' ? 300 : 200,
        quality: 90
      };

      // Intentar conversión
      const imagePaths = await this.pdfConverter.convertPDFToImages(pdfPath, imageDir, conversionOptions);
      
      if (!imagePaths || imagePaths.length === 0) {
        throw new Error('No se generaron imágenes');
      }

      // Registrar para limpieza
      this.generatedImages.push(...imagePaths.filter(p => p !== pdfPath));

      // Seleccionar la mejor imagen
      let targetImage = imagePaths[0];
      if (imagePaths.length > 1 && !imagePaths[0].endsWith('.pdf')) {
        targetImage = await this.selectBestImage(imagePaths);
      }

      // Si el resultado es el PDF original, no considerarlo conversión
      if (targetImage === pdfPath) {
        return pdfPath;
      }

      // Intentar optimización si es posible
      try {
        const optimizedPath = await this.pdfConverter.optimizeImageForTextract(targetImage);
        if (optimizedPath !== targetImage) {
          this.generatedImages.push(optimizedPath);
        }
        return optimizedPath;
      } catch (optimError) {
        console.warn(`[SIMPLIFIED-TEXTRACT] Optimización falló: ${optimError.message}`);
        return targetImage;
      }

    } catch (error) {
      console.warn(`[SIMPLIFIED-TEXTRACT] Conversión completa falló: ${error.message}`);
      throw error;
    }
  }

  /**
   * Selecciona la mejor imagen de múltiples opciones
   */
  async selectBestImage(imagePaths) {
    // Filtrar PDFs
    const actualImages = imagePaths.filter(p => !p.endsWith('.pdf'));
    
    if (actualImages.length === 0) {
      return imagePaths[0]; // Devolver PDF original
    }

    if (actualImages.length === 1) {
      return actualImages[0];
    }

    // Seleccionar por tamaño (heurística simple)
    let bestImage = actualImages[0];
    let maxSize = 0;

    for (const imagePath of actualImages) {
      try {
        const stats = await fs.stat(imagePath);
        if (stats.size > maxSize) {
          maxSize = stats.size;
          bestImage = imagePath;
        }
      } catch (error) {
        console.warn(`[SIMPLIFIED-TEXTRACT] Error verificando ${imagePath}: ${error.message}`);
      }
    }

    console.log(`[SIMPLIFIED-TEXTRACT] Imagen seleccionada: ${path.basename(bestImage)}`);
    return bestImage;
  }

  /**
   * Realiza la extracción de texto
   */
  async performTextExtraction(filePath, documentType) {
    try {
      const documentBuffer = await fs.readFile(filePath);
      const useAnalyze = this.shouldUseAnalyzeDocument(documentBuffer.length, documentType);
      
      let result;
      if (useAnalyze) {
        result = await this.extractWithAnalyzeDocument(documentBuffer, documentType);
      } else {
        result = await this.extractWithDetectDocument(documentBuffer);
      }
      
      return result;
      
    } catch (error) {
      console.error(`[SIMPLIFIED-TEXTRACT] Error en extracción:`, error.message);
      throw error;
    }
  }

  /**
   * Log del resultado de extracción
   */
  logExtractionResult(extractedText, conversionAttempted, conversionSucceeded) {
    const textLength = extractedText ? extractedText.length : 0;
    const status = textLength > 100 ? 'EXITOSA' : 'LIMITADA';
    
    console.log(`[SIMPLIFIED-TEXTRACT] ✓ Extracción ${status}: ${textLength} caracteres`);
    
    if (conversionAttempted) {
      if (conversionSucceeded) {
        console.log(`[SIMPLIFIED-TEXTRACT] ✓ Conversión PDF aplicada exitosamente`);
      } else {
        console.log(`[SIMPLIFIED-TEXTRACT] ⚠️ Conversión PDF intentada pero falló`);
      }
    } else {
      console.log(`[SIMPLIFIED-TEXTRACT] ℹ️ Extracción directa (sin conversión)`);
    }
  }

  // Métodos de extracción de Textract (sin cambios significativos)
  async validateDocument(documentBuffer, filePath) {
    const headerCheck = documentBuffer.slice(0, 20).toString();
    if (headerCheck.startsWith("<!DOCTYPE") || 
        headerCheck.startsWith("<html") || 
        headerCheck.startsWith("<!do")) {
      throw new Error("HTML_FILE_DETECTED");
    }

    if (documentBuffer.length < 100) {
      throw new Error("DOCUMENT_TOO_SMALL");
    }
    
    if (documentBuffer.length > SIZE_LIMITS.ASYNC_BYTES) {
      throw new Error("DOCUMENT_TOO_LARGE");
    }

    const fileType = this.detectFileType(documentBuffer);
    if (!['PDF', 'PNG', 'JPEG', 'TIFF'].includes(fileType)) {
      throw new Error(`UNSUPPORTED_FILE_TYPE: ${fileType}`);
    }
    
    console.log(`[SIMPLIFIED-TEXTRACT] Documento validado - Tipo: ${fileType}, Tamaño: ${this.formatBytes(documentBuffer.length)}`);
  }

  detectFileType(buffer) {
    const header = buffer.slice(0, 8);
    
    if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
      return 'PDF';
    }
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
      return 'PNG';
    }
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
      return 'JPEG';
    }
    if ((header[0] === 0x49 && header[1] === 0x49) || (header[0] === 0x4D && header[1] === 0x4D)) {
      return 'TIFF';
    }
    
    return 'UNKNOWN';
  }

  shouldUseAnalyzeDocument(fileSize, documentType) {
    const structuredDocuments = ['soporte_prueba_saberProtyt'];

    if (documentType && structuredDocuments.includes(documentType)) {
      return true;
    }

    if (fileSize < 1024 * 1024) { // 1MB
      return false;
    }
    
    return true;
  }

  async extractWithAnalyzeDocument(documentBuffer, documentType) {
    try {
      console.log(`[SIMPLIFIED-TEXTRACT] Usando analyzeDocument para: ${documentType}`);
      
      const features = this.getFeatureTypesForDocument(documentType);
      
      const params = {
        Document: {
          Bytes: documentBuffer,
        },
        FeatureTypes: features
      };

      let result;
      if (documentBuffer.length <= SIZE_LIMITS.SYNC_BYTES) {
        result = await textract.analyzeDocument(params).promise();
      } else {
        result = await this.analyzeDocumentAsync(documentBuffer, features);
      }

      return this.processAnalyzeResult(result, documentType);
      
    } catch (error) {
      console.warn(`[SIMPLIFIED-TEXTRACT] Error en analyzeDocument, fallback a detectDocument:`, error.message);
      return await this.extractWithDetectDocument(documentBuffer);
    }
  }

  getFeatureTypesForDocument(documentType) {
    if (!documentType || !DOCUMENT_FEATURES[documentType]) {
      return ['FORMS']; // Default
    }
    return DOCUMENT_FEATURES[documentType];
  }

  async extractWithDetectDocument(documentBuffer) {
    console.log(`[SIMPLIFIED-TEXTRACT] Usando detectDocumentText`);
    
    const params = {
      Document: {
        Bytes: documentBuffer,
      },
    };
    
    const result = await textract.detectDocumentText(params).promise();
    
    let extractedText = "";
    let confidenceSum = 0;
    let confidenceCount = 0;
    
    if (result.Blocks && result.Blocks.length > 0) {
      result.Blocks.forEach((block) => {
        if (block.BlockType === "LINE") {
          extractedText += block.Text + " ";
          if (block.Confidence) {
            confidenceSum += block.Confidence;
            confidenceCount++;
          }
        }
      });
    }
    
    const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
    console.log(`[SIMPLIFIED-TEXTRACT] Confianza promedio: ${avgConfidence.toFixed(2)}%`);
    
    const trimmedText = extractedText.trim();
    if (trimmedText.length === 0) {
      throw new Error("NO_TEXT_EXTRACTED");
    }
    
    return trimmedText;
  }

  processAnalyzeResult(result, documentType) {
    if (!result.Blocks || result.Blocks.length === 0) {
      throw new Error("NO_TEXT_EXTRACTED");
    }
    
    let extractedText = '';
    let confidenceSum = 0;
    let confidenceCount = 0;
    
    result.Blocks.forEach(block => {
      if (block.BlockType === 'LINE') {
        extractedText += block.Text + ' ';
        if (block.Confidence) {
          confidenceSum += block.Confidence;
          confidenceCount++;
        }
      }
    });

    const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
    extractedText = extractedText.trim();
    
    if (extractedText.length === 0) {
      throw new Error("NO_TEXT_EXTRACTED");
    }
    
    console.log(`[SIMPLIFIED-TEXTRACT] Extracción completada - Confianza: ${avgConfidence.toFixed(2)}%`);
    return extractedText;
  }

  async analyzeDocumentAsync(documentBuffer, features) {
    const params = {
      Document: {
        Bytes: documentBuffer,
      },
      FeatureTypes: features
    };

    const extendedTextract = new AWS.Textract({
      httpOptions: {
        timeout: 120000, // 2 minutos
        retries: 5,
      },
    });
    
    return await extendedTextract.analyzeDocument(params).promise();
  }

  /**
   * Limpia archivos generados
   */
  async cleanup() {
    if (this.generatedImages.length > 0) {
      console.log(`[SIMPLIFIED-TEXTRACT] Limpiando ${this.generatedImages.length} archivo(s) generado(s)...`);
      await this.pdfConverter.cleanupGeneratedImages(this.generatedImages);
      this.generatedImages = [];
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

// Funciones de compatibilidad con la API existente
async function extractTextFromDocument(filePath, documentType = null) {
  const service = new SimplifiedTextractService();
  try {
    return await service.extractTextFromDocument(filePath, documentType);
  } finally {
    await service.cleanup();
  }
}

async function extractTextWithDocumentType(filePath, documentType) {
  return await extractTextFromDocument(filePath, documentType);
}

module.exports = {
  extractTextFromDocument,
  extractTextWithDocumentType,
  SimplifiedTextractService
};