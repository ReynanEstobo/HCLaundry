try {
  var settings = JSON.parse(localStorage.getItem('ic_laundry_settings') || localStorage.getItem('hc_laundry_settings') || '{}');
  if (settings.darkMode) document.documentElement.setAttribute('data-theme', 'dark');
} catch (_) {}
