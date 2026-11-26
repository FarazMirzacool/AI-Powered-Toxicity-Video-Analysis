/**
 * Simulated AI analyzer.
 * Replace `analyzeVideo()` with a real API call later.
 * Returns a report object shaped exactly like what the UI expects.
 */

const TOXICITY_CATEGORIES = [
  { key: 'hate',        label: 'Hate Speech',   color: '#ff4d4f' },
  { key: 'harassment',  label: 'Harassment',    color: '#ff8c42' },
  { key: 'profanity',   label: 'Profanity',     color: '#f5a623' },
  { key: 'threat',      label: 'Threat',        color: '#ff2d55' },
  { key: 'violence',    label: 'Violence',      color: '#c0392b' },
  { key: 'sexual',      label: 'Sexual Content',color: '#9b59b6' },
  { key: 'selfharm',    label: 'Self-Harm',     color: '#e74c3c' }
];

const PLATFORM_RULES = {
  youtube:   { strictness: 1.0, label: 'YouTube'   },
  tiktok:    { strictness: 1.25, label: 'TikTok'   },
  instagram: { strictness: 1.15, label: 'Instagram' },
  x:         { strictness: 0.8,  label: 'X'        }
};

const SAMPLE_QUOTES = {
  hate:        ['"those people ruin everything"', '"they don\'t belong here"'],
  harassment:  ['"you\'re pathetic, everyone knows it"', '"keep talking, nobody likes you"'],
  profanity:   ['"this is f***ing ridiculous"', '"what the hell is wrong with you"'],
  threat:      ['"I\'ll make you regret that"', '"watch your back"'],
  violence:    ['[graphic depiction of a fight]', '[weapon shown on screen]'],
  sexual:      ['[suggestive scene]', '[explicit language]'],
  selfharm:    ['"I don\'t want to be here anymore"', '[reference to self-harm]']
};

/**
 * @param {HTMLVideoElement|null} videoEl - pass null for sample data
 * @param {number} duration - seconds
 * @param {object} options - { platforms: ['youtube', ...] }
 * @returns {object} report
 */
function analyzeVideo(videoEl, duration, options = {}) {
  const platforms = options.platforms || Object.keys(PLATFORM_RULES);
  const seed = duration ? Math.floor(duration * 1000) % 99991 : Math.floor(Math.random() * 99991);
  const rand = mulberry32(seed);

  // Decide overall risk level
  const roll = rand();
  let riskLevel;
  if (roll < 0.4)      riskLevel = 'low';
  else if (roll < 0.75) riskLevel = 'medium';
  else                  riskLevel = 'high';

  const flagCount = riskLevel === 'low' ? Math.floor(rand() * 2)
                  : riskLevel === 'medium' ? 2 + Math.floor(rand() * 3)
                  : 4 + Math.floor(rand() * 4);

  const flags = [];
  const usedTimes = [];
  for (let i = 0; i < flagCount; i++) {
    const cat = TOXICITY_CATEGORIES[Math.floor(rand() * TOXICITY_CATEGORIES.length)];
    let start;
    let tries = 0;
    do {
      start = rand() * Math.max(duration - 6, 5);
      tries++;
    } while (usedTimes.some(t => Math.abs(t - start) < 4) && tries < 20);
    usedTimes.push(start);

    const segLen = 3 + rand() * 4;
    const end = Math.min(start + segLen, duration);
    const confidence = 0.62 + rand() * 0.36;
    const severity = confidence > 0.85 ? 'high' : confidence > 0.72 ? 'medium' : 'low';
    const quotes = SAMPLE_QUOTES[cat.key] || ['[flagged content]'];

    flags.push({
      id: 'f' + i,
      start: +start.toFixed(2),
      end: +end.toFixed(2),
      category: cat.key,
      categoryLabel: cat.label,
      color: cat.color,
      quote: quotes[Math.floor(rand() * quotes.length)],
      confidence: +confidence.toFixed(2),
      severity
    });
  }
  flags.sort((a, b) => a.start - b.start);

  // Continuous heatmap (0..1) sampled over ~120 bins
  const BINS = 120;
  const heat = new Array(BINS).fill(0);
  flags.forEach(f => {
    const b0 = Math.floor((f.start / duration) * BINS);
    const b1 = Math.ceil((f.end / duration) * BINS);
    for (let b = b0; b <= b1 && b < BINS; b++) {
      const dist = Math.min(Math.abs(b - b0), Math.abs(b1 - b));
      heat[b] = Math.min(1, Math.max(heat[b], 0.4 + 0.6 * f.confidence - dist * 0.03));
    }
  });

  // Overall score (0-100)
  const score = Math.min(100, Math.round(
    flags.reduce((s, f) => s + f.confidence * (f.severity === 'high' ? 30 : f.severity === 'medium' ? 20 : 12), 0)
  ));

  // Per-platform verdicts
  const platformVerdicts = platforms.map(p => {
    const rule = PLATFORM_RULES[p];
    const threshold = 55 / rule.strictness;
    let status;
    if (score < threshold * 0.5) status = 'ok';
    else if (score < threshold) status = 'warn';
    else status = 'risk';
    return { platform: p, label: rule.label, status };
  });

  // Recommendations
  const recs = [];
  flags.slice(0, 4).forEach(f => {
    const ts = fmt(f.start);
    if (f.category === 'profanity') recs.push(`Mute or bleep audio at ${ts}.`);
    else if (f.category === 'violence' || f.category === 'sexual') recs.push(`Blur or cut the visual segment at ${ts}.`);
    else if (f.category === 'selfharm') recs.push(`Add a content warning and consider removing ${ts}.`);
    else recs.push(`Remove or rephrase the flagged phrase at ${ts}.`);
  });
  if (!recs.length) recs.push('No fixes required — your video looks clean.');

  const overall = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';

  return {
    score,
    overall,
    duration,
    flags,
    heat,
    heatBins: BINS,
    platformVerdicts,
    recommendations: recs,
    analyzedAt: new Date().toISOString()
  };
}

/* deterministic PRNG so sample results are stable */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

window.ToxicityAnalyzer = { analyzeVideo, TOXICITY_CATEGORIES, PLATFORM_RULES, fmt };
