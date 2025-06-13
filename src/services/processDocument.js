const { getDictionaryForDocumentType } = require('./dictionaryService');
const { validateTextWithDictionary} = require('./validatorDocuments');
const { extractTextWithDocumentType } = require('./textract');
const { extractDataTyT } = require('./extractDataDocuments');

async function processDocuments(inputData, downloadedFiles, documentUrls) {
  const output = {
    NombreCompleto: inputData.Nombre_completo || '',
    NumeroDocumento: inputData.Numero_de_Documento || '',
    NivelDeFormacion: inputData.NivelDeFormacion || '',
    SaberProTyT: '',
    EK :'',
    Num_Documento_Extraido:'',
    Fecha_Presentacion_Extraida:'',
    Programa_Extraido:'',
    Institucion_Extraida:'',
    Institucion_Valida: '',
    NivelFormacion_Valido:''
  };

  const documentMap = {};
  for (const file of downloadedFiles) {
    for (const [docType, url] of Object.entries(documentUrls)) {
      if (file.originalUrl === url) {
        documentMap[docType] = file;
        break;
      }
    }
  }

  await processDocumentType(documentMap, 'soporte_prueba_saberProtyt', output, 'SaberProTyT', inputData);
  return output;
}

async function processDocumentType(documentMap, docType, output, outputField, inputData){
  try {

    const file = documentMap[docType];
    if (!file) {
      console.log(`[PROCESS] No se encontró archivo para tipo: ${docType}`);
      output[outputField] = "Documento no adjunto";
      return;
    }

    console.log(`[PROCESS] Archivo encontrado: ${file.fileName} (${formatBytes(file.size)})`);

    const extractedText = await extractTextWithDocumentType(file.path, docType);

    const dictionary = await getDictionaryForDocumentType(docType);
    const isValid = await validateTextWithDictionary(extractedText, dictionary);

    console.log(`[PROCESS] Validación ${docType}: ${isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);

    if (isValid) {
      if (docType === 'soporte_prueba_saberProtyt') {
        const dataTyT = await extractDataTyT(extractedText);

        output.EK = dataTyT.registroEK;
        output.Num_Documento_Extraido = dataTyT.numDocumento;
        output.Fecha_Presentacion_Extraida = dataTyT.fechaPresentacion;
        output.Programa_Extraido = dataTyT.programa;
        output.Institucion_Extraida = dataTyT.institucion;

        if (dataTyT.numDocumento === inputData.Numero_de_Documento) {
          output.Num_Doc_Valido = 'Valido';
          console.log(`[PROCESS] Número de documento COINCIDE`);
        } else {
          output.Num_Doc_Valido = 'Revision Manual';
          console.log(`[PROCESS] Número de documento NO COINCIDE: ${dataTyT.numDocumento} vs ${inputData.Numero_de_Documento}`);
        }

         if (dataTyT.numDocumento === inputData.Numero_de_Documento) {
          output.Num_Doc_Valido = 'Valido';
          console.log(`[PROCESS] Número de documento COINCIDE`);
        } else {
          output.Num_Doc_Valido = 'Revision Manual';
          console.log(`[PROCESS] Número de documento NO COINCIDE: ${dataTyT.numDocumento} vs ${inputData.Numero_de_Documento}`);
        }

        const dictionaryCUN = await getDictionaryForDocumentType('cun_institutions');
        const validInstitution = await validateTextWithDictionary(dataTyT.institucion, dictionaryCUN);

        if (validInstitution) {
          output.Institucion_Valida = 'Valido';
          console.log(`[PROCESS] Institución CUN VÁLIDA`);
        } else {
          output.Institucion_Valida = 'Revision Manual';
          console.log(`[PROCESS] Institución CUN REQUIERE REVISIÓN`);
        }
      }
      
      output[outputField] = "Documento Valido";
      console.log(`[PROCESS] ${docType} marcado como VÁLIDO`);
      
    } else {
      output[outputField] = "Revision Manual";
      console.log(`[PROCESS] ${docType} marcado para REVISIÓN MANUAL`);
    }
    
  } catch (error) {
    console.error(`[PROCESS] Error procesando ${docType}:`, error.message);

    if (error.message.includes('HTML_FILE_DETECTED')) {
      output[outputField] = "Archivo HTML detectado - Revision Manual";
    } else if (error.message.includes('NO_TEXT_EXTRACTED')) {
      output[outputField] = "Sin texto extraíble - Revision Manual";
    } else if (error.message.includes('PERMISSION_DENIED')) {
      output[outputField] = "Sin permisos de acceso - Revision Manual";
    } else if (error.message.includes('DOCUMENT_TOO_LARGE')) {
      output[outputField] = "Documento muy grande - Revision Manual";
    } else if (error.message.includes('UNSUPPORTED_FILE_TYPE')) {
      output[outputField] = "Tipo de archivo no soportado - Revision Manual";
    } else {
      output[outputField] = "Error en procesamiento - Revision Manual";
    }
    
    console.error(`[PROCESS] Detalle del error para ${docType}:`, {
      message: error.message,
      stack: error.stack?.substring(0, 200) + '...'
    });
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  processDocuments
}