const AWS = require("aws-sdk");
const fs = require("fs-extra");

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
  acta_homologacion: ['FORMS', 'TABLES']
};

const SIZE_LIMITS = {
  SYNC_BYTES: 5 * 1024 * 1024,
  ASYNC_BYTES: 500 * 1024 * 1024
};


async function extractTextFromDocument(filePath, documentType = null) {
  try {
    console.log(`[TEXTRACT] Iniciando extracción para: ${filePath}`);
    
    const documentBuffer = await fs.readFile(filePath);

    await validateDocument(documentBuffer, filePath);

    const useAnalyze = shouldUseAnalyzeDocument(documentBuffer.length, documentType);
    
    let result;
    if (useAnalyze) {
      result = await extractWithAnalyzeDocument(documentBuffer, documentType);
    } else {
      result = await extractWithDetectDocument(documentBuffer);
    }
    
    return result;
    
  } catch (error) {
    console.error(`[TEXTRACT] Error en extracción:`, error.message);
    throw error;
  }
}


async function validateDocument(documentBuffer, filePath) {
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

  const fileType = detectFileType(documentBuffer);
  if (!['PDF', 'PNG', 'JPEG', 'TIFF'].includes(fileType)) {
    throw new Error(`UNSUPPORTED_FILE_TYPE: ${fileType}`);
  }
  
  console.log(`[TEXTRACT] Documento validado - Tipo: ${fileType}, Tamaño: ${formatBytes(documentBuffer.length)}`);
}

function detectFileType(buffer) {
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

function shouldUseAnalyzeDocument(fileSize, documentType) {

  const structuredDocuments = ['soporte_prueba_saberProtyt'];

  if (documentType && structuredDocuments.includes(documentType)) {
    return true;
  }

  if (fileSize < 1024 * 1024) { // 1MB
    return false;
  }
  
  return true;
}

async function extractWithAnalyzeDocument(documentBuffer, documentType) {
  try {
    console.log(`[TEXTRACT] Usando analyzeDocument para tipo: ${documentType}`);
    
    const features = getFeatureTypesForDocument(documentType);
    
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
      result = await analyzeDocumentAsync(documentBuffer, features);
    }

    return processAnalyzeResult(result, documentType);
    
  } catch (error) {
    console.warn(`[TEXTRACT] Error en analyzeDocument, fallback a detectDocument:`, error.message);
    return await extractWithDetectDocument(documentBuffer);
  }
}

function getFeatureTypesForDocument(documentType) {
  if (!documentType || !DOCUMENT_FEATURES[documentType]) {
    return ['FORMS']; // Default
  }
  return DOCUMENT_FEATURES[documentType];
}

function processAnalyzeResult(result, documentType) {
  const extractedData = {
    text: '',
    confidence: 0,
    forms: [],
    tables: [],
    layout: [],
    metadata: {
      totalBlocks: result.Blocks ? result.Blocks.length : 0,
      documentType: documentType,
      extractionMethod: 'analyzeDocument'
    }
  };
  
  if (!result.Blocks || result.Blocks.length === 0) {
    throw new Error("NO_TEXT_EXTRACTED");
  }
  
  let confidenceSum = 0;
  let confidenceCount = 0;
  
  // Procesar diferentes tipos de bloques
  result.Blocks.forEach(block => {
    switch (block.BlockType) {
      case 'LINE':
        extractedData.text += block.Text + ' ';
        if (block.Confidence) {
          confidenceSum += block.Confidence;
          confidenceCount++;
        }
        break;
        
      case 'KEY_VALUE_SET':
        if (block.EntityTypes && block.EntityTypes.includes('KEY')) {
          extractedData.forms.push(processKeyValuePair(block, result.Blocks));
        }
        break;
        
      case 'TABLE':
        extractedData.tables.push(processTable(block, result.Blocks));
        break;
        
      case 'LAYOUT':
        extractedData.layout.push({
          type: block.LayoutType,
          text: block.Text,
          confidence: block.Confidence,
          geometry: block.Geometry
        });
        break;
    }
  });

  extractedData.confidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
  extractedData.text = extractedData.text.trim();
  
  if (extractedData.text.length === 0) {
    throw new Error("NO_TEXT_EXTRACTED");
  }
  
  console.log(`[TEXTRACT] Extracción completada - Confianza: ${extractedData.confidence.toFixed(2)}%`);

  return extractedData.text;
}

function processKeyValuePair(keyBlock, allBlocks) {
  const keyText = getBlockText(keyBlock, allBlocks);
  let valueText = '';

  if (keyBlock.Relationships) {
    const valueRelation = keyBlock.Relationships.find(rel => rel.Type === 'VALUE');
    if (valueRelation && valueRelation.Ids) {
      const valueBlocks = valueRelation.Ids.map(id => 
        allBlocks.find(block => block.Id === id)
      ).filter(Boolean);
      
      valueText = valueBlocks.map(block => getBlockText(block, allBlocks)).join(' ');
    }
  }
  
  return {
    key: keyText.trim(),
    value: valueText.trim(),
    confidence: keyBlock.Confidence
  };
}


function processTable(tableBlock, allBlocks) {
  const table = {
    rows: [],
    confidence: tableBlock.Confidence
  };
  
  if (tableBlock.Relationships) {
    const cellRelation = tableBlock.Relationships.find(rel => rel.Type === 'CHILD');
    if (cellRelation && cellRelation.Ids) {
      const cells = cellRelation.Ids.map(id => 
        allBlocks.find(block => block.Id === id && block.BlockType === 'CELL')
      ).filter(Boolean);

      const cellMatrix = {};
      cells.forEach(cell => {
        const row = cell.RowIndex || 1;
        const col = cell.ColumnIndex || 1;
        
        if (!cellMatrix[row]) cellMatrix[row] = {};
        cellMatrix[row][col] = getBlockText(cell, allBlocks);
      });

      Object.keys(cellMatrix).sort((a, b) => parseInt(a) - parseInt(b)).forEach(rowNum => {
        const row = cellMatrix[rowNum];
        const rowData = [];
        Object.keys(row).sort((a, b) => parseInt(a) - parseInt(b)).forEach(colNum => {
          rowData.push(row[colNum]);
        });
        table.rows.push(rowData);
      });
    }
  }
  
  return table;
}


function getBlockText(block, allBlocks) {
  let text = block.Text || '';
  
  if (block.Relationships) {
    const childRelation = block.Relationships.find(rel => rel.Type === 'CHILD');
    if (childRelation && childRelation.Ids) {
      const childTexts = childRelation.Ids.map(id => {
        const childBlock = allBlocks.find(b => b.Id === id);
        return childBlock ? (childBlock.Text || '') : '';
      }).filter(Boolean);
      
      if (childTexts.length > 0) {
        text = childTexts.join(' ');
      }
    }
  }
  
  return text;
}


async function analyzeDocumentAsync(documentBuffer, features) {

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

async function extractWithDetectDocument(documentBuffer) {
  console.log(`[TEXTRACT] Usando detectDocumentText (método básico)`);
  
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
  console.log(`[TEXTRACT] Confianza promedio: ${avgConfidence.toFixed(2)}%`);
  
  const trimmedText = extractedText.trim();
  if (trimmedText.length === 0) {
    throw new Error("NO_TEXT_EXTRACTED");
  }
  
  return trimmedText;
}


function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function extractTextWithDocumentType(filePath, documentType) {
  return await extractTextFromDocument(filePath, documentType);
}

module.exports = {
  extractTextFromDocument,
  extractTextWithDocumentType
};