/* ======================================================
   PROJECT EXPORTER Pro
   Version: 3.3

   Changes from v3.1:
   ✅ Engine: html2canvas → html-to-image
      → Fixes CSS gradient text (-webkit-background-clip)
   ✅ New formats: SVG, PDF (RGB), PDF (CMYK), CMYK JPEG
   ✅ Local <img> auto-converted to base64 before capture
      then restored — no clone, no empty image bug
   ✅ Scale: 0.25× – 32× with live colour warnings
   ✅ Status label shows each capture phase
   ✅ Retry logic (3×) on transient failures

   Stable (unchanged from v3.1):
   Shadow DOM · Dark UI · Responsive Grid
   Progress bar · Pause/Resume/Stop
   Ellipsis truncation · ZIP · Modal preview
   Toast · Dark scrollbars · Footer

   Author  : Muhtasim Rahman (Turzo)
   Website : https://mdturzo.odoo.com
   GitHub  : https://github.com/muhtasim-rahman/exporter-pro
====================================================== */

(function () {
  'use strict';

  try {

    /* ── Shadow DOM ── */
    const host = document.createElement('div');
    host.id = 'ep-' + Math.random().toString(36).slice(2, 9);
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });

    /* ── State ── */
    let generatedData = [];
    let isPaused      = false;
    let isStopped     = false;
    let totalSize     = 0;

    /* ══════════════════════════════════════════════════════
       1 · Resources
    ══════════════════════════════════════════════════════ */
    function loadScript(src) {
      return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    function loadLink(href) {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    }

    async function initResources() {
      try {
        loadLink('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
        if (!window.htmlToImage)
          await loadScript('https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js');
        if (!window.JSZip)
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      } catch (e) { console.warn('[Exporter Pro] Resource warning:', e); }
    }

    const ensureJsPDF = () => window.jspdf ? Promise.resolve()
      : loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    /* ══════════════════════════════════════════════════════
       2 · Styles
    ══════════════════════════════════════════════════════ */
    function injectStyles() {
      const fa = document.createElement('link');
      fa.rel = 'stylesheet';
      fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      shadow.appendChild(fa);

      const st = document.createElement('style');
      st.textContent = `
        :host { all:initial;display:block;font-family:'Inter','Segoe UI',sans-serif;background:#080808;color:#d1d1d1;padding:60px 20px;box-sizing:border-box;border-top:1px solid #1a1a1a;width:100%; }
        * { box-sizing:border-box; }
        .ep-container { max-width:1200px;margin:0 auto; }

        /* Toast */
        .ep-toast { position:fixed;top:30px;right:30px;z-index:10005;padding:14px 22px;background:#121212;color:#fff;border-radius:8px;border:1px solid #333;border-left:5px solid #3b82f6;box-shadow:0 10px 30px rgba(0,0,0,.7);font-size:14px;display:flex;align-items:center;gap:12px;visibility:hidden;opacity:0;transform:translateX(50px);transition:all .35s cubic-bezier(.68,-.55,.265,1.55); }
        .ep-toast.show  { visibility:visible;opacity:1;transform:translateX(0); }
        .ep-toast.error { border-left-color:#ef4444; }

        /* Header */
        .ep-header { text-align:center;margin-bottom:40px; }
        .ep-header h2 { font-size:28px;color:#fff;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px; }
        .ep-header h2 span { color:#3b82f6; }
        .ep-header p { color:#555;font-size:13px;margin:0; }

        /* Grid */
        .ep-grid { display:grid;gap:15px;margin-bottom:30px;grid-template-columns:1fr; }
        @media(min-width:600px)  { .ep-grid { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:1024px) { .ep-grid { grid-template-columns:repeat(4,1fr); } }
        .ep-field label { display:block;font-size:11px;color:#666;margin-bottom:8px;text-transform:uppercase;font-weight:700; }
        .ep-field input, .ep-field select { width:100%;padding:12px;background:#111;border:1px solid #222;border-radius:6px;color:#fff;font-size:14px;outline:none;transition:border-color .2s,color .2s; }

        /* Scale themes */
        #ep-scale.th-blue  { border-color:#3b82f6;color:#93c5fd; }
        #ep-scale.th-amber { border-color:#f59e0b;color:#fcd34d; }
        #ep-scale.th-red   { border-color:#ef4444;color:#fca5a5; }
        .ep-scale-warn { display:none;margin-top:8px;border-radius:6px;padding:9px 13px;font-size:12px;line-height:1.5;gap:8px;align-items:flex-start; }
        .ep-scale-warn.show     { display:flex; }
        .ep-scale-warn.th-amber { background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#fbbf24; }
        .ep-scale-warn.th-red   { background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:#f87171; }
        .ep-scale-warn i { margin-top:2px;flex-shrink:0; }

        /* Buttons */
        .ep-action-row { display:flex;gap:12px;justify-content:center;margin-bottom:30px;flex-wrap:wrap; }
        .ep-main-btn { height:48px;min-width:160px;border-radius:6px;border:none;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:.2s;flex:1 1 auto;max-width:250px; }
        @media(max-width:600px) { .ep-main-btn { width:100%;max-width:100%; } }
        .ep-btn-gen   { background:#fff;color:#000; }
        .ep-btn-pause { background:#f59e0b;color:#fff;display:none; }
        .ep-btn-stop  { background:#ef4444;color:#fff;display:none; }
        .ep-btn-clear { background:transparent;color:#666;border:1px solid #333;display:none; }

        /* Progress */
        .ep-progress-box { margin:40px 0;display:none;position:relative;padding-top:30px; }
        .ep-progress-bar { width:100%;height:6px;background:#1a1a1a;border-radius:10px;position:relative; }
        .ep-progress-fill { height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);border-radius:10px;transition:width .3s ease; }
        .ep-progress-badge { position:absolute;top:0;left:0;transform:translate(-50%,-100%);background:#3b82f6;color:#fff;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:800;transition:left .3s ease;white-space:nowrap; }
        .ep-status-label { font-size:12px;color:#555;text-align:center;margin-top:12px;min-height:18px; }

        /* Preview box */
        .ep-preview-box { background:#0f0f0f;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;display:none;margin-top:30px; }
        .ep-preview-head { padding:18px;background:#141414;cursor:pointer;display:flex;justify-content:space-between;align-items:center; }
        .ep-content-area { max-height:1200px;overflow:hidden;transition:max-height .4s ease-in-out; }
        .ep-content-area.collapsed { max-height:0; }

        /* Table */
        .ep-table-wrapper { overflow-x:auto;width:100%;scrollbar-width:thin;scrollbar-color:#333 #1a1a1a; }
        .ep-table-wrapper::-webkit-scrollbar { height:6px; }
        .ep-table-wrapper::-webkit-scrollbar-track { background:#1a1a1a; }
        .ep-table-wrapper::-webkit-scrollbar-thumb { background:#333;border-radius:10px; }
        table { width:100%;border-collapse:collapse;color:#aaa;font-size:13px;min-width:650px; }
        th { text-align:left;padding:15px;background:#141414;border-bottom:1px solid #222;color:#666;font-size:11px;text-transform:uppercase; }
        td { padding:12px 15px;border-bottom:1px solid #151515; }
        .ep-name-cell { color:#fff;font-weight:500;white-space:nowrap;display:inline-block; }
        .ep-row-btn { background:transparent;border:1px solid #333;color:#888;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px; }
        .ep-row-btn:hover { border-color:#fff;color:#fff; }

        /* Modal */
        .ep-modal-ov { position:fixed;inset:0;background:rgba(0,0,0,.95);display:none;align-items:center;justify-content:center;z-index:10002;padding:20px;backdrop-filter:blur(8px); }
        .ep-modal { background:#111;width:90%;max-width:1000px;max-height:90%;border-radius:12px;border:1px solid #333;overflow:hidden; }
        .ep-modal-head { padding:15px 20px;background:#181818;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #222; }
        .ep-modal-body { padding:20px;text-align:center;background:#0a0a0a; }
        .ep-modal-body img { max-width:100%;max-height:70vh;border-radius:4px; }
        .ep-close-btn { background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:0 2px; }
        .ep-close-btn:hover { color:#fff; }

        /* Footer */
        .ep-footer { margin-top:40px;padding-top:20px;border-top:1px solid #1a1a1a;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#444;flex-wrap:wrap;gap:15px; }
        .ep-footer-link { color:#666;text-decoration:none;transition:.2s;display:flex;align-items:center;gap:5px; }
        .ep-footer-link:hover { color:#3b82f6; }
        .ep-spin { animation:ep-spin 1s linear infinite; }
        @keyframes ep-spin { to { transform:rotate(360deg); } }
      `;
      shadow.appendChild(st);
    }

    /* ══════════════════════════════════════════════════════
       3 · Utilities
    ══════════════════════════════════════════════════════ */
    function truncateFileName(str) {
      const max = window.innerWidth < 768 ? 24 : 40;
      if (str.length <= max) return str;
      const dot = str.lastIndexOf('.');
      const ext  = dot !== -1 ? str.slice(dot) : '';
      const name = dot !== -1 ? str.slice(0, dot) : str;
      const keep = max - 6 - ext.length;
      if (keep <= 0) return str.slice(0, max) + '…';
      return name.slice(0, Math.ceil(keep/2)) + ' .... ' + name.slice(-Math.floor(keep/2)) + ext;
    }
    function formatBytes(b) {
      if (!b) return '0 Bytes';
      const k = 1024, u = ['Bytes','KB','MB','GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return (b / Math.pow(k, i)).toFixed(2) + ' ' + u[i];
    }
    function showToast(msg, type = 'success') {
      let t = shadow.querySelector('.ep-toast');
      if (!t) { t = document.createElement('div'); t.className = 'ep-toast'; shadow.appendChild(t); }
      if (window._epTT) clearTimeout(window._epTT);
      t.className = `ep-toast show${type === 'error' ? ' error' : ''}`;
      t.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> ${msg}`;
      window._epTT = setTimeout(() => t.classList.remove('show'), 2500);
    }
    function applyPrintCMYK(canvas) {
      const ctx = canvas.getContext('2d');
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]/255, g = d[i+1]/255, b = d[i+2]/255;
        const k = 1 - Math.max(r,g,b);
        if (k >= 1) { d[i]=d[i+1]=d[i+2]=0; continue; }
        const c=(1-r-k)/(1-k), m=(1-g-k)/(1-k), y=(1-b-k)/(1-k);
        d[i]=Math.round(255*(1-c)*(1-k)); d[i+1]=Math.round(255*(1-m)*(1-k)); d[i+2]=Math.round(255*(1-y)*(1-k));
      }
      ctx.putImageData(id, 0, 0);
    }

    /* ══════════════════════════════════════════════════════
       4 · Capture
       ──────────────────────────────────────────────────────
       Strategy: capture the ORIGINAL element directly.
       Before capture → swap <img> src to base64 (canvas).
       After capture  → restore original src.
       No cloning, no off-screen div, no visibility issues.
    ══════════════════════════════════════════════════════ */

    /** Convert any img URL to base64 via <canvas>. Returns original on failure. */
    function toBase64(src) {
      if (!src || src.startsWith('data:')) return Promise.resolve(src);
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width  = img.naturalWidth  || 1;
            c.height = img.naturalHeight || 1;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
          } catch { resolve(src); }
        };
        img.onerror = () => resolve(src);
        // cache-bust helps with local file quirks
        img.src = src.includes('?') ? src : src + '?_ep=' + Date.now();
      });
    }

    async function captureElement(el, scale, format, onStatus) {
      onStatus && onStatus('Converting images…');

      /* ── Step 1: Replace <img> srcs with base64, save originals ── */
      const imgBackups = [];
      for (const img of el.querySelectorAll('img')) {
        if (!img.src || img.src.startsWith('data:')) continue;
        const b64 = await toBase64(img.src);
        imgBackups.push({ img, original: img.src });
        img.src = b64;
        img.removeAttribute('srcset');
      }

      /* ── Step 2: Brief frame wait for browser to repaint ── */
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      onStatus && onStatus('Rendering…');

      const W = el.offsetWidth  || el.scrollWidth  || 800;
      const H = el.offsetHeight || el.scrollHeight || 400;
      const outW = Math.round(W * scale);
      const outH = Math.round(H * scale);

      const lib  = window.htmlToImage;
      const opts = {
        width:      W,
        height:     H,
        pixelRatio: scale,
        cacheBust:  true,
        skipFonts:  false,
        fetchRequestInit: { cache: 'no-cache' },
      };

      /* ── Step 3: Retry wrapper ── */
      async function tryCapture(fn, retries = 3) {
        for (let i = 1; i <= retries; i++) {
          try { return await fn(); }
          catch (err) {
            if (i === retries) throw err;
            console.warn(`[Exporter Pro] Attempt ${i} failed, retrying…`);
            await new Promise(r => setTimeout(r, 400 * i));
          }
        }
      }

      let dataUrl, blob;
      try {
        if (format === 'svg') {
          dataUrl = await tryCapture(() => lib.toSvg(el, opts));
          blob    = new Blob([dataUrl], { type: 'image/svg+xml' });

        } else if (format === 'jpeg') {
          dataUrl = await tryCapture(() => lib.toJpeg(el, { ...opts, quality: 0.95, backgroundColor: '#ffffff' }));
          blob    = await (await fetch(dataUrl)).blob();

        } else if (format === 'cmyk-jpeg') {
          const png = await tryCapture(() => lib.toPng(el, opts));
          const img = await new Promise((res, rej) => { const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=png; });
          const cvs = document.createElement('canvas');
          cvs.width=outW; cvs.height=outH;
          cvs.getContext('2d').drawImage(img, 0, 0, outW, outH);
          applyPrintCMYK(cvs);
          dataUrl = cvs.toDataURL('image/jpeg', 0.95);
          blob    = await (await fetch(dataUrl)).blob();

        } else if (format === 'pdf' || format === 'cmyk-pdf') {
          const isCMYK = format === 'cmyk-pdf';
          const png = await tryCapture(() => lib.toPng(el, opts));
          if (isCMYK) {
            const img = await new Promise((res, rej) => { const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=png; });
            const cvs = document.createElement('canvas');
            cvs.width=outW; cvs.height=outH;
            cvs.getContext('2d').drawImage(img, 0, 0, outW, outH);
            applyPrintCMYK(cvs);
            dataUrl = cvs.toDataURL('image/jpeg', 0.95);
          } else {
            dataUrl = png;
          }
          blob = null; /* PDF handled by jsPDF */

        } else {
          /* PNG / WebP */
          blob    = await tryCapture(() => lib.toBlob(el, { ...opts, type: format === 'webp' ? 'image/webp' : 'image/png' }));
          dataUrl = URL.createObjectURL(blob);
        }
      } finally {
        /* ── Step 4: Always restore original <img> srcs ── */
        imgBackups.forEach(b => { b.img.src = b.original; });
      }

      return { dataUrl, blob, outW, outH };
    }

    async function savePdf(dataUrl, outW, outH, fileName, isCMYK) {
      await ensureJsPDF();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: outW >= outH ? 'landscape' : 'portrait', unit: 'px', format: [outW, outH], compress: true });
      pdf.addImage(dataUrl, isCMYK ? 'JPEG' : 'PNG', 0, 0, outW, outH, '', isCMYK ? 'FAST' : 'NONE');
      pdf.save(fileName);
    }

    /* ══════════════════════════════════════════════════════
       5 · Build UI
    ══════════════════════════════════════════════════════ */
    function buildUI() {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="ep-container">
          <div class="ep-header">
            <h2>Project Exporter <span>Pro</span></h2>
            <p>Professional export tool — v3.2</p>
          </div>

          <div class="ep-grid">
            <div class="ep-field">
              <label>Target Selector</label>
              <input type="text" id="ep-target" value="banner" placeholder=".banner  or  #my-div">
            </div>
            <div class="ep-field">
              <label>Base Name</label>
              <input type="text" id="ep-name" value="Project">
            </div>
            <div class="ep-field">
              <label>Scale (0.25× – 32×)</label>
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
                <option value="pdf">PDF (RGB)</option>
                <option value="cmyk-pdf">PDF (CMYK — Print)</option>
                <option value="cmyk-jpeg">CMYK JPEG (Print)</option>
              </select>
            </div>
          </div>

          <div class="ep-action-row">
            <button id="ep-gen-btn"   class="ep-main-btn ep-btn-gen"  ><i class="fa-solid fa-play"></i> <span>Generate List</span></button>
            <button id="ep-pause-btn" class="ep-main-btn ep-btn-pause"><i class="fa-solid fa-pause"></i> Pause</button>
            <button id="ep-stop-btn"  class="ep-main-btn ep-btn-stop" ><i class="fa-solid fa-stop"></i> Stop</button>
            <button id="ep-clear-btn" class="ep-main-btn ep-btn-clear"><i class="fa-solid fa-rotate"></i> Reset</button>
          </div>

          <div id="ep-progress-box" class="ep-progress-box">
            <div class="ep-progress-bar">
              <div id="ep-pbadge" class="ep-progress-badge">0%</div>
              <div id="ep-pfill"  class="ep-progress-fill"></div>
            </div>
            <div id="ep-status-label" class="ep-status-label"></div>
          </div>

          <div id="ep-preview-box" class="ep-preview-box">
            <div id="ep-toggle" class="ep-preview-head">
              <h3 style="font-size:13px;color:#fff;margin:0">
                <i class="fa-solid fa-list-check"></i> Preview &amp; Download
                <span id="ep-counter" style="color:#666;margin-left:10px">(0/0)</span>
              </h3>
              <i class="fa-solid fa-chevron-down" id="ep-chevron"></i>
            </div>
            <div id="ep-content" class="ep-content-area">
              <div class="ep-table-wrapper">
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
                  <i class="fa-solid fa-box-archive"></i><span>Download All (ZIP)</span>
                </button>
              </div>
            </div>
          </div>

          <footer class="ep-footer">
            <div>Copyright <i class="fa-regular fa-copyright"></i> Project Exporter Pro v3.2</div>
            <a href="https://mdturzo.odoo.com" target="_blank" class="ep-footer-link">
              <i class="fa-solid fa-globe"></i> Muhtasim Rahman | mdturzo.odoo.com
            </a>
          </footer>
        </div>

        <div id="ep-modal-ov" class="ep-modal-ov">
          <div class="ep-modal">
            <div class="ep-modal-head">
              <span id="ep-modal-title" style="font-size:14px;font-weight:600;color:#fff">Preview</span>
              <button class="ep-close-btn" id="ep-modal-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="ep-modal-body"><img id="ep-modal-img" src="" alt="preview"></div>
          </div>
        </div>
      `;
      shadow.appendChild(wrapper.firstElementChild);
      shadow.appendChild(wrapper.lastElementChild);
    }

    /* ══════════════════════════════════════════════════════
       6 · Logic
    ══════════════════════════════════════════════════════ */
    function initLogic() {
      const $ = id => shadow.getElementById(id);

      const btnGen   = $('ep-gen-btn');
      const btnPause = $('ep-pause-btn');
      const btnStop  = $('ep-stop-btn');
      const btnClear = $('ep-clear-btn');
      const btnZip   = $('ep-zip-btn');
      const pFill    = $('ep-pfill');
      const pBadge   = $('ep-pbadge');
      const tbody    = $('ep-tbody');
      const counter  = $('ep-counter');
      const scaleEl  = $('ep-scale');
      const warnEl   = $('ep-scale-warn');
      const statusEl = $('ep-status-label');

      const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

      /* Scale colour theme */
      function updateScaleTheme() {
        const v = parseFloat(scaleEl.value) || 2;
        if (v > 16) {
          scaleEl.className = 'th-red';
          warnEl.className  = 'ep-scale-warn show th-red';
          warnEl.innerHTML  = `<i class="fa-solid fa-radiation"></i><span><strong>${v}× extremely high.</strong> May crash browser. Use only for print production.</span>`;
        } else if (v > 8) {
          scaleEl.className = 'th-amber';
          warnEl.className  = 'ep-scale-warn show th-amber';
          warnEl.innerHTML  = `<i class="fa-solid fa-triangle-exclamation"></i><span><strong>${v}× is very large.</strong> Capture will be slow. Ensure sufficient memory.</span>`;
        } else {
          scaleEl.className = 'th-blue';
          warnEl.className  = 'ep-scale-warn';
          warnEl.innerHTML  = '';
        }
      }
      scaleEl.addEventListener('input',  updateScaleTheme);
      scaleEl.addEventListener('change', updateScaleTheme);
      updateScaleTheme();

      /* Collapse */
      $('ep-toggle').addEventListener('click', () => {
        $('ep-content').classList.toggle('collapsed');
        $('ep-chevron').style.transform = $('ep-content').classList.contains('collapsed') ? 'rotate(-90deg)' : '';
      });

      /* Modal */
      $('ep-modal-close').addEventListener('click', () => $('ep-modal-ov').style.display = 'none');
      $('ep-modal-ov').addEventListener('click', e => { if (e.target === $('ep-modal-ov')) $('ep-modal-ov').style.display = 'none'; });

      /* Reset */
      function reset() {
        generatedData.forEach(d => { if (d.url && d.url.startsWith('blob:')) URL.revokeObjectURL(d.url); });
        generatedData = []; totalSize = 0;
        tbody.innerHTML = '';
        $('ep-preview-box').style.display  = 'none';
        $('ep-progress-box').style.display = 'none';
        btnClear.style.display = 'none';
        isStopped = false; isPaused = false;
        setStatus('');
      }
      btnClear.addEventListener('click', reset);

      /* Generate */
      btnGen.addEventListener('click', async () => {
        const rawSel = $('ep-target').value.trim() || '.banner';
        const sel    = /^[.#]/.test(rawSel) ? rawSel : '.' + rawSel;
        const name   = $('ep-name').value.trim() || 'Project';
        const format = $('ep-format').value;
        const scale  = Math.min(32, Math.max(0.1, parseFloat(scaleEl.value) || 2));
        const isPdf  = format === 'pdf' || format === 'cmyk-pdf';

        const els = document.querySelectorAll(sel);
        if (!els.length) { showToast('No targets found', 'error'); return; }

        reset();
        btnGen.style.display   = 'none';
        btnPause.style.display = 'inline-flex';
        btnStop.style.display  = 'inline-flex';
        $('ep-preview-box').style.display  = 'block';
        $('ep-progress-box').style.display = 'block';
        setStatus('Initializing…');

        if (isPdf) { try { await ensureJsPDF(); } catch { showToast('Could not load jsPDF', 'error'); } }

        for (let i = 0; i < els.length; i++) {
          if (isStopped) break;
          while (isPaused) { await new Promise(r => setTimeout(r, 200)); if (isStopped) break; }
          if (isStopped) break;

          try {
            if (!window.htmlToImage) { showToast('html-to-image not loaded', 'error'); break; }

            const { dataUrl, blob, outW, outH } = await captureElement(
              els[i], scale, format,
              msg => setStatus(`Item ${i+1}/${els.length}: ${msg}`)
            );

            const ext  = isPdf ? 'pdf'
                       : format === 'jpeg' || format === 'cmyk-jpeg' ? 'jpg'
                       : format === 'svg' ? 'svg' : format;
            const file = `${name}-${String(i+1).padStart(2,'0')}@${scale}x.${ext}`;

            let blobUrl = null, sizeCell = '';
            if (isPdf) {
              await savePdf(dataUrl, outW, outH, file, format === 'cmyk-pdf');
              sizeCell = `<span style="color:#8b5cf6;font-weight:600">PDF saved ↓</span>`;
            } else {
              blobUrl    = dataUrl.startsWith('blob:') ? dataUrl : URL.createObjectURL(blob);
              totalSize += blob.size;
              sizeCell   = `<span style="color:#3b82f6;font-weight:600">${formatBytes(blob.size)}</span>`;
            }
            generatedData.push({ fileName: file, blob, url: blobUrl, dataUrl });

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${i+1}</td>
              <td><div class="ep-name-cell" title="${file}">${truncateFileName(file)}</div></td>
              <td><span style="color:#555;font-size:11px">${outW}×${outH}</span></td>
              <td>${sizeCell}</td>
              <td style="text-align:right">
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  ${!isPdf ? `<button class="ep-row-btn" data-i="${i}" data-a="p"><i class="fa-solid fa-eye"></i></button>` : ''}
                  ${!isPdf ? `<button class="ep-row-btn" data-i="${i}" data-a="d"><i class="fa-solid fa-download"></i> Save</button>` : `<span style="color:#555;font-size:11px;padding:6px">saved ✓</span>`}
                </div>
              </td>`;

            tr.querySelectorAll('[data-a]').forEach(btn => {
              btn.addEventListener('click', () => {
                const item = generatedData[btn.dataset.i];
                if (btn.dataset.a === 'p') {
                  $('ep-modal-img').src         = item.dataUrl || item.url;
                  $('ep-modal-title').innerText = item.fileName;
                  $('ep-modal-ov').style.display = 'flex';
                } else {
                  const a = document.createElement('a');
                  a.href = item.url || item.dataUrl; a.download = item.fileName; a.click();
                  showToast('Saved: ' + item.fileName);
                }
              });
            });
            tbody.appendChild(tr);

            const pct = Math.round(((i+1)/els.length)*100);
            pFill.style.width = pct+'%'; pBadge.style.left = pct+'%'; pBadge.innerText = pct+'%';
            counter.innerText = `(${i+1}/${els.length})`;
            if (!isPdf) btnZip.querySelector('span').innerText = `Download All (ZIP) — ${formatBytes(totalSize)}`;

          } catch (err) {
            console.error('[Exporter Pro] Capture error:', err);
            showToast('Error on item ' + (i+1), 'error');
            setStatus(`Error on item ${i+1}. See DevTools console.`);
          }
        }

        btnPause.style.display = 'none'; btnStop.style.display = 'none';
        btnGen.style.display   = 'inline-flex'; btnClear.style.display = 'inline-flex';
        if (isStopped) { setStatus('Stopped.'); showToast('Process stopped'); }
        else { setStatus(`Done! ${generatedData.length} file(s) ready.`); showToast('Export Complete! ✅'); }
      });

      btnPause.addEventListener('click', () => {
        isPaused = !isPaused;
        btnPause.innerHTML = isPaused ? '<i class="fa-solid fa-play"></i> Resume' : '<i class="fa-solid fa-pause"></i> Pause';
        btnPause.style.background = isPaused ? '#22c55e' : '#f59e0b';
        setStatus(isPaused ? 'Paused.' : 'Resuming…');
      });
      btnStop.addEventListener('click', () => { isStopped = true; });

      btnZip.addEventListener('click', async () => {
        const items = generatedData.filter(d => d.blob);
        if (!items.length) { showToast('No files to ZIP', 'error'); return; }
        if (!window.JSZip)  { showToast('JSZip not loaded', 'error'); return; }
        btnZip.disabled = true;
        const orig = btnZip.innerHTML;
        btnZip.innerHTML = '<i class="fa-solid fa-spinner ep-spin"></i> Creating ZIP…';
        try {
          const zip = new JSZip();
          items.forEach(d => zip.file(d.fileName, d.blob));
          const zblob = await zip.generateAsync({ type: 'blob' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(zblob);
          a.download = ($('ep-name').value || 'Project') + '.zip';
          a.click(); URL.revokeObjectURL(a.href);
          showToast('ZIP downloaded!');
        } catch { showToast('ZIP failed', 'error'); }
        btnZip.disabled = false; btnZip.innerHTML = orig;
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
    console.error('[Project Exporter] Fatal error – isolated from main project.', err);
  }

})();
