'use strict';

const express = require('express');
const path    = require('path');
const fetch   = require('node-fetch');

const app  = express();
const PORT = 3100;

/* ── 정적 파일 서빙 ─────────────────────────────── */
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ── 번역 프록시 API ─────────────────────────────
   프론트엔드가 직접 Google API를 호출하면 CORS 오류가 생길 수 있으므로
   서버를 통해 프록시합니다. (캐싱 포함)
──────────────────────────────────────────────── */
const translateCache = new Map();

app.get('/api/translate', async (req, res) => {
  const { text, sl, tl } = req.query;

  if (!text || !sl || !tl) {
    return res.status(400).json({ error: 'text, sl, tl 파라미터가 필요합니다' });
  }

  if (sl === tl) {
    return res.json({ result: text });
  }

  const cacheKey = `${sl}|${tl}|${text.trim()}`;
  if (translateCache.has(cacheKey)) {
    return res.json({ result: translateCache.get(cacheKey) });
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text.trim())}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Google Translate 응답 오류: ${response.status}`);
    }

    const data   = await response.json();
    const result = data[0].map(seg => seg[0]).join('');

    translateCache.set(cacheKey, result);
    res.json({ result });

  } catch (err) {
    console.error('[번역 오류]', err.message);
    res.status(500).json({ error: '번역 서버 오류', detail: err.message });
  }
});

/* ── 헬스 체크 ──────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    cacheSize: translateCache.size,
    time: new Date().toISOString()
  });
});

/* ── SPA 폴백 (모든 경로 → index.html) ─────────── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ── 서버 시작 ──────────────────────────────────── */
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║    🌐  LinguaLive Server Started!    ║');
  console.log(`  ║    👉  http://localhost:${PORT}        ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  [API]  GET /api/translate?text=...&sl=en&tl=es');
  console.log('  [API]  GET /api/health');
  console.log('');
  console.log('  종료하려면 Ctrl+C 를 누르거나 종료.bat 실행');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n  👋 LinguaLive 서버 종료됩니다...');
  process.exit(0);
});
