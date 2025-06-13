async function validateTextWithDictionary(text, dictionary, minMatches = 1) {
  if (!text || !dictionary || dictionary.length === 0) {
    return false;
  }
  const normalizedText = text.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of dictionary) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (normalizedKeyword && normalizedText.includes(normalizedKeyword)) {
      matchCount++;
      if (matchCount >= minMatches) {
        return true;
      }
    }
  }
  return false;
}

module.exports = {
  validateTextWithDictionary
}