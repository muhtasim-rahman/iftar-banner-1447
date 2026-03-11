/* ======================================================
   Project Exporter Pro  |  v3.2
   ──────────────────────────────────────────────────────
   A universal, zero-setup web export engine.
   Drop a single <script> tag into any HTML project —
   a full-featured export UI appears automatically.
   No extra HTML, no CSS file, no configuration needed.

   Formats : PNG · JPG · WebP · SVG
             PDF (RGB) · PDF (CMYK) · CMYK JPEG
   Scale   : 0.25× – 32× via number input
             ≤ 8×  → blue   theme
             > 8×  → amber  warning
             > 16× → red    danger warning
   Engine  : html-to-image (SVG foreignObject)
             CSS gradient text, custom fonts, shadows,
             canvas pixels — all rendered natively.
   Capture : Off-screen clone — no viewport clipping.

   Author  : Muhtasim Rahman (Turzo)
   Website : https://mdturzo.odoo.com
   GitHub  : https://github.com/muhtasim-rahman/exporter-pro
   License : MIT
====================================================== */

(function () {
  'use strict';

  try {

    /* ─── Shadow DOM ──────────────────────────────────── */
    const host = document.createElement('div');
    host.id = 'ep-' + Math.random().toString(36).slice(2, 9);
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });

    /* ─── Shared state ────────────────────────────────── */
    let generatedData = [];
    let isPaused      = false;
    let isStopped     = false;
    let totalSize     = 0;
    let activeScale   = 2;

    /* ─── README source (update if you fork the repo) ─── */
    const README_RAW = 'https://raw.githubusercontent.com/muhtasim-rahman/exporter-pro/main/README.md';
    const README_GH  = 'https://github.com/muhtasim-rahman/exporter-pro/blob/main/README.md';

    /* ══════════════════════════════════════════════════════
       1 · Resource Loader
    ══════════════════════════════════════════════════════ */
    function loadScript(src) {
      return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    function loadStylesheet(href) {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    }

    async function initResources() {
      try {
        loadStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
        if (!window.htmlToImage)
          await loadScript('https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js');
        if (!window.JSZip)
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      } catch (e) {
        console.warn('[Exporter Pro] Resource warning:', e);
      }
    }

    const ensureJsPDF = () =>
      window.jspdf ? Promise.resolve()
        : loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    const ensureMarked = () =>
      window.marked ? Promise.resolve()
        : loadScript('https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js');

    /* ══════════════════════════════════════════════════════
       2 · Styles
    ══════════════════════════════════════════════════════ */
    function injectStyles() {
      /* Font Awesome inside shadow so icons render */
      const fa = document.createElement('link');
      fa.rel = 'stylesheet';
      fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      shadow.appendChild(fa);

      const st = document.createElement('style');
      st.textContent = `
        :host {
          all: initial; display: block;
          font-family: 'Inter','Segoe UI',sans-serif;
          background: #080808; color: #d1d1d1;
          padding: 60px 20px; box-sizing: border-box;
          border-top: 1px solid #1a1a1a; width: 100%;
        }
        * { box-sizing: border-box; }
        .ep-wrap { max-width: 1200px; margin: 0 auto; }

        /* ── Toast ── */
        .ep-toast {
          position: fixed; top: 30px; right: 30px; z-index: 10005;
          padding: 14px 22px; background: #121212; color: #fff;
          border-radius: 8px; border: 1px solid #333;
          border-left: 5px solid #3b82f6;
          box-shadow: 0 10px 30px rgba(0,0,0,.7);
          font-size: 14px; display: flex; align-items: center; gap: 12px;
          visibility: hidden; opacity: 0; transform: translateX(50px);
          transition: all .35s cubic-bezier(.68,-.55,.265,1.55);
        }
        .ep-toast.show   { visibility: visible; opacity: 1; transform: translateX(0); }
        .ep-toast.terror { border-left-color: #ef4444; }

        /* ── Header ── */
        .ep-header {
          text-align: center; margin-bottom: 40px;
          position: relative; padding: 0 50px;
        }
        .ep-header h2 {
          font-size: 28px; color: #fff;
          text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px;
        }
        .ep-header h2 span { color: #3b82f6; }
        .ep-header p { color: #555; font-size: 13px; margin: 0; }
        .ep-docs-btn {
          position: absolute; top: 0; right: 0;
          width: 38px; height: 38px; border-radius: 8px;
          background: transparent; border: 1px solid #222;
          color: #555; cursor: pointer; font-size: 15px;
          display: flex; align-items: center; justify-content: center;
          transition: .15s;
        }
        .ep-docs-btn:hover { color: #3b82f6; border-color: #3b82f6; background: rgba(59,130,246,.07); }
        @media (max-width: 480px) {
          .ep-header { padding: 0; }
          .ep-docs-btn { position: static; margin: 12px auto 0; display: flex; }
        }

        /* ── Grid ── */
        .ep-grid { display: grid; gap: 15px; margin-bottom: 30px; grid-template-columns: 1fr; }
        @media (min-width: 600px)  { .ep-grid { grid-template-columns: repeat(2,1fr); } }
        @media (min-width: 1024px) { .ep-grid { grid-template-columns: repeat(4,1fr); } }

        .ep-field label {
          display: block; font-size: 11px; color: #666;
          margin-bottom: 8px; text-transform: uppercase; font-weight: 700;
        }
        .ep-field input, .ep-field select {
          width: 100%; padding: 12px;
          background: #111; border: 1px solid #222;
          border-radius: 6px; color: #fff; font-size: 14px; outline: none;
          transition: border-color .2s, color .2s;
        }
        .ep-field input { cursor: text; }
        .ep-field select { cursor: pointer; }

        /* Scale colour themes */
        #ep-scale.th-blue  { border-color: #3b82f6; color: #93c5fd; }
        #ep-scale.th-amber { border-color: #f59e0b; color: #fcd34d; }
        #ep-scale.th-red   { border-color: #ef4444; color: #fca5a5; }

        /* Scale warning */
        .ep-scale-warn {
          display: none; margin-top: 8px;
          border-radius: 6px; padding: 9px 13px;
          font-size: 12px; line-height: 1.5;
          gap: 8px; align-items: flex-start;
        }
        .ep-scale-warn.show        { display: flex; }
        .ep-scale-warn.th-amber    { background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.25); color: #fbbf24; }
        .ep-scale-warn.th-red      { background: rgba(239,68,68,.08);  border: 1px solid rgba(239,68,68,.3);  color: #f87171; }
        .ep-scale-warn i           { margin-top: 2px; flex-shrink: 0; }

        /* ── Action buttons ── */
        .ep-action-row {
          display: flex; gap: 12px; justify-content: center;
          margin-bottom: 30px; flex-wrap: wrap;
        }
        .ep-main-btn {
          height: 48px; min-width: 160px; border-radius: 6px; border: none;
          font-weight: 600; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-size: 14px; transition: .2s; flex: 1 1 auto; max-width: 250px;
        }
        @media (max-width: 600px) { .ep-main-btn { width: 100%; max-width: 100%; } }
        .ep-btn-gen   { background: #fff; color: #000; }
        .ep-btn-pause { background: #f59e0b; color: #fff; display: none; }
        .ep-btn-stop  { background: #ef4444; color: #fff; display: none; }
        .ep-btn-clear { background: transparent; color: #666; border: 1px solid #333; display: none; }

        /* ── Progress ── */
        .ep-progress-box { margin: 40px 0; display: none; position: relative; padding-top: 30px; }
        .ep-progress-bar { width: 100%; height: 6px; background: #1a1a1a; border-radius: 10px; position: relative; }
        .ep-progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg,#3b82f6,#8b5cf6); border-radius: 10px; transition: width .3s ease; }
        .ep-progress-badge {
          position: absolute; top: 0; left: 0;
          transform: translate(-50%,-100%);
          background: #3b82f6; color: #fff;
          padding: 4px 10px; border-radius: 4px;
          font-size: 10px; font-weight: 800;
          transition: left .3s ease; white-space: nowrap; margin-bottom: 10px;
        }

        /* ── Preview table ── */
        .ep-preview-box { background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 8px; overflow: hidden; display: none; margin-top: 30px; }
        .ep-preview-head { padding: 18px; background: #141414; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .ep-content-area { max-height: 1200px; overflow: hidden; transition: max-height .4s ease-in-out; }
        .ep-content-area.collapsed { max-height: 0; }
        .ep-table-wrap { overflow-x: auto; width: 100%; scrollbar-width: thin; scrollbar-color: #333 #1a1a1a; }
        .ep-table-wrap::-webkit-scrollbar { height: 6px; }
        .ep-table-wrap::-webkit-scrollbar-track { background: #1a1a1a; }
        .ep-table-wrap::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; color: #aaa; font-size: 13px; min-width: 650px; }
        th { text-align: left; padding: 15px; background: #141414; border-bottom: 1px solid #222; color: #666; font-size: 11px; text-transform: uppercase; }
        td { padding: 12px 15px; border-bottom: 1px solid #151515; }
        .ep-name-cell { color: #fff; font-weight: 500; white-space: nowrap; display: inline-block; }
        .ep-row-btn { background: transparent; border: 1px solid #333; color: #888; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 5px; }
        .ep-row-btn:hover { border-color: #fff; color: #fff; }

        /* ── Image preview modal ── */
        .ep-img-ov {
          position: fixed; inset: 0; background: rgba(0,0,0,.95);
          display: none; align-items: center; justify-content: center;
          z-index: 10002; padding: 20px; backdrop-filter: blur(8px);
        }
        .ep-img-box { background: #111; width: 90%; max-width: 1000px; max-height: 90%; border-radius: 12px; border: 1px solid #333; overflow: hidden; }
        .ep-modal-head { padding: 15px 20px; background: #181818; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; }
        .ep-modal-body { padding: 20px; text-align: center; background: #0a0a0a; }
        .ep-modal-body img { max-width: 100%; max-height: 70vh; border-radius: 4px; }
        .ep-xbtn { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; line-height: 1; padding: 0 2px; }
        .ep-xbtn:hover { color: #fff; }

        /* ── Docs modal ── */
        .ep-docs-ov {
          position: fixed; inset: 0; background: rgba(0,0,0,.92);
          display: none; align-items: flex-start; justify-content: center;
          z-index: 10003; padding: 32px 20px; backdrop-filter: blur(14px);
          overflow-y: auto;
        }
        .ep-docs-ov.open { display: flex; }
        .ep-docs-box {
          background: #0d1117; border: 1px solid #21262d; border-radius: 10px;
          width: 100%; max-width: 860px;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 64px rgba(0,0,0,.9);
          min-height: 0;
        }
        .ep-docs-head {
          padding: 12px 18px; background: #161b22;
          border-bottom: 1px solid #21262d;
          display: flex; justify-content: space-between; align-items: center;
          flex-shrink: 0; border-radius: 10px 10px 0 0;
        }
        .ep-docs-head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ep-docs-repo {
          font-size: 13px; color: #58a6ff; font-weight: 600;
          display: flex; align-items: center; gap: 7px; text-decoration: none;
        }
        .ep-docs-repo:hover { text-decoration: underline; }
        .ep-docs-branch {
          font-size: 11px; color: #8b949e; background: #21262d;
          border: 1px solid #30363d; padding: 2px 9px; border-radius: 20px;
        }
        .ep-docs-close {
          background: none; border: 1px solid #30363d; color: #8b949e;
          width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; font-size: 13px; transition: .15s;
          flex-shrink: 0;
        }
        .ep-docs-close:hover { color: #fff; border-color: #555; }
        .ep-docs-body {
          overflow-y: auto; max-height: 78vh;
          scrollbar-width: thin; scrollbar-color: #30363d #0d1117;
        }
        .ep-docs-body::-webkit-scrollbar { width: 6px; }
        .ep-docs-body::-webkit-scrollbar-track { background: #0d1117; }
        .ep-docs-body::-webkit-scrollbar-thumb { background: #30363d; border-radius: 10px; }
        .ep-docs-loader { padding: 52px; text-align: center; color: #8b949e; font-size: 14px; }
        .ep-docs-spinner {
          width: 28px; height: 28px; margin: 0 auto 18px;
          border: 2px solid #21262d; border-top-color: #58a6ff;
          border-radius: 50%; animation: ep-rot .7s linear infinite;
        }
        @keyframes ep-rot { to { transform: rotate(360deg); } }

        /* GitHub-flavoured markdown */
        .ep-md { padding: 28px 36px; color: #e6edf3; font-size: 15px; line-height: 1.75; }
        .ep-md h1 { font-size: 26px; font-weight: 700; color: #f0f6fc; border-bottom: 1px solid #21262d; padding-bottom: 10px; margin: 0 0 20px; }
        .ep-md h2 { font-size: 20px; font-weight: 700; color: #f0f6fc; border-bottom: 1px solid #21262d; padding-bottom: 7px; margin: 28px 0 14px; }
        .ep-md h3 { font-size: 16px; font-weight: 600; color: #f0f6fc; margin: 22px 0 10px; }
        .ep-md h4 { font-size: 14px; font-weight: 600; color: #f0f6fc; margin: 18px 0 8px; }
        .ep-md p  { margin: 0 0 14px; }
        .ep-md ul, .ep-md ol { padding-left: 22px; margin: 0 0 14px; }
        .ep-md li { margin: 5px 0; }
        .ep-md a  { color: #58a6ff; text-decoration: none; }
        .ep-md a:hover { text-decoration: underline; }
        .ep-md code { background: #161b22; border: 1px solid #30363d; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'Consolas','Courier New',monospace; color: #79c0ff; }
        .ep-md pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; overflow-x: auto; margin: 0 0 16px; }
        .ep-md pre code { background: none; border: none; padding: 0; color: #e6edf3; font-size: 13px; }
        .ep-md blockquote { border-left: 3px solid #3b82f6; padding-left: 14px; color: #8b949e; margin: 0 0 14px; }
        .ep-md table { width: 100%; border-collapse: collapse; margin: 0 0 16px; }
        .ep-md th { background: #161b22; padding: 8px 14px; text-align: left; border: 1px solid #30363d; font-weight: 600; color: #f0f6fc; font-size: 13px; }
        .ep-md td { padding: 8px 14px; border: 1px solid #21262d; font-size: 13px; }
        .ep-md tr:nth-child(even) td { background: rgba(255,255,255,.03); }
        .ep-md hr { border: none; border-top: 1px solid #21262d; margin: 24px 0; }
        .ep-md strong { color: #f0f6fc; font-weight: 600; }
        .ep-md em { font-style: italic; }
        .ep-md img { max-width: 100%; border-radius: 6px; }
        @media (max-width: 600px) { .ep-md { padding: 18px; } }

        /* ── Footer ── */
        .ep-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #1a1a1a; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #444; flex-wrap: wrap; gap: 15px; }
        .ep-footer-link { color: #666; text-decoration: none; transition: .2s; display: flex; align-items: center; gap: 5px; }
        .ep-footer-link:hover { color: #3b82f6; }
        .ep-spin { animation: ep-rot 1s linear infinite; }
      `;
      shadow.appendChild(st);
    }

    /* ══════════════════════════════════════════════════════
       3 · Utilities
    ══════════════════════════════════════════════════════ */
    function truncateFileName(str) {
      const max = window.innerWidth < 768 ? 24 : 40;
      if (str.length <= max) return str;
      const dot  = str.lastIndexOf('.');
      const ext  = dot !== -1 ? str.slice(dot) : '';
      const name = dot !== -1 ? str.slice(0, dot) : str;
      const keep = max - 6 - ext.length;
      if (keep <= 0) return str.slice(0, max) + '…';
      return name.slice(0, Math.ceil(keep / 2)) + ' .... ' + name.slice(-Math.floor(keep / 2)) + ext;
    }

    function formatBytes(b) {
      if (!b) return '0 B';
      const k = 1024, u = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return (b / Math.pow(k, i)).toFixed(2) + ' ' + u[i];
    }

    function showToast(msg, type = 'ok') {
      let t = shadow.querySelector('.ep-toast');
      if (!t) { t = document.createElement('div'); t.className = 'ep-toast'; shadow.appendChild(t); }
      if (window._epTT) clearTimeout(window._epTT);
      t.className = 'ep-toast show' + (type === 'error' ? ' terror' : '');
      t.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> ${msg}`;
      window._epTT = setTimeout(() => t.classList.remove('show'), 2400);
    }

    /* CMYK conversion: RGB → CMYK → RGB (print-accurate tones) */
    function applyPrintCMYK(canvas) {
      const ctx = canvas.getContext('2d');
      const id  = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d   = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const k = 1 - Math.max(r, g, b);
        if (k >= 1) { d[i] = d[i + 1] = d[i + 2] = 0; continue; }
        const c = (1 - r - k) / (1 - k);
        const m = (1 - g - k) / (1 - k);
        const y = (1 - b - k) / (1 - k);
        d[i]     = Math.round(255 * (1 - c) * (1 - k));
        d[i + 1] = Math.round(255 * (1 - m) * (1 - k));
        d[i + 2] = Math.round(255 * (1 - y) * (1 - k));
      }
      ctx.putImageData(id, 0, 0);
    }

    /* ══════════════════════════════════════════════════════
       4 · Off-screen Capture
       ────────────────────────────────────────────────────
       Elements wider than the viewport are clipped when
       html-to-image measures layout. Fix: clone the element,
       place it at top:-(H+400)px with overflow:visible so
       the browser renders it fully outside the viewport,
       then capture at explicit W×H — zero clipping.
    ══════════════════════════════════════════════════════ */
    async function captureElement(el, scale, format) {
      const W    = el.offsetWidth  || el.scrollWidth  || 800;
      const H    = el.offsetHeight || el.scrollHeight || 400;
      const outW = Math.round(W * scale);
      const outH = Math.round(H * scale);

      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        position: 'fixed', top: `-${outH + 400}px`, left: '0',
        width: `${outW}px`, height: `${outH}px`,
        overflow: 'visible', zIndex: '-1', pointerEvents: 'none',
      });

      const clone = el.cloneNode(true);
      Object.assign(clone.style, {
        position: 'absolute', top: '0', left: '0',
        width: `${W}px`, height: `${H}px`,
        transform: `scale(${scale})`, transformOrigin: 'top left',
        margin: '0', flexShrink: '0',
      });

      /* Copy live canvas pixel data (e.g. animated starfields) */
      el.querySelectorAll('canvas').forEach((src, i) => {
        const dst = clone.querySelectorAll('canvas')[i];
        if (!dst) return;
        dst.width = src.width; dst.height = src.height;
        const ctx = dst.getContext('2d');
        if (ctx) ctx.drawImage(src, 0, 0);
      });

      wrap.appendChild(clone);
      document.body.appendChild(wrap);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      let dataUrl, blob;
      const lib  = window.htmlToImage;
      const opts = { width: outW, height: outH, pixelRatio: 1, skipAutoScale: true, cacheBust: true };

      try {
        if (format === 'svg') {
          dataUrl = await lib.toSvg(wrap, opts);
          blob    = new Blob([dataUrl], { type: 'image/svg+xml' });

        } else if (format === 'jpeg') {
          dataUrl = await lib.toJpeg(wrap, { ...opts, quality: 0.95 });
          blob    = await (await fetch(dataUrl)).blob();

        } else if (format === 'cmyk-jpeg') {
          const png = await lib.toPng(wrap, opts);
          const img = await new Promise((res, rej) => {
            const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = png;
          });
          const cvs = document.createElement('canvas');
          cvs.width = outW; cvs.height = outH;
          cvs.getContext('2d').drawImage(img, 0, 0);
          applyPrintCMYK(cvs);
          dataUrl = cvs.toDataURL('image/jpeg', 0.95);
          blob    = await (await fetch(dataUrl)).blob();

        } else if (format === 'pdf' || format === 'cmyk-pdf') {
          const isCMYK = format === 'cmyk-pdf';
          if (isCMYK) {
            const png = await lib.toPng(wrap, opts);
            const img = await new Promise((res, rej) => {
              const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = png;
            });
            const cvs = document.createElement('canvas');
            cvs.width = outW; cvs.height = outH;
            cvs.getContext('2d').drawImage(img, 0, 0);
            applyPrintCMYK(cvs);
            dataUrl = cvs.toDataURL('image/jpeg', 0.95);
          } else {
            dataUrl = await lib.toPng(wrap, opts);
          }
          blob = null; /* PDFs are saved via jsPDF */

        } else {
          /* PNG / WebP */
          blob    = await lib.toBlob(wrap, opts);
          dataUrl = URL.createObjectURL(blob);
        }
      } finally {
        document.body.removeChild(wrap);
      }

      return { dataUrl, blob, outW, outH };
    }

    async function savePdf(dataUrl, outW, outH, fileName, isCMYK) {
      await ensureJsPDF();
      const { jsPDF } = window.jspdf;
      const orient = outW >= outH ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation: orient, unit: 'px', format: [outW, outH], compress: true });
      pdf.addImage(dataUrl, isCMYK ? 'JPEG' : 'PNG', 0, 0, outW, outH, '', isCMYK ? 'FAST' : 'NONE');
      pdf.save(fileName);
    }

    /* ══════════════════════════════════════════════════════
       5 · Build UI
    ══════════════════════════════════════════════════════ */
    function buildUI() {
      const frag = document.createElement('div');
      frag.innerHTML = `

        <div class="ep-wrap">
          <!-- Header -->
          <div class="ep-header">
            <h2>Project Exporter <span>Pro</span></h2>
            <p>Universal export engine — drop into any HTML project.</p>
            <button class="ep-docs-btn" id="ep-docs-btn" title="View Documentation">
              <i class="fa-regular fa-file-lines"></i>
            </button>
          </div>

          <!-- Controls grid -->
          <div class="ep-grid">
            <div class="ep-field">
              <label>Target Selector</label>
              <input type="text" id="ep-target" value="page" placeholder=".page  or  #my-div">
            </div>
            <div class="ep-field">
              <label>Base File Name</label>
              <input type="text" id="ep-name" value="Export">
            </div>
            <div class="ep-field">
              <label>Scale &nbsp;(0.25× – 32×)</label>
              <input type="number" id="ep-scale" value="2" min="0.25" max="32" step="0.25" class="th-blue">
              <div class="ep-scale-warn" id="ep-scale-warn"></div>
            </div>
            <div class="ep-field">
              <label>Format</label>
              <select id="ep-format">
                <option value="png">PNG</option>
                <option value="jpeg">JPG</option>
                <option value="webp">WebP</option>
                <option value="svg">SVG</option>
                <option value="pdf">PDF  (RGB)</option>
                <option value="cmyk-pdf">PDF  (CMYK — Print)</option>
                <option value="cmyk-jpeg">CMYK JPEG  (Print)</option>
              </select>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="ep-action-row">
            <button id="ep-gen-btn"   class="ep-main-btn ep-btn-gen"  ><i class="fa-solid fa-play"></i> <span>Generate &amp; Export</span></button>
            <button id="ep-pause-btn" class="ep-main-btn ep-btn-pause"><i class="fa-solid fa-pause"></i> Pause</button>
            <button id="ep-stop-btn"  class="ep-main-btn ep-btn-stop" ><i class="fa-solid fa-stop"></i> Stop</button>
            <button id="ep-clear-btn" class="ep-main-btn ep-btn-clear"><i class="fa-solid fa-rotate"></i> Reset</button>
          </div>

          <!-- Progress -->
          <div id="ep-progress-box" class="ep-progress-box">
            <div class="ep-progress-bar">
              <div id="ep-pbadge" class="ep-progress-badge">0%</div>
              <div id="ep-pfill"  class="ep-progress-fill"></div>
            </div>
          </div>

          <!-- Preview / table -->
          <div id="ep-preview-box" class="ep-preview-box">
            <div id="ep-toggle" class="ep-preview-head">
              <h3 style="font-size:13px;color:#fff;margin:0">
                <i class="fa-solid fa-list-check"></i> Preview &amp; Download
                <span id="ep-counter" style="color:#666;margin-left:10px">(0/0)</span>
              </h3>
              <i class="fa-solid fa-chevron-down" id="ep-chevron"></i>
            </div>
            <div id="ep-content" class="ep-content-area">
              <div class="ep-table-wrap">
                <table>
                  <thead><tr>
                    <th style="width:4%">No.</th>
                    <th style="width:30%">File Name</th>
                    <th style="width:15%">Resolution</th>
                    <th style="width:15%">Size</th>
                    <th style="width:36%;text-align:right">Action</th>
                  </tr></thead>
                  <tbody id="ep-tbody"></tbody>
                </table>
              </div>
              <div style="padding:20px;background:#111;border-top:1px solid #1a1a1a">
                <button id="ep-zip-btn" style="width:100%;background:#fff;color:#000;border:none;padding:15px;border-radius:6px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px">
                  <i class="fa-solid fa-box-archive"></i>
                  <span>Download All (ZIP)</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <footer class="ep-footer">
            <div>Copyright <i class="fa-regular fa-copyright"></i> Project Exporter Pro v3.2</div>
            <a href="https://mdturzo.odoo.com" target="_blank" class="ep-footer-link">
              <i class="fa-solid fa-globe"></i> Muhtasim Rahman · mdturzo.odoo.com
            </a>
          </footer>
        </div>

        <!-- Image Preview Modal -->
        <div id="ep-img-ov" class="ep-img-ov">
          <div class="ep-img-box">
            <div class="ep-modal-head">
              <span id="ep-img-title" style="font-size:14px;font-weight:600;color:#fff">Preview</span>
              <button class="ep-xbtn" id="ep-img-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="ep-modal-body"><img id="ep-img-el" src="" alt="preview"></div>
          </div>
        </div>

        <!-- Docs Modal -->
        <div id="ep-docs-ov" class="ep-docs-ov">
          <div class="ep-docs-box">
            <div class="ep-docs-head">
              <div class="ep-docs-head-left">
                <a href="${README_GH}" target="_blank" class="ep-docs-repo">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.4.6.11.82-.26.82-.57v-2c-3.34.73-4.04-1.61-4.04-1.61-.54-1.37-1.33-1.74-1.33-1.74-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.8c1.02 0 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.68.83.57C20.56 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z"/>
                  </svg>
                  muhtasim-rahman / exporter-pro
                </a>
                <span class="ep-docs-branch">main · README.md</span>
              </div>
              <button class="ep-docs-close" id="ep-docs-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="ep-docs-body" id="ep-docs-body">
              <div class="ep-docs-loader">
                <div class="ep-docs-spinner"></div>
                Loading documentation from GitHub…
              </div>
            </div>
          </div>
        </div>
      `;

      [...frag.children].forEach(c => shadow.appendChild(c));
    }

    /* ══════════════════════════════════════════════════════
       6 · Logic
    ══════════════════════════════════════════════════════ */
    function initLogic() {
      const $ = id => shadow.getElementById(id);

      const btnGen    = $('ep-gen-btn');
      const btnPause  = $('ep-pause-btn');
      const btnStop   = $('ep-stop-btn');
      const btnClear  = $('ep-clear-btn');
      const btnZip    = $('ep-zip-btn');
      const pFill     = $('ep-pfill');
      const pBadge    = $('ep-pbadge');
      const tbody     = $('ep-tbody');
      const counterEl = $('ep-counter');
      const scaleEl   = $('ep-scale');
      const warnEl    = $('ep-scale-warn');

      /* ── Scale input: live colour + warning ── */
      function updateScaleTheme() {
        const v = parseFloat(scaleEl.value) || 2;
        activeScale = v;
        if (v > 16) {
          scaleEl.className = 'th-red';
          warnEl.className  = 'ep-scale-warn show th-red';
          warnEl.innerHTML  = `<i class="fa-solid fa-radiation"></i>
            <span><strong>${v}× is extremely high.</strong>
            Output may crash the browser or take several minutes.
            Use only for professional print production.</span>`;
        } else if (v > 8) {
          scaleEl.className = 'th-amber';
          warnEl.className  = 'ep-scale-warn show th-amber';
          warnEl.innerHTML  = `<i class="fa-solid fa-triangle-exclamation"></i>
            <span><strong>${v}× is very large.</strong>
            Capture will be slow and produce large files.
            Ensure you have enough memory.</span>`;
        } else {
          scaleEl.className = 'th-blue';
          warnEl.className  = 'ep-scale-warn';
          warnEl.innerHTML  = '';
        }
      }
      scaleEl.addEventListener('input',  updateScaleTheme);
      scaleEl.addEventListener('change', updateScaleTheme);
      updateScaleTheme();

      /* ── Collapse toggle ── */
      $('ep-toggle').addEventListener('click', () => {
        $('ep-content').classList.toggle('collapsed');
        $('ep-chevron').style.transform =
          $('ep-content').classList.contains('collapsed') ? 'rotate(-90deg)' : '';
      });

      /* ── Image preview modal ── */
      $('ep-img-close').addEventListener('click', () => $('ep-img-ov').style.display = 'none');
      $('ep-img-ov').addEventListener('click', e => {
        if (e.target === $('ep-img-ov')) $('ep-img-ov').style.display = 'none';
      });

      /* ── Docs modal ── */
      let docsLoaded = false;
      async function openDocs() {
        $('ep-docs-ov').classList.add('open');
        if (docsLoaded) return;
        try {
          await ensureMarked();
          const res = await fetch(README_RAW);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const md   = await res.text();
          const html = window.marked.parse(md);
          $('ep-docs-body').innerHTML = `<div class="ep-md">${html}</div>`;
          docsLoaded = true;
        } catch {
          $('ep-docs-body').innerHTML = `
            <div class="ep-docs-loader" style="color:#ef4444">
              Could not load README from GitHub.<br><br>
              <a href="${README_GH}" target="_blank" style="color:#58a6ff">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open on GitHub
              </a>
            </div>`;
        }
      }
      $('ep-docs-btn').addEventListener('click', openDocs);
      $('ep-docs-close').addEventListener('click', () => $('ep-docs-ov').classList.remove('open'));
      $('ep-docs-ov').addEventListener('click', e => {
        if (e.target === $('ep-docs-ov')) $('ep-docs-ov').classList.remove('open');
      });

      /* ── Reset ── */
      function reset() {
        generatedData.forEach(d => {
          if (d.url && d.url.startsWith('blob:')) URL.revokeObjectURL(d.url);
        });
        generatedData = []; totalSize = 0;
        tbody.innerHTML = '';
        $('ep-preview-box').style.display  = 'none';
        $('ep-progress-box').style.display = 'none';
        btnClear.style.display = 'none';
        isStopped = false; isPaused = false;
      }
      btnClear.addEventListener('click', reset);

      /* ── Generate & Export ── */
      btnGen.addEventListener('click', async () => {
        const rawSel = $('ep-target').value.trim() || '.page';
        const sel    = /^[.#]/.test(rawSel) ? rawSel : '.' + rawSel;
        const name   = $('ep-name').value.trim() || 'Export';
        const format = $('ep-format').value;
        const scale  = Math.min(32, Math.max(0.1, parseFloat(scaleEl.value) || 2));
        const isPdf  = format === 'pdf' || format === 'cmyk-pdf';

        const els = document.querySelectorAll(sel);
        if (!els.length) {
          showToast('No elements found for "' + sel + '"', 'error');
          return;
        }

        reset();
        btnGen.style.display   = 'none';
        btnPause.style.display = 'inline-flex';
        btnStop.style.display  = 'inline-flex';
        $('ep-preview-box').style.display  = 'block';
        $('ep-progress-box').style.display = 'block';

        if (isPdf) {
          try { await ensureJsPDF(); }
          catch { showToast('Could not load jsPDF', 'error'); }
        }

        for (let i = 0; i < els.length; i++) {
          if (isStopped) break;
          while (isPaused) {
            await new Promise(r => setTimeout(r, 200));
            if (isStopped) break;
          }
          if (isStopped) break;

          try {
            if (!window.htmlToImage) {
              showToast('html-to-image not loaded', 'error'); break;
            }

            const { dataUrl, blob, outW, outH } = await captureElement(els[i], scale, format);
            const scaleLabel = Number.isInteger(scale) ? scale + 'x' : scale + 'x';
            const ext  = isPdf ? 'pdf'
                       : format === 'jpeg' || format === 'cmyk-jpeg' ? 'jpg'
                       : format === 'svg'  ? 'svg'
                       : format;
            const file = `${name}-${String(i + 1).padStart(2, '0')}@${scaleLabel}.${ext}`;

            let blobUrl = null, sizeCell = '';

            if (isPdf) {
              await savePdf(dataUrl, outW, outH, file, format === 'cmyk-pdf');
              sizeCell = `<span style="color:#8b5cf6;font-weight:600">PDF ↓</span>`;
            } else {
              blobUrl    = dataUrl.startsWith('blob:') ? dataUrl : URL.createObjectURL(blob);
              totalSize += blob.size;
              sizeCell   = `<span style="color:#3b82f6;font-weight:600">${formatBytes(blob.size)}</span>`;
            }

            generatedData.push({ fileName: file, blob, url: blobUrl, dataUrl });

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${i + 1}</td>
              <td><div class="ep-name-cell" title="${file}">${truncateFileName(file)}</div></td>
              <td><span style="color:#555;font-size:11px">${outW}×${outH}</span></td>
              <td>${sizeCell}</td>
              <td style="text-align:right">
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  ${!isPdf ? `<button class="ep-row-btn" data-idx="${i}" data-act="preview"><i class="fa-solid fa-eye"></i></button>` : ''}
                  ${!isPdf ? `<button class="ep-row-btn" data-idx="${i}" data-act="dl"><i class="fa-solid fa-download"></i> Save</button>`
                           : `<span style="color:#555;font-size:11px;padding:6px">saved ✓</span>`}
                </div>
              </td>`;

            tr.querySelectorAll('[data-act]').forEach(btn => {
              btn.addEventListener('click', () => {
                const item = generatedData[btn.dataset.idx];
                if (btn.dataset.act === 'preview') {
                  $('ep-img-el').src = item.dataUrl || item.url;
                  $('ep-img-title').innerText = item.fileName;
                  $('ep-img-ov').style.display = 'flex';
                } else {
                  const a = document.createElement('a');
                  a.href = item.url || item.dataUrl;
                  a.download = item.fileName; a.click();
                  showToast('Saved: ' + item.fileName);
                }
              });
            });

            tbody.appendChild(tr);

            const pct = Math.round(((i + 1) / els.length) * 100);
            pFill.style.width = pct + '%';
            pBadge.style.left = pct + '%';
            pBadge.innerText  = pct + '%';
            counterEl.innerText = `(${i + 1}/${els.length})`;
            if (!isPdf)
              btnZip.querySelector('span').innerText =
                `Download All (ZIP) — ${formatBytes(totalSize)}`;

          } catch (err) {
            console.error('[Exporter Pro] Capture error:', err);
            showToast('Error on item ' + (i + 1), 'error');
          }
        }

        btnPause.style.display = 'none';
        btnStop.style.display  = 'none';
        btnGen.style.display   = 'inline-flex';
        btnClear.style.display = 'inline-flex';
        showToast(isStopped ? 'Stopped' : 'Export complete!');
      });

      /* ── Pause / Resume ── */
      btnPause.addEventListener('click', () => {
        isPaused = !isPaused;
        btnPause.innerHTML = isPaused
          ? '<i class="fa-solid fa-play"></i> Resume'
          : '<i class="fa-solid fa-pause"></i> Pause';
        btnPause.style.background = isPaused ? '#22c55e' : '#f59e0b';
      });

      /* ── Stop ── */
      btnStop.addEventListener('click', () => { isStopped = true; });

      /* ── ZIP ── */
      btnZip.addEventListener('click', async () => {
        const items = generatedData.filter(d => d.blob);
        if (!items.length) { showToast('No image files to ZIP', 'error'); return; }
        if (!window.JSZip)  { showToast('JSZip not loaded', 'error'); return; }

        btnZip.disabled  = true;
        const orig = btnZip.innerHTML;
        btnZip.innerHTML = '<i class="fa-solid fa-spinner ep-spin"></i> Creating ZIP…';

        try {
          const zip = new JSZip();
          items.forEach(d => zip.file(d.fileName, d.blob));
          const zblob = await zip.generateAsync({ type: 'blob' });
          const a = document.createElement('a');
          a.href     = URL.createObjectURL(zblob);
          a.download = ($('ep-name').value || 'Export') + '.zip';
          a.click();
          URL.revokeObjectURL(a.href);
        } catch { showToast('ZIP failed', 'error'); }

        btnZip.disabled  = false;
        btnZip.innerHTML = orig;
      });
    }

    /* ══════════════════════════════════════════════════════
       7 · Start
    ══════════════════════════════════════════════════════ */
    (async function start() {
      await initResources();
      injectStyles();
      buildUI();
      initLogic();
    })();

  } catch (err) {
    console.error('[Exporter Pro] Fatal error:', err);
  }

})();
