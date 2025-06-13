function extractDocumentUrls(inputData) {
  const documentUrls = {};
  
  const documentFields = [
    { field: 'Soporte_prueba_saber_ProTyt', key: 'soporte_prueba_saberProtyt' }
  ];

  for (const doc of documentFields) {
    const fieldValue = inputData[doc.field];
    if (fieldValue && typeof fieldValue === 'string') {
      if (fieldValue.includes('drive.google.com') || fieldValue.includes('docs.google.com')) {
        documentUrls[doc.key] = fieldValue;
      }
    }
  }
  return documentUrls;
}

module.exports ={
  extractDocumentUrls
};