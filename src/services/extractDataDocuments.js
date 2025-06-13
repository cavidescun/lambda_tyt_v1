async function extractDataTyT(text) {
  const extractedData = {
    numDocumento: "Extracción Manual",
    registroEK: "Extracción Manual",
    institucion: "Extracción Manual",
    programa: "Extracción Manual",
    fechaPresentacion: "Extracción Manual"
  };

  const docPatterns = [
  /Identificaci[oóô]n:\s*C\.?C\.?\s*(\d{6,12})/gi,
  /Identificaci[oóô]n:\s*(\d{6,12})/gi,
  /Identificaci[oóô]n:\s*\n?\s*C\.?C\.?\s*(\d{6,12})/gi,
  /C\.?C\.?\s*(\d{6,12})/gi,
  /N[uúü]mero\s+de\s+(?:documento|identificaci[oóô]n|c[eéê]dula)[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /N[uúü]mero\s+(?:documento|identificaci[oóô]n|c[eéê]dula)[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /N[uúü]mero[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /Num[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /Documento\s+de\s+identidad[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /Documento\s+(?:n[uúü]mero|#|No\.?)[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /Documento[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /Doc\.?\s+(?:n[uúü]mero|#|No\.?)[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /C[eéê]dula\s+de\s+ciudadan[iíî]a[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /C[eéê]dula\s+(?:n[uúü]mero|#|No\.?)[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /C[eéê]dula[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /Ced\.?\s+(?:n[uúü]mero|#|No\.?)[\s\n]*:?\s*C?\.?C?\.?\s*(\d{6,12})/gi,
  /(?:documento|identificaci[oóô]n|c[eéê]dula|n[uúü]mero)[\s\S]{0,50}C\.?C\.?\s*(\d{6,12})/gi,
  /C\.?C\.?[\s\S]{0,30}(?:documento|identificaci[oóô]n|c[eéê]dula|n[uúü]mero)[\s\S]{0,20}(\d{6,12})/gi,
  /(?:documento|identificaci[oóô]n|c[eéê]dula|n[uúü]mero)[\s\n\-_:]*C?\.?C?\.?[\s\n\-_:]*(\d{6,12})/gi,
  /C\.?C\.?[\s\n\-_:]+(\d{6,12})/gi,
  
  // Patrones para formatos específicos de documentos oficiales
  /Tipo\s+de\s+documento[\s\n]*:?\s*C\.?C\.?[\s\n]*N[uúü]mero[\s\n]*:?\s*(\d{6,12})/gi,
  /C[eéê]dula\s+de\s+ciudadan[iíî]a\s+No\.?\s*(\d{6,12})/gi,
  /C[eéê]dula\s+No\.?\s*(\d{6,12})/gi,
  // Patrones para tablas o formularios estructurados
  /(?:documento|identificaci[oóô]n|c[eéê]dula)\s*\|\s*(\d{6,12})/gi,
  /(\d{6,12})\s*\|\s*(?:documento|identificaci[oóô]n|c[eéê]dula)/gi,

  /(?:portador|titular|beneficiario|estudiante)[\s\S]{0,100}(?:documento|c[eéê]dula|identificaci[oóô]n)[\s\S]{0,50}(\d{6,12})/gi,

  /(?:^|[\s\n])(\d{6,12})(?=[\s\n]|$)(?=[\s\S]*(?:documento|identificaci[oóô]n|c[eéê]dula))/gim,

  /[Il1]dentificaci[oóô0]n[\s\n]*:?\s*[Cc]\.?[Cc]\.?\s*(\d{6,12})/gi,
  /[Cc][eéê3]du[Il1]a[\s\n]*:?\s*[Nn][oóô0]\.?\s*(\d{6,12})/gi,

  /(?:documento|identificaci[oóô]n|c[eéê]dula|n[uúü]mero|id|cc)[\s\S]{0,100}?(\d{6,12})/gi
];
  for (const pattern of docPatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      extractedData.numDocumento = match[1];
      break;
    }
  }

  const ekPatterns = [
    /Número\s+de\s+registro:\s*(EK\d{10,15})/gi,
    /Número\s+de\s+registro:\s*\n?\s*(EK\d{10,15})/gi,
    /\b(EK\d{10,15})\b/gi
  ];
  for (const pattern of ekPatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      extractedData.registroEK = match[1];
      break;
    }
  }

  const instPatterns = [
    /Institución\s+de\s+educación\s+superior:\s*([\s\S]+?)\n\s*Programa/gi,
    /Institución\s+de\s+educación\s+superior:\s*([^\n\r]+?)(?=\s*Programa|Educacion\s+Superior|$)/gi,
    /educación\s+superior:\s*([^\n\r]+?)(?=\s*Programa|$)/gi,
    /(Corporacion\s+Unificada\s+Nacional[^\n\r]*?)(?=\s*Programa|$)/gi
  ];
  for (const pattern of instPatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      let institucion = match[1].replace(/\s+/g, ' ').trim();
      if (institucion.length > 10) {
        extractedData.institucion = institucion;
        break;
      }
    }
  }

const progPatterns = [
  /Programa\s+Acad[eéê]mico[\s\n]*:?\s*([^\n\r]+?)(?=\s*(?:EXAMEN|Examen|FECHA|Fecha|NIVEL|Nivel|SUPERIOR|Superior|PRESENTÓ|Presento|QUE|[2-9]\.|Reporte|Aplicaci[oóô]n|$))/gi,
  /Programa\s+Acad[eéê]mico[\s\n]*:?\s*\n?\s*([^\n\r]+?)(?=\s*(?:EXAMEN|Examen|FECHA|Fecha|NIVEL|Nivel|SUPERIOR|Superior|PRESENTÓ|Presento|QUE|[2-9]\.|$))/gi,
  /Programa\s+Acad[eéê]mico[\s\n]*:?\s*([^\n\r]{10,})(?=\s*(?:EXAMEN|Examen|FECHA|Fecha|NIVEL|Nivel|SUPERIOR|Superior|PRESENTÓ|Presento|QUE))/gi,
  /Programa[\s\n]*:?\s*([^\n\r]+?)(?=\s*(?:EXAMEN|Examen|FECHA|Fecha|NIVEL|Nivel|SUPERIOR|Superior|PRESENTÓ|Presento|QUE|[2-9]\.|Sede|Jornada|Modalidad|$))/gi,
  /Prog\.\s*([^\n\r]+?)(?=\s*(?:EXAMEN|Examen|FECHA|Fecha|NIVEL|Nivel|SUPERIOR|Superior|PRESENTÓ|Presento|QUE|[2-9]\.|$))/gi,
  /Pr[oóô]grama\s+[Aa4]cad[eéê]m[iíl1]co[\s\n]*:?\s*([^\n\r]+?)(?=\s*(?:EXAMEN|Examen|FECHA|Fecha|NIVEL|Nivel|SUPERIOR|Superior|PRESENTÓ|Presento|QUE|[2-9]\.|$))/gi,
  /Pr[oóô]grama[\s\n]*:?\s*([^\n\r]+?)(?=\s*(?:EXAMEN|Examen|FECHA|Fecha|NIVEL|Nivel|SUPERIOR|Superior|PRESENTÓ|Presento|QUE|[2-9]\.|$))/gi,
  /Programa\s+Acad[eéê]mico[\s\n]*:?\s*([^\n\r]+?)(?=\s*[2-9]\.|Reporte|Aplicaci[oóô]n|$)/gi,
  /Programa\s+Acad[eéê]mico[\s\n]*:?\s*\n?\s*([^\n\r]+?)(?=\s*[2-9]\.|$)/gi,
  /Programa\s+Acad[eéê]mico[\s\n]*:?\s*([^\n\r]{10,})/gi,
  /Programa[\s\n]*:?\s*([^\n\r]+?)(?=\s*[2-9]\.|Sede|Jornada|Modalidad|$)/gi,
  /Prog\.\s*([^\n\r]+?)(?=\s*[2-9]\.|$)/gi,
  /Pr[oóô]grama\s+[Aa4]cad[eéê]m[iíl1]co[\s\n]*:?\s*([^\n\r]+?)(?=\s*[2-9]\.|$)/gi,
  /Pr[oóô]grama[\s\n]*:?\s*([^\n\r]+?)(?=\s*[2-9]\.|$)/gi,
];
  for (const pattern of progPatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      let programa = match[1].replace(/\s+/g, ' ').trim();
      programa = programa.replace(/\s*\d+\.\s*$/, '').trim();
      if (programa.length > 10) {
        extractedData.programa = programa;
        break;
      }
    }
  }

  const datePatterns = [
    /Aplicación\s+del\s+examen:\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
    /Aplicación\s+del\s+examen:\s*\n?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
    /Aplicación[^:]*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g
  ];
  for (let i = 0; i < datePatterns.length; i++) {
    const pattern = datePatterns[i];
    if (i < 3) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        extractedData.fechaPresentacion = match[1];
        break;
      }
    } else {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const aplicacionIndex = text.indexOf('Aplicación del examen');
        if (aplicacionIndex !== -1) {
          for (const fecha of matches) {
            const fechaIndex = text.indexOf(fecha, aplicacionIndex);
            if (fechaIndex !== -1 && fechaIndex - aplicacionIndex < 100) {
              extractedData.fechaPresentacion = fecha;
              break;
            }
          }
        }
        if (extractedData.fechaPresentacion === "Extracción Manual" && matches[0]) {
          extractedData.fechaPresentacion = matches[0];
        }
        break;
      }
    }
  }

  return extractedData;
}


module.exports = {
  extractDataTyT
}