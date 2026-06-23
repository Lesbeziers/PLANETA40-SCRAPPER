async function scrapeKannak(onProgress) {
  const progress = onProgress || (() => {});
  progress({ source: 'Kannak', status: 'pending' });
  // TODO: implementar scraping real de https://www.kannak.es/es-es/search-result
  return [];
}

module.exports = { scrapeKannak };
