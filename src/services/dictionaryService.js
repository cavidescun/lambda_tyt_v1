const fs = require("fs-extra");
const path = require("path");

const dictionaryCache = {};

const dictionaryMapping = {
  soporte_prueba_saberProtyt: "DiccionarioTYT.txt",
};

async function getDictionaryForDocumentType(documentType) {
  const dictionaryFileName = dictionaryMapping[documentType];

  if (!dictionaryFileName) {
    console.warn(
      `[DICT] No se encontró mapeo de diccionario para el tipo: ${documentType}`
    );
    return [];
  }
  return await loadDictionary(dictionaryFileName);
}

async function loadDictionary(dictionaryFileName) {
  try {
    const dictionaryPath = path.join(
      process.cwd(),
      "dictionaries",
      dictionaryFileName
    );
    const content = await fs.readFile(dictionaryPath, "utf8");
    const keywords = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    dictionaryCache[dictionaryFileName] = keywords;
    return keywords;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  getDictionaryForDocumentType
};