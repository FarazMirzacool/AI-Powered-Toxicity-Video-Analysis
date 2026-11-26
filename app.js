/* ---------- DOM refs ---------- */
const views = {
  landing:   document.getElementById('landing'),
  analyzing: document.getElementById('analyzing'),
  results:   document.getElementById('results')
};
const dropzone     = document.getElementById('dropzone');
const fileInput    = document.getElementById('fileInput');
const progressFill = document.getElementById('progressFill');
const stageText    = document.getElementById('stageText');
const stageList    = document.getElementById('stageList');

const API_BASE = 'http://localhost:5000';

let currentReport   = null;
let currentVideoURL = null;

/* ---------- View switcher ---------- */
function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Error banner (replaces alert) ---------- */
function showError(msg) {
  let bar = document.getElementById('errorBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'errorBar';
    bar.style.cssText = `
      position:fixed;top:70px;left:50%;transform:translateX(-50%);
      background:#ff4d4f;color:#fff;padding:12px 20px;border-radius:10px;
      font-size:14px;font-weight:600;z-index:999;box-shadow:0 6px 24px rgba(0,0,0,.4);
      max-width:90vw;
    `;
    document.body.appendChild(bar);
  }
  bar.textContent = msg;
  clearTimeout(bar._t);
  bar._t = setTimeout(() => bar.remove(), 6000);
}

/* ---------- Staged progress (client-side visual only) ---------- */
const STAGES = [
  'Extracting audio track…',
  'Transcribing speech…',
  'Scanning transcript for toxic language…',
  'Analyzing audio tone…',
  'Inspecting visual frames…',
  'Mapping to platform policies…'
];

function startStageAnimation() {
  stageList.innerHTML = STAGES.map(s => `<li>${s}</li>`).join('');
  progressFill.style.width = '5%';
  const items = [...stageList.children];
  let i = 0;
  const interval = setInterval(() => {
    if (i >= STAGES.length) return;
    stageText.textContent = STAGES[i];
    items.forEach((li, idx) => {
      li.classList.toggle('active', idx === i);
      li.classList.toggle('done', idx < i);
    });
    progressFill.style.width = Math.round(((i + 1) / STAGES.length) * 95) + '%';
    i++;
  }, 900);
  return () => {           // stop function
    clearInterval(interval);
    items.forEach(li => { li.classList.remove('active'); li.classList.add('done'); });
    progressFill.style.width = '100%';
  };
}

/* ---------- Upload handling ---------- */
dropzone.addEventListener('click', () => fileInput.click());
['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('dragover'); })
);
['dragleave', 'drop'].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('dragover'); })
);
dropzone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) handleFile(file);
});
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

function getSelectedPlatforms() {
  return [...document.querySelectorAll('.chk input:checked')].map(i => i.dataset.platform);
}

/* ---------- REAL analysis via Flask backend ---------- */
async function handleFile(file) {
  if (!file.type.startsWith('video/')) {
    showError('Please choose a video file.');
    return;
  }
  if (currentVideoURL) URL.revokeObjectURL(currentVideoURL);
  currentVideoURL = URL.createObjectURL(file);

  showView('analyzing');
  const stopStages = startStageAnimation();

  const platforms = getSelectedPlatforms();
  if (platforms.length === 0) {
    showError('Select at least one platform.');
    stopStages();
    showView('landing');
    return;
  }

  const formData = new FormData();
  formData.append('video', file);
  platforms.forEach(p => formData.append('platforms[]', p));

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j.error) detail = j.error;
      } catch (_) {}
      throw new Error(detail);
    }

    const report = await res.json();
    stopStages();
    await sleep(400);

    currentReport = report;
    renderResults(currentVideoURL, report, file.name);
    showView('results');
  } catch (err) {
    stopStages();
    console.error(err);
    showError('Analysis failed: ' + err.message + ' — is the backend running on :5000?');
    showView('landing');
  }
}

/* ---------- Sample cards (fallback, still simulated) ---------- */
const SAMPLES = [
  { id: 's1', title: 'Clean Cooking Tutorial', duration: 45, hint: 'A wholesome demo — should pass.' },
  { id: 's2', title: 'Rant Vlog (uncut)',      duration: 62, hint: 'A few spicy words slip through.' },
  { id: 's3', title: 'Debate Clip (heated)',   duration: 78, hint: 'Boundary-pushing speech, likely flagged.' }
];

function renderSamples() {
  const grid = document.getElementById('sampleGrid');
  grid.innerHTML = '';
  SAMPLES.forEach(s => {
    const report = analyzeVideo(null, s.duration, {
      platforms: ['youtube', 'tiktok', 'instagram', 'x']
    });
    const badgeClass = report.overall === 'low' ? 'badge-safe'
                    : report.overall === 'medium' ? 'badge-warn' : 'badge-risk';
    const badgeText  = report.overall === 'low' ? 'Likely Safe'
                    : report.overall === 'medium' ? 'Review Needed' : 'High Risk';

    const card = document.createElement('div');
    card.className = 'sample-card';
    card.innerHTML = `
      <h4>${s.title}</h4>
      <p>${s.hint}</p>
      <span class="sample-badge ${badgeClass}">${badgeText}</span>
    `;
    card.addEventListener('click', () => {
      currentReport = report;
      showView('analyzing');
      const stop = startStageAnimation();
      setTimeout(() => {
        stop();
        renderResults(null, report, s.title);
        showView('results');
      }, 2400);
    });
    grid.appendChild(card);
  });
}

