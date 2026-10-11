// Anonymous page-view counter: page path, referring site and utm_source only.
// No cookies, no identifiers; country and device are derived on the server.
try {
  const ref = document.referrer ? new URL(document.referrer).host : '';
  const visit = ref !== location.host;
  const body = JSON.stringify({
    name: 'pageview',
    path: location.pathname,
    ref: visit ? ref : '',
    visit,
    src: new URLSearchParams(location.search).get('utm_source') || '',
  });
  navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
} catch {
  /* never break the page */
}
