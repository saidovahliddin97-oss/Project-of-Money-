// Site-wide settings. Keep PRICE_* in sync with the offer prices set in lava.top.
export const CONFIG = {
  PRODUCT: 'LocalLedger',
  PRICE_USD: 20,
  PRICE_EUR: 17.93,
  PRICE_IIF_USD: 20,
  PRICE_IIF_EUR: 17.93,
  // Shown struck through as the launch discount.
  PRICE_WAS_USD: 29,
  // Both tools in one purchase (lava.top product LAVA_PRODUCT_NAME_BUNDLE).
  PRICE_BUNDLE_USD: 34.99,
  PRICE_BUNDLE_EUR: 31.37,
  // 24-hour pass for one-off jobs (lava.top product LAVA_PRODUCT_NAME_PASS).
  PRICE_PASS_USD: 5,
  PRICE_PASS_EUR: 4.48,
  PASS_HOURS: 24,
  // One full export in either tool (lava.top product LAVA_PRODUCT_NAME_ONE).
  PRICE_ONE_USD: 1,
  PRICE_ONE_EUR: 0.9,
  // Rows a free user can export per download. Parsing and preview are unlimited.
  FREE_EXPORT_ROWS: 15,
  // Public support address shown on the site. Leave empty to hide it.
  SUPPORT_EMAIL: 'ahlak2049@gmail.com',
  MAX_FILE_MB: 25,
};
