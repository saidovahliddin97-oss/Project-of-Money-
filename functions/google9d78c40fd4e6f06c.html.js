// Google Search Console ownership file. Served by a function because Pages
// redirects static *.html to the extensionless URL (308), which verification may reject.
export const onRequest = () => new Response('google-site-verification: google9d78c40fd4e6f06c.html', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
