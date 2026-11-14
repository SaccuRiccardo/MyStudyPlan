import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PDF.js also ships generic UI selectors (for example .sidebar). Keep them inside
// the PDF reader so loading it cannot restyle the surrounding application.
const scopePdfStyles = {
  postcssPlugin: 'scope-study-orbit-pdf-styles',
  Once(root) {
    const file = root.source?.input?.file?.replaceAll('\\', '/');
    if (!file?.endsWith('/pdfjs-dist/web/pdf_viewer.css')) return;
    root.walkRules(rule => {
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'rule' || (parent.type === 'atrule' && /keyframes$/i.test(parent.name))) return;
      }
      rule.selectors = rule.selectors.map(selector => selector.includes(':root')
        ? selector.replaceAll(':root', '.pdf-reader')
        : `.pdf-reader ${selector}`);
    });
  },
};

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [scopePdfStyles] } },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8766' },
  },
});
