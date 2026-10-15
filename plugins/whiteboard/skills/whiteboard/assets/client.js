// Injected into every board: live reload with scroll restore, and error reporting.
(() => {
  const here = decodeURIComponent(location.pathname).replace(/^\//, '');
  const key = 'wb-scroll:' + location.pathname;

  try {
    const y = sessionStorage.getItem(key);
    if (y !== null) {
      sessionStorage.removeItem(key);
      const restore = () => window.scrollTo(0, Number(y));
      restore();
      addEventListener('load', restore);
      // Mermaid renders after load and changes page height; restore once more.
      addEventListener('wb:rendered', restore);
    }
  } catch {}

  const reload = () => {
    try { sessionStorage.setItem(key, String(window.scrollY)); } catch {}
    location.reload();
  };

  const relevant = changed => {
    if (here === '' || here.endsWith('/')) return true; // index pages track everything
    if (!/\.html?$/i.test(changed)) return true;        // shared css/js/images
    return changed === here || changed === here + '.html';
  };

  let connected = false;
  const es = new EventSource('/_wb/events?page=' + encodeURIComponent(location.pathname));
  es.addEventListener('change', e => { if (relevant(JSON.parse(e.data).path)) reload(); });
  // Reconnecting after a server restart: the file may have changed while we were away.
  es.onopen = () => { if (connected) reload(); connected = true; };

  const report = (message, detail) => {
    try {
      fetch('/_wb/errors', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: location.pathname, message: String(message), detail: detail ? String(detail) : undefined }),
        keepalive: true,
      });
    } catch {}
  };
  window.__wbReport = report;
  addEventListener('error', e => report(e.message || 'resource failed to load', e.error?.stack || e.target?.src || e.target?.href));
  addEventListener('unhandledrejection', e => report(e.reason?.message || e.reason, e.reason?.stack));
})();