/* ---------- Results rendering ---------- */
function renderResults(videoURL, report, title) {
  // Verdict
  const badge   = document.getElementById('verdictBadge');
  const vTitle  = document.getElementById('verdictTitle');
  const vSub    = document.getElementById('verdictSub');
  const scoreNu = document.getElementById('scoreNum');

  const map = {
    low:    { cls: 'safe', sym: '✓', title: 'Likely Safe to Post',
              sub: 'No major policy risks detected.' },
    medium: { cls: 'warn', sym: '!', title: 'Review Recommended',
              sub: 'Some segments may be flagged on stricter platforms.' },
    high:   { cls: 'risk', sym: '✕', title: 'High Risk',
              sub: 'Multiple segments likely violate platform policies.' }
  };
  const v = map[report.overall] || map.low;
  badge.className = 'verdict-badge ' + v.cls;
  badge.textContent = v.sym;
  vTitle.textContent = v.title;
  vSub.textContent = v.sub;
  scoreNu.textContent = report.score;

  // Platform badges
  const pfRow = document.getElementById('platformRow');
  pfRow.innerHTML = (report.platformVerdicts || []).map(p => {
    const label = p.status === 'ok' ? 'OK' : p.status === 'warn' ? 'Caution' : 'Risky';
    return `<div class="pf-badge"><span class="pf-dot ${p.status}"></span>${p.label} · ${label}</div>`;
  }).join('');

  // Video
  const video = document.getElementById('video');
  if (videoURL) {
    video.src = videoURL;
    video.controls = true;
  } else {
    video.removeAttribute('src');
    video.load();
    video.controls = false;
  }
  document.getElementById('durLabel').textContent = fmt(report.duration || 0);

  // Heatmap
  const heatmap = document.getElementById('heatmap');
  const markers = document.getElementById('markers');
  markers.innerHTML = '';
  const heat = report.heat || [];
  const bins = heat.length || 1;
  heat.forEach((val, i) => {
    if (val < 0.15) return;
    const seg = document.createElement('div');
    seg.className = 'marker';
    seg.style.left = (i / bins) * 100 + '%';
    seg.style.width = (1 / bins) * 100 + '%';
    seg.style.background = heatColor(val);
    markers.appendChild(seg);
  });

  // Playhead
  const playhead = document.getElementById('playhead');
  heatmap.onclick = (e) => {
    const rect = heatmap.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = ratio * (report.duration || 0);
    if (videoURL && video.duration) { video.currentTime = t; video.play(); }
    playhead.style.left = ratio * 100 + '%';
  };
  if (videoURL) {
    video.ontimeupdate = () => {
      if (video.duration) playhead.style.left = (video.currentTime / video.duration) * 100 + '%';
    };
  } else {
    playhead.style.left = '0%';
  }

  // Flags
  const flagsList = document.getElementById('flagsList');
  document.getElementById('flagCount').textContent = (report.flags || []).length;
  if (!report.flags || !report.flags.length) {
    flagsList.innerHTML = '<p style="color:var(--muted);font-size:13px;">No toxic segments detected. 🎉</p>';
  } else {
    flagsList.innerHTML = report.flags.map(f => `
      <div class="flag sev-${f.severity}" data-start="${f.start}">
        <div class="flag-top">
          <span class="flag-cat" style="color:${f.color || '#ff4d4f'}">${f.categoryLabel}</span>
          <span>${fmt(f.start)} – ${fmt(f.end)}</span>
        </div>
        <div class="flag-quote">${escapeHtml(f.quote)}</div>
        <div class="flag-conf">Confidence: ${Math.round(f.confidence * 100)}%</div>
      </div>
    `).join('');

    flagsList.querySelectorAll('.flag').forEach(el => {
      el.addEventListener('click', () => {
        const t = parseFloat(el.dataset.start);
        if (videoURL && video.duration) { video.currentTime = t; video.play(); }
        playhead.style.left = (t / report.duration) * 100 + '%';
      });
    });
  }

  // Recommendations
  const recsList = document.getElementById('recsList');
  recsList.innerHTML = (report.recommendations || [])
    .map(r => `<li>${escapeHtml(r)}</li>`).join('');
}

function heatColor(v) {
  if (v < 0.4) return `rgba(46,204,113,${0.3 + v})`;
  if (v < 0.7) return `rgba(245,166,35,${0.4 + v * 0.5})`;
  return `rgba(255,77,79,${0.55 + v * 0.4})`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------- Export report ---------- */
document.getElementById('exportBtn').addEventListener('click', () => {
  if (!currentReport) return;
  const r = currentReport;
  const lines = [
    'ToxGuard — Toxicity Analysis Report',
    '===================================',
    `Generated: ${new Date(r.analyzedAt || Date.now()).toLocaleString()}`,
    `Overall verdict: ${String(r.overall).toUpperCase()}`,
    `Toxicity score: ${r.score}/100`,
    '',
    'Platform results:',
    ...(r.platformVerdicts || []).map(p => `  - ${p.label}: ${p.status}`),
    '',
    `Flagged segments (${(r.flags || []).length}):`,
    ...(r.flags || []).map(f =>
      `  - [${fmt(f.start)} – ${fmt(f.end)}] ${f.categoryLabel} ` +
      `(${Math.round(f.confidence * 100)}%) :: ${f.quote}`
    ),
    '',
    'Recommended fixes:',
    ...(r.recommendations || []).map(x => `  - ${x}`),
    '',
    'NOTE: Advisory only. Results are produced by a local Whisper + toxic-bert pipeline.'
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'toxguard-report.txt';
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ---------- Back button ---------- */
document.getElementById('backBtn').addEventListener('click', () => showView('landing'));

/* ---------- Utilities ---------- */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------- Init ---------- */
renderSamples();