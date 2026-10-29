/* GD Expense Tracker — PUBLIC configuration. Never put secrets here (this file is public).
   APPS_SCRIPT_URL: your Apps Script Web App /exec URL. Leave empty to let users paste it in the app. */
window.GD_CONFIG = {
  APP_NAME: 'GD Expense Tracker',
  APPS_SCRIPT_URL: '',
  VERSION: '1.0.0',
  PWA: true,                       // false in the Blogger build (Blogger cannot host sw.js/manifest at the site root)
  LOGO_MARK: 'icons/logo-mark.png',
  LOGO_FULL: 'icons/logo-full.png'
};
