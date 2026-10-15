// Optional helpers for boards: Mermaid diagrams and code highlighting, loaded only when used.
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const report = (msg, detail) => window.__wbReport?.(msg, detail);
const tasks = [];

const diagrams = document.querySelectorAll('.mermaid');
if (diagrams.length) {
  tasks.push(import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs').then(async ({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'loose', fontFamily: getComputedStyle(document.body).fontFamily });
    for (const el of diagrams) {
      const source = el.textContent;
      try {
        await mermaid.run({ nodes: [el] });
      } catch (e) {
        el.classList.add('wb-error');
        el.textContent = 'Mermaid error: ' + (e.message || e);
        report('Mermaid: ' + (e.message || e), source.trim());
      }
    }
  }));
}

if (document.querySelector('pre code[class*="language-"]')) {
  const v = '11.11.1';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${v}/styles/${dark ? 'github-dark' : 'github'}.min.css`;
  document.head.append(link);
  tasks.push(import(`https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@${v}/es/highlight.min.js`).then(({ default: hljs }) => {
    document.querySelectorAll('pre code[class*="language-"]').forEach(el => hljs.highlightElement(el));
  }));
}

Promise.allSettled(tasks).then(results => {
  for (const r of results) if (r.status === 'rejected') report(r.reason?.message || r.reason);
  dispatchEvent(new Event('wb:rendered'));
});
