// Site-wide settings. Keep PRICE_* in sync with the offer prices set in lava.top.
export const CONFIG = {
  PRODUCT: 'LocalLedger',
  PRICE_USD: 29,
  PRICE_EUR: 25.92,
  PRICE_IIF_USD: 29,
  PRICE_IIF_EUR: 25.92,
  // Both tools in one purchase (lava.top product LAVA_PRODUCT_NAME_BUNDLE).
  PRICE_BUNDLE_USD: 49,
  PRICE_BUNDLE_EUR: 43.92,
  // Rows a free user can export per download. Parsing and preview are unlimited.
  FREE_EXPORT_ROWS: 15,
  // Public support address shown on the site. Leave empty to hide it.
  SUPPORT_EMAIL: 'ahlak2049@gmail.com',
  MAX_FILE_MB: 25,
};
