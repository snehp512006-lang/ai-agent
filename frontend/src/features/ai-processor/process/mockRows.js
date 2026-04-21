export const buildMockedRowsFromProducts = (analysisData) => {
  const primary = Array.isArray(analysisData?.products_analysis)
    ? analysisData.products_analysis
    : [];
  const fallback = Array.isArray(analysisData?.products)
    ? analysisData.products
    : [];
  const products = primary.length ? primary : fallback;

  return products.map((p) => ({
    product: p.product || p.name || p.sku || 'Unknown',
    current_stock: p.current_stock ?? p.stock ?? 0,
    velocity: p.velocity ?? p.daily_sales ?? p.total_sales ?? 0,
    ai_status: 'COMPLETED',
    ai_result: p.why || p.WHY || p.reason || '',
    cleaned_summary: p.what || p.WHAT || p.action || '',
    prediction: p.risk_level || p.risk || 'HEALTHY',
    is_reinforced: true,
  }));
};
