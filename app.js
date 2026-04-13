'use strict';

/* ─── Language Config ──────────────────────────────── */
const LANGUAGES = [
  { code:'ko', name:'한국어',  speech:'ko-KR', flag:'🇰🇷' },
  { code:'en', name:'English', speech:'en-US', flag:'🇺🇸' },
  { code:'es', name:'Español', speech:'es-ES', flag:'🇪🇸' },
  { code:'ja', name:'日本語',  speech:'ja-JP', flag:'🇯🇵' },
];

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'may','might','must','can','to','of','in','on','at','for','with',
  'by','from','up','about','into','through','before','after','and',
  'but','or','so','if','as','not','no','nor','very','just','also',
  'i','me','my','we','our','you','your','he','him','she','her','it','its',
  'they','them','what','who','this','that','these','those','more','than',
  'get','go','got','went','come','came','one','two','three',
]);

/* ─── Audio Visualizer ─────────────────────────────── */
class AudioVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.analyser = null;
    this.dataArr  = null;
    this.animId   = null;
    this.listening = false;
    this.phase     = 0;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._loop();
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = r.width  * dpr;
    this.canvas.height = r.height * dpr;
    this.W = r.width;
    this.H = r.height;
    this.ctx.scale(dpr, dpr);
  }

  connectStream(stream) {
    try {
      const actx   = new (window.AudioContext || window.webkitAudioContext)();
      const src    = actx.createMediaStreamSource(stream);
      this.analyser = actx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      src.connect(this.analyser);
      this.dataArr = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) {
      console.warn('Visualizer stream error:', e);
    }
  }

  _loop() {
    this.animId = requestAnimationFrame(() => this._loop());
    this._draw();
  }

  _draw() {
    const { ctx, W, H } = this;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    const N   = 55;
    const gap  = 3;
    const bw   = (W - gap * (N - 1)) / N;
    const cy   = H / 2;
    this.phase += this.listening ? 0.05 : 0.012;

    if (this.analyser && this.listening) {
      this.analyser.getByteFrequencyData(this.dataArr);
    }

    for (let i = 0; i < N; i++) {
      let amp;
      if (this.analyser && this.listening) {
        const idx = Math.floor((i / N) * this.dataArr.length * 0.7);
        amp = this.dataArr[idx] / 255;
      } else {
        amp = (Math.sin(i * 0.22 + this.phase) + 1) / 2 * 0.1 + 0.025;
      }

      const bh   = Math.max(3, amp * H * 0.82);
      const x    = i * (bw + gap);
      const y    = cy - bh / 2;
      const t    = i / N;
      const r    = Math.round(99  + (168 - 99)  * t);
      const g    = Math.round(102 + (85  - 102) * t);
      const b    = Math.round(241 + (247 - 241) * t);
      const a    = this.listening ? 0.65 + amp * 0.35 : 0.22;

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      this._rr(ctx, x, y, bw, bh, bw / 2);
      ctx.fill();

      // Reflection
      ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.12})`;
      this._rr(ctx, x, y + bh + 2, bw, bh * 0.25, bw / 2);
      ctx.fill();
    }
  }

  _rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/* ─── Translation Service ──────────────────────────── */
class TranslationService {
  constructor() {
    this._cache = new Map();
  }

  async translate(text, from, to) {
    if (!text || !text.trim() || from === to) return text;
    const key = `${from}|${to}|${text.trim()}`;
    if (this._cache.has(key)) return this._cache.get(key);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text.trim())}`;
      const res  = await fetch(url);
      const data = await res.json();
      // 구글 번역 응답: data[0] = [[번역문, 원문, ...], ...]
      const result = data[0].map(seg => seg[0]).join('');
      this._cache.set(key, result);
      return result;
    } catch (e) {
      console.error('Translation error:', e);
      throw e;
    }
  }

  async translateWord(word, from, to) {
    return this.translate(word, from, to);
  }
}

/* ─── Vocabulary Manager ───────────────────────────── */
class VocabManager {
  constructor() {
    this._key   = 'lingualive_vocab_v2';
    this._items = this._load();
  }
  _load() {
    try { return JSON.parse(localStorage.getItem(this._key)) || []; }
    catch { return []; }
  }
  _save() { localStorage.setItem(this._key, JSON.stringify(this._items)); }

  add(srcWord, srcLang, tgtWord, tgtLang) {
    if (this._items.find(i => i.srcWord === srcWord && i.srcLang === srcLang)) return false;
    this._items.unshift({ id: Date.now().toString(36), srcWord, srcLang, tgtWord, tgtLang, savedAt: Date.now() });
    this._save();
    return true;
  }
  remove(id) { this._items = this._items.filter(i => i.id !== id); this._save(); }
  getAll()   { return [...this._items]; }
  count()    { return this._items.length; }
  clear()    { this._items = []; this._save(); }
}

/* ─── Main App ─────────────────────────────────────── */
class LinguaLiveApp {
  constructor() {
    this.srcLang      = 'en';  // 원어민이 말하는 언어 (영어)
    this.tgtLang      = 'es';  // 번역 언어 (스페인어)
    this.replyInLang  = 'es';  // 내가 입력하는 언어 (스페인어)
    this.replyOutLang = 'en';  // 답변할 언어 (영어)
    this.listening   = false;

    this.recognition = null;
    this.origText    = '';
    this.transText   = '';
    this.history     = [];
    this.keywords    = [];

    this.viz    = new AudioVisualizer(document.getElementById('vizCanvas'));
    this.trans  = new TranslationService();
    this.vocab  = new VocabManager();

    this._buildSelectors();
    this._bindEvents();
    this._renderVocab();
    this._updatePanelHeaders();
    this._checkSupport();
    this._initMic(); // 앱 시작 시 마이크 권한 미리 획득 (이후 팝업 안 뜸)
  }

  // 앱 로딩 시 마이크 권한을 미리 요청해두어 이후 팝업 없이 바로 사용
  async _initMic() {
    if (this._micStream) return;
    try {
      this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.viz.connectStream(this._micStream);
    } catch (e) {
      // 사용자가 거부하면 조용히 무시 (버튼 클릭 시 다시 안내)
      console.warn('마이크 사전 권한 획득 실패:', e);
    }
  }

  _checkSupport() {
    const ok = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!ok) {
      this._setStatus('⚠️ Chrome requerido');
      document.getElementById('micBtn').disabled = true;
    } else {
      this._setStatus('Presiona para iniciar');
    }
  }

  _buildSelectors() {
    ['sourceLang', 'targetLang'].forEach((id, i) => {
      const sel = document.getElementById(id);
      LANGUAGES.forEach(l => sel.add(new Option(`${l.flag} ${l.name}`, l.code)));
      sel.value = i === 0 ? this.srcLang : this.tgtLang;
    });
    // Reply 패널 독립 언어 드롭다운
    ['replyInputLang', 'replyOutputLang'].forEach((id, i) => {
      const sel = document.getElementById(id);
      LANGUAGES.forEach(l => sel.add(new Option(`${l.flag} ${l.name}`, l.code)));
      sel.value = i === 0 ? this.replyInLang : this.replyOutLang;
    });
    this._updateReplyFlags();
    this._updatePanelHeaders();
  }

  _bindEvents() {
    // Mic
    document.getElementById('micBtn').addEventListener('click', () => this._toggleListen());

    // Language selectors
    document.getElementById('sourceLang').addEventListener('change', e => {
      this.srcLang = e.target.value;
      this._updatePanelHeaders();
      if (this.listening) this._restartRecognition();
    });
    document.getElementById('targetLang').addEventListener('change', e => {
      this.tgtLang = e.target.value;
      this._updatePanelHeaders();
    });

    // Swap (STT 언어 패널)
    document.getElementById('swapLang').addEventListener('click', () => {
      [this.srcLang, this.tgtLang] = [this.tgtLang, this.srcLang];
      document.getElementById('sourceLang').value = this.srcLang;
      document.getElementById('targetLang').value = this.tgtLang;
      this._updatePanelHeaders();
      if (this.listening) this._restartRecognition();
    });

    // Reply 패널 독립 언어 선택
    document.getElementById('replyInputLang').addEventListener('change', e => {
      this.replyInLang = e.target.value;
      this._updateReplyFlags();
      // 입력 텍스트가 있으면 즉시 재번역
      const txt = document.getElementById('replyInput').value.trim();
      if (txt) this._translateReply(txt);
    });
    document.getElementById('replyOutputLang').addEventListener('change', e => {
      this.replyOutLang = e.target.value;
      this._updateReplyFlags();
      const txt = document.getElementById('replyInput').value.trim();
      if (txt) this._translateReply(txt);
    });



    // TTS
    document.getElementById('speakOrigBtn').addEventListener('click', e => this._speak(this.origText, this.srcLang, e.currentTarget));
    document.getElementById('speakTransBtn').addEventListener('click', e => this._speak(this.transText, this.tgtLang, e.currentTarget));

    // Copy
    document.getElementById('copyOrigBtn').addEventListener('click', () => this._copy(this.origText));
    document.getElementById('copyTransBtn').addEventListener('click', () => this._copy(this.transText));

    // Clear session
    document.getElementById('clearSessionBtn').addEventListener('click', () => this._clearSession());


    // Save script
    document.getElementById('saveScriptBtn').addEventListener('click', () => this._saveScript());

    // Meeting button
    document.getElementById('meetingBtn').addEventListener('click', () => this._toggleMeeting());

    // Summary download button
    document.getElementById('summaryBtn').addEventListener('click', () => this._downloadBilingualSummary());



    // Reply input: 스페인어 타이핑 → 영어 번역 (debounce 600ms)
    const replyInput = document.getElementById('replyInput');
    replyInput.addEventListener('input', () => {
      clearTimeout(this._replyDebounce);
      const txt = replyInput.value.trim();
      if (!txt) {
        document.getElementById('replyOutputText').innerHTML =
          '<span class="placeholder">오른쪽에 스페인어를 입력하면 영어 번역이 여기에 표시됩니다...</span>';
        this._replyText = '';
        return;
      }
      this._replyDebounce = setTimeout(() => this._translateReply(txt), 600);
    });

    document.getElementById('clearReplyBtn').addEventListener('click', () => {
      document.getElementById('replyInput').value = '';
      document.getElementById('replyOutputText').innerHTML =
        '<span class="placeholder">오른쪽에 스페인어를 입력하면 영어 번역이 여기에 표시됩니다...</span>';
      this._replyText = '';
    });

    document.getElementById('speakReplyBtn').addEventListener('click', e =>
      this._speak(this._replyText, this.srcLang, e.currentTarget));

    document.getElementById('copyReplyBtn').addEventListener('click', () =>
      this._copy(this._replyText));

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
        document.getElementById(btn.dataset.panel).hidden = false;
      });
    });
  }

  /* ── Recognition ─────────────────────────── */
  async _toggleListen() {
    if (this.listening) {
      this._stopListen();
    } else {
      await this._startListen();
    }
  }

  async _startListen() {
    // 마이크 권한을 딱 한 번만 요청
    if (!this._micStream) {
      try {
        this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.viz.connectStream(this._micStream);
      } catch (e) {
        this._setStatus('⚠️ 마이크 권한이 필요합니다. 허용 버튼을 눌러주세요.', 'error');
        this._showToast('⚠️ 마이크 권한을 허용해 주세요', 'error');
        return;
      }
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    this.recognition = new SR();
    const langObj = LANGUAGES.find(l => l.code === this.srcLang) || LANGUAGES[0];
    this.recognition.lang = langObj.speech;
    this.recognition.continuous     = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.listening = true;
      this.viz.listening = true;
      document.body.classList.add('listening');
      document.getElementById('micIcon').textContent = '⏹️';
      this._setStatus('🔴 듣는 중... 말씀해 주세요');
    };

    this.recognition.onresult = (e) => {
      let interim = '';
      let finalTxt = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalTxt += result[0].transcript;
          const conf = Math.round(result[0].confidence * 100);
          if (conf > 0) this._showConfidence(conf);
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        document.getElementById('interimText').textContent = interim;
      }

      if (finalTxt) {
        document.getElementById('interimText').textContent = '';
        const sentence = finalTxt.trim();
        this.origText += (this.origText ? '\n' : '') + sentence;
        this._setOrigText(this.origText);
        // 새 문장만 번역 (누적 재번역 제거 → API 사용량 80~90% 절감)
        this._doTranslate(sentence);
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error === 'no-speech') return;
      this._setStatus(`⚠️ Error: ${e.error}`, 'error');
    };

    this.recognition.onend = () => {
      if (this.listening) {
        // Auto-restart for continuous listening
        try { this.recognition.start(); } catch (_) {}
      }
    };

    try {
      this.recognition.start();
    } catch (e) {
      this._setStatus('⚠️ Se necesita permiso de micrófono', 'error');
    }
  }

  _stopListen() {
    this.listening = false;
    this.viz.listening = false;
    document.body.classList.remove('listening');
    document.getElementById('micIcon').textContent = '🎙️';
    this._setStatus('Presiona para iniciar');
    document.getElementById('interimText').textContent = '';
    if (this.recognition) {
      try { this.recognition.stop(); } catch (_) {}
    }
  }

  _restartRecognition() {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (_) {}
    }
    setTimeout(() => this._startListen(), 300);
  }

  /* ── Translation ─────────────────────────── */
  async _translateReply(text) {
    const loader = document.getElementById('replyLoader');
    const output = document.getElementById('replyOutputText');
    loader.hidden = false;
    output.innerHTML = '';
    try {
      // 독립 언어 설정으로 번역 (replyInLang → replyOutLang)
      const result = await this.trans.translate(text, this.replyInLang, this.replyOutLang);
      this._replyText = result;
      output.textContent = result;
      // 미팅 중이면 로그 기록
      if (this._meetingActive) {
        this._meetingLog.push({ type: 'reply', ts: Date.now(), ko: text, es: result });
      }
    } catch (e) {
      output.innerHTML = '<span class="placeholder">Traducción fallida. Inténtelo de nuevo.</span>';
    } finally {
      loader.hidden = true;
    }
  }

  async _doTranslate(sentence) {
    const loader = document.getElementById('transLoader');
    loader.hidden = false;

    try {
      const result = await this.trans.translate(sentence, this.srcLang, this.tgtLang);
      // 누적 append 방식 (전체 교체 아님)
      this.transText += (this.transText ? '\n' : '') + result;
      const el = document.getElementById('transText');
      el.textContent = this.transText;

      this._addToHistory(sentence, result);
      await this._buildKeywords(sentence, result);
      // 미팅 중이면 로그 기록
      if (this._meetingActive) {
        this._meetingLog.push({ type: 'listen', ts: Date.now(), orig: sentence, trans: result });
      }
    } catch (e) {
      if (e.message === 'QUOTA_EXCEEDED') {
        this._showToast('⚠️ Límite de traducción superado. Inténtelo mañana.', 'error');
      } else {
        document.getElementById('transText').innerHTML +=
          '<span class="placeholder"> [Error de traducción]</span>';
      }
    } finally {
      loader.hidden = true;
    }
  }

  _setOrigText(txt) {
    document.getElementById('origText').textContent = txt;
  }

  _setTransText(txt) {
    const el = document.getElementById('transText');
    el.textContent = txt;
  }

  /* ── Keywords ────────────────────────────── */
  async _buildKeywords(origText, transText) {
    // Use translated (usually English) for word extraction if target is English
    const wordSource = this.tgtLang === 'en' ? transText : origText;
    const words = wordSource
      .toLowerCase()
      .replace(/[^a-zA-Z\uAC00-\uD7A30-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));

    const unique = [...new Set(words)].slice(0, 8);
    if (!unique.length) {
      document.getElementById('keywordsSection').hidden = true;
      return;
    }

    this.keywords = unique;
    const list = document.getElementById('keywordsList');
    list.innerHTML = '';
    document.getElementById('keywordsSection').hidden = false;

    // Translate English keywords back to source if needed
    for (const word of unique) {
      const pill = document.createElement('button');
      pill.className = 'kw-pill';

      const origWord  = this.tgtLang === 'en' ? word : word;
      let transWord = '...';

      pill.innerHTML = `<span class="kw-orig">${this._esc(origWord)}</span>
                        <span class="kw-sep">·</span>
                        <span class="kw-tran">${transWord}</span>`;
      list.appendChild(pill);

      // Check if already saved
      const saved = this.vocab.getAll().find(v =>
        v.srcWord.toLowerCase() === origWord.toLowerCase()
      );
      if (saved) pill.classList.add('saved');

      pill.addEventListener('click', () => this._saveKeyword(pill, origWord, this.tgtLang));

      // Async load translation for the keyword
      const fromL = this.tgtLang;
      const toL   = this.srcLang;
      if (fromL !== toL) {
        this.trans.translateWord(origWord, fromL, toL).then(tw => {
          pill.querySelector('.kw-tran').textContent = tw;
          pill.dataset.translated = tw;
        }).catch(() => {});
      }
    }
  }

  async _saveKeyword(pillEl, word, wordLang) {
    const translated = pillEl.dataset.translated || pillEl.querySelector('.kw-tran').textContent;
    const added = this.vocab.add(word, wordLang, translated, this.srcLang);
    if (added) {
      pillEl.classList.add('saved');
      this._showToast(`⭐ "${word}" guardado en vocabulario!`, 'success');
      this._renderVocab();
    } else {
      this._showToast('Ya está guardada esta palabra', 'info');
    }
  }

  /* ── History ─────────────────────────────── */
  _addToHistory(orig, trans) {
    this.history.unshift({ orig, trans, srcLang: this.srcLang, tgtLang: this.tgtLang, ts: Date.now() });
    this._renderHistory();
  }

  _renderHistory() {
    const list  = document.getElementById('historyList');
    const empty = document.getElementById('historyEmpty');
    const cnt   = document.getElementById('historyCnt');

    cnt.textContent = this.history.length;

    if (!this.history.length) {
      empty.hidden = false;
      list.innerHTML = '';
      return;
    }
    empty.hidden = true;
    list.innerHTML = this.history.slice(0, 20).map(h => {
      const langO = LANGUAGES.find(l => l.code === h.srcLang);
      const langT = LANGUAGES.find(l => l.code === h.tgtLang);
      const time  = new Date(h.ts).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
      return `<div class="history-item">
        <div class="history-texts">
          <div class="history-orig">${langO?.flag || ''} ${this._esc(h.orig)}</div>
          <div class="history-arrow">→</div>
          <div class="history-tran">${langT?.flag || ''} ${this._esc(h.trans)}</div>
          <div class="history-meta">${time}</div>
        </div>
        <button class="icon-btn" onclick="app._speak('${this._esc(h.trans)}','${h.tgtLang}')" title="발음 듣기">🔊</button>
      </div>`;
    }).join('');
  }

  /* ── Vocab ───────────────────────────────── */
  _renderVocab() {
    const list  = document.getElementById('vocabList');
    const empty = document.getElementById('vocabEmpty');
    const cnt   = document.getElementById('vocabCnt');
    const total = document.getElementById('wordsLearnedCount');
    const items = this.vocab.getAll();

    cnt.textContent   = items.length;
    total.textContent = items.length;

    if (!items.length) {
      empty.hidden = false;
      list.innerHTML = '';
      return;
    }
    empty.hidden = true;
    list.innerHTML = items.map(v => {
      const langO = LANGUAGES.find(l => l.code === v.srcLang);
      const langT = LANGUAGES.find(l => l.code === v.tgtLang);
      const time  = new Date(v.savedAt).toLocaleDateString('ko-KR');
      return `<div class="vocab-item" id="vi-${v.id}">
        <div class="vocab-words">
          <div class="vocab-src">${langO?.flag || ''} ${this._esc(v.srcWord)}</div>
          <div class="vocab-tgt">${langT?.flag || ''} ${this._esc(v.tgtWord)}</div>
        </div>
        <div class="vocab-time">${time}</div>
        <div class="vocab-acts">
          <button class="icon-btn" onclick="app._speak('${this._esc(v.srcWord)}','${v.srcLang}')" title="발음">🔊</button>
          <button class="icon-btn" onclick="app._removeVocab('${v.id}')" title="삭제" style="font-size:.8rem">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  _removeVocab(id) {
    this.vocab.remove(id);
    const el = document.getElementById(`vi-${id}`);
    if (el) el.remove();
    this._renderVocab();
    this._showToast('Palabra eliminada');
  }


  /* ── Meeting ─────────────────────────────── */
  _toggleMeeting() {
    this._meetingActive ? this._stopMeeting() : this._startMeeting();
  }

  async _startMeeting() {
    this._meetingActive    = true;
    this._meetingLog       = [];
    this._meetingStartTime = Date.now();

    // ① 즉시 UI 업데이트 (await 전에)
    const btn = document.getElementById('meetingBtn');
    btn.classList.add('active');
    btn.innerHTML = '⏹ Terminar reunión <span class="meeting-timer-badge">00:00</span>';

    // ② 타이머 먼저 시작
    this._meetingTimerInt = setInterval(() => {
      const s  = Math.floor((Date.now() - this._meetingStartTime) / 1000);
      const h  = Math.floor(s / 3600);
      const m  = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      const t  = h > 0 ? `${h}:${m}:${ss}` : `${m}:${ss}`;
      btn.innerHTML = `⏹ Terminar reunión <span class="meeting-timer-badge">${t}</span>`;
    }, 1000);

    // ③ 마이크 시작 (비동기)
    if (!this.listening) await this._startListen();

    this._showToast('🟢 ¡Reunión iniciada! Todo se guarda automáticamente', 'success');
  }

  _stopMeeting() {
    this._meetingActive = false;
    clearInterval(this._meetingTimerInt);

    const btn = document.getElementById('meetingBtn');
    btn.classList.remove('active');
    btn.innerHTML = '🟢 Reunión';

    if (this.listening) this._stopListen();

    // 회의 요약 버튼 활성화
    if (this._meetingLog && this._meetingLog.length > 0) {
      document.getElementById('summaryBtn').disabled = false;
    }

    this._saveMeetingBundle();
    this._showToast('⏹ Reunión terminada — Presiona 📋 Resumen para guardar', 'success');
  }

  _downloadBilingualSummary() {
    if (!this._meetingLog || !this._meetingLog.length) {
      this._showToast('⚠️ 저장할 미팅 기록이 없습니다', 'error');
      return;
    }

    const src   = LANGUAGES.find(l => l.code === this.srcLang);
    const tgt   = LANGUAGES.find(l => l.code === this.tgtLang);
    const inL   = LANGUAGES.find(l => l.code === this.replyInLang);
    const outL  = LANGUAGES.find(l => l.code === this.replyOutLang);
    const start = new Date(this._meetingStartTime);
    const end   = new Date();
    const dur   = Math.floor((end - start) / 1000);
    const durStr = `${Math.floor(dur / 60)}min ${dur % 60}s`;
    const log   = this._meetingLog;

    const listenEntries = log.filter(e => e.type === 'listen');
    const replyEntries  = log.filter(e => e.type === 'reply');
    const keywords      = this._extractKeywords(listenEntries.map(e => e.orig));
    const avgWords      = listenEntries.length
      ? Math.round(listenEntries.reduce((s, e) => s + e.orig.split(' ').length, 0) / listenEntries.length)
      : 0;

    const W = 55;
    const divider  = '═'.repeat(W);
    const divider2 = '─'.repeat(W);
    const box = (title) => {
      const pad = Math.max(0, W - 2 - title.length);
      const l = Math.floor(pad / 2), r = pad - l;
      return [`╔${'═'.repeat(W - 2)}╗`, `║${' '.repeat(l)}${title}${' '.repeat(r)}║`, `╚${'═'.repeat(W - 2)}╝`];
    };

    const lines = [];

    // ── Encabezado ──
    box('📊  LinguaLive — Resumen de Reunión').forEach(l => lines.push(l));
    lines.push('');
    lines.push('[ Información General ]');
    lines.push(`  Fecha        ${start.toLocaleDateString('es-ES')}`);
    lines.push(`  Hora         ${start.toLocaleTimeString('es-ES')} ~ ${end.toLocaleTimeString('es-ES')}`);
    lines.push(`  Duración     ${durStr}`);
    lines.push(`  Idiomas      ${src?.flag||''} ${src?.name||this.srcLang}  ↔  ${tgt?.flag||''} ${tgt?.name||this.tgtLang}`);
    lines.push('');
    lines.push('[ Estadísticas ]');
    lines.push(`  Frases escuchadas  ${listenEntries.length}`);
    lines.push(`  Mis respuestas     ${replyEntries.length}`);
    lines.push(`  Total intercambios ${log.length}`);
    if (avgWords) lines.push(`  Promedio palabras  ~${avgWords} palabras/frase`);
    lines.push('');
    if (keywords.length) {
      lines.push('[ 🔑 Palabras clave ]');
      lines.push(`  ${keywords.join('  ·  ')}`);
      lines.push('');
    }

    // ── Análisis IA ──
    const aiLines = this._generateAISummary(log, listenEntries, replyEntries, this.srcLang, this.tgtLang, avgWords);
    aiLines.forEach(l => lines.push(l));

    lines.push(divider);
    lines.push('');

    // ══ Sección A: Lo que escuché (original) ══
    box(`${src?.flag||''} ${src?.name||this.srcLang} — Lo que escuché`).forEach(l => lines.push(l));
    lines.push('');
    if (listenEntries.length === 0) {
      lines.push('  (Sin audio registrado)');
    } else {
      listenEntries.forEach((e, i) => {
        const time = new Date(e.ts).toLocaleTimeString('es-ES');
        lines.push(`  [${String(i+1).padStart(2,'0')}] ${time}`);
        lines.push(`  ${e.orig}`);
        lines.push('');
      });
    }
    if (replyEntries.length > 0) {
      lines.push(divider2);
      lines.push(`  [ Mi respuesta — ${outL?.name||this.replyOutLang} ]`);
      lines.push('');
      replyEntries.forEach((e, i) => {
        const time = new Date(e.ts).toLocaleTimeString('es-ES');
        lines.push(`  [${String(i+1).padStart(2,'0')}] ${time}`);
        lines.push(`  ${e.outText || e.es}`);
        lines.push('');
      });
    }
    lines.push('');

    // ══ Sección B: Traducción ══
    box(`${tgt?.flag||''} ${tgt?.name||this.tgtLang} — Traducción`).forEach(l => lines.push(l));
    lines.push('');
    if (listenEntries.length === 0) {
      lines.push('  (Sin traducción)');
    } else {
      listenEntries.forEach((e, i) => {
        const time = new Date(e.ts).toLocaleTimeString('es-ES');
        lines.push(`  [${String(i+1).padStart(2,'0')}] ${time}`);
        lines.push(`  ${e.trans}`);
        lines.push('');
      });
    }
    if (replyEntries.length > 0) {
      lines.push(divider2);
      lines.push(`  [ Mi respuesta — ${inL?.name||this.replyInLang} (original) ]`);
      lines.push('');
      replyEntries.forEach((e, i) => {
        const time = new Date(e.ts).toLocaleTimeString('es-ES');
        lines.push(`  [${String(i+1).padStart(2,'0')}] ${time}`);
        lines.push(`  ${e.inText || e.ko}`);
        lines.push('');
      });
    }
    lines.push('');

    // ══ Transcripción bilingüe completa ══
    box('📜  Transcripción Completa (Bilingüe)').forEach(l => lines.push(l));
    lines.push('');
    log.forEach((e, i) => {
      const time = new Date(e.ts).toLocaleTimeString('es-ES');
      if (e.type === 'listen') {
        lines.push(`[${String(i+1).padStart(2,'00')}] ${time}  🎤 Hablante nativo`);
        lines.push(`  ${src?.flag||''} ${e.orig}`);
        lines.push(`  ${tgt?.flag||''} ${e.trans}`);
      } else {
        lines.push(`[${String(i+1).padStart(2,'00')}] ${time}  💬 Mi respuesta`);
        lines.push(`  ${inL?.flag||''} ${e.inText || e.ko}`);
        lines.push(`  ${outL?.flag||''} ${e.outText || e.es}`);
      }
      lines.push('');
    });

    lines.push(divider);

    lines.push('  Generated by LinguaLive');
    lines.push(divider);

    // 파일명은 ASCII만 사용 (한글/특수문자 → Chrome UUID 버그 방지)
    const langA = (src?.code || this.srcLang).toUpperCase();
    const langB = (tgt?.code || this.tgtLang).toUpperCase();
    const pad2  = n => String(n).padStart(2, '0');
    const dateStr = `${start.getFullYear()}-${pad2(start.getMonth()+1)}-${pad2(start.getDate())}`;
    const timeStr = `${pad2(start.getHours())}-${pad2(start.getMinutes())}`;
    const fileName = `Meeting_${dateStr}_${timeStr}_${langA}-${langB}.txt`;
    const content  = lines.join('\n');

    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    a.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);

    this._showToast(`📥 "${fileName}" descargando... (revisa la carpeta de descargas)`, 'success');
  }

  _saveMeetingBundle() {

    if (!this._meetingLog || !this._meetingLog.length) {
      this._showToast('⚠️ 저장할 미팅 기록이 없습니다', 'error');
      return;
    }
    const src   = LANGUAGES.find(l => l.code === this.srcLang);
    const tgt   = LANGUAGES.find(l => l.code === this.tgtLang);
    const start = new Date(this._meetingStartTime);
    const end   = new Date();
    const dur   = Math.floor((end - start) / 1000);
    const durStr = `${Math.floor(dur / 60)}분 ${dur % 60}초`;
    const log    = this._meetingLog;

    const listenEntries = log.filter(e => e.type === 'listen');
    const replyEntries  = log.filter(e => e.type === 'reply');
    const keywords      = this._extractKeywords(listenEntries.map(e => e.orig));
    const avgWords      = listenEntries.length
      ? Math.round(listenEntries.reduce((s, e) => s + e.orig.split(' ').length, 0) / listenEntries.length)
      : 0;

    const lines = [];

    // ╔══ 기본 요약 ══╗
    lines.push('╔═══════════════════════════════════════════════════╗');
    lines.push('║          📊  LinguaLive 미팅 요약                 ║');
    lines.push('╚═══════════════════════════════════════════════════╝');
    lines.push('');
    lines.push('[ 기본 정보 ]');
    lines.push(`  날짜        ${start.toLocaleDateString('ko-KR')}`);
    lines.push(`  시작~종료   ${start.toLocaleTimeString('ko-KR')} ~ ${end.toLocaleTimeString('ko-KR')}`);
    lines.push(`  총 시간     ${durStr}`);
    lines.push(`  언어        ${src?.name || this.srcLang} ↔ ${tgt?.name || this.tgtLang}`);
    lines.push('');
    lines.push('[ 대화 통계 ]');
    lines.push(`  원어민 발화  ${listenEntries.length}회`);
    lines.push(`  Mi respuesta     ${replyEntries.length} veces`);
    lines.push(`  총 교환     ${log.length}회`);
    if (avgWords) lines.push(`  평균 발화   약 ${avgWords}단어/문장`);
    lines.push('');

    if (keywords.length) {
      lines.push('[ 🔑 주요 키워드 ]');
      lines.push(`  ${keywords.join('  ·  ')}`);
      lines.push('');
    }

    // ╔══ AI 분석 리포트 ══╗
    const aiLines = this._generateAISummary(log, listenEntries, replyEntries, this.srcLang, this.tgtLang, avgWords);
    aiLines.forEach(l => lines.push(l));

    // 하이라이트 (첫 2 + 마지막 2)
    const sample = log.length <= 4 ? log : [...log.slice(0,2), null, ...log.slice(-2)];
    lines.push('[ 💬 대화 하이라이트 ]');
    sample.forEach(e => {
      if (!e) { lines.push('  ...'); return; }
      if (e.type === 'listen') lines.push(`  🎤 ${e.trans}`);
      else                     lines.push(`  💬 ${e.inText || e.ko}`);
    });
    lines.push('');

    if (replyEntries.length) {
      const inL  = LANGUAGES.find(l => l.code === this.replyInLang);
      const outL = LANGUAGES.find(l => l.code === this.replyOutLang);
      lines.push('[ 📝 Lista de mis respuestas ]');
      replyEntries.slice(0, 5).forEach((e, i) => {
        lines.push(`  ${i+1}. ${inL?.name || '입력'}: ${e.inText || e.ko}`);
        lines.push(`     ${outL?.name || '번역'}: ${e.outText || e.es}`);
      });
      if (replyEntries.length > 5) lines.push(`  ... 외 ${replyEntries.length-5}개`);
      lines.push('');
    }

    lines.push('━'.repeat(51));
    lines.push('');

    // ╔══ 전체 스크립트 ══╗
    lines.push('╔═══════════════════════════════════════════════════╗');
    lines.push('║          📜  전체 미팅 스크립트                   ║');
    lines.push('╚═══════════════════════════════════════════════════╝');
    lines.push('');

    log.forEach((e, i) => {
      const time = new Date(e.ts).toLocaleTimeString('ko-KR');
      if (e.type === 'listen') {
        lines.push(`[${String(i+1).padStart(2,'0')}] ${time}  🎤 원어민 발화`);
        lines.push(`  ES: ${e.orig}`);
        lines.push(`  KO: ${e.trans}`);
      } else {
        lines.push(`[${String(i+1).padStart(2,'0')}] ${time}  💬 Mi respuesta`);
        lines.push(`  KO: ${e.ko}`);
        lines.push(`  ES: ${e.es}`);
      }
      lines.push('');
    });

    lines.push('═'.repeat(51));
    lines.push('  Generated by LinguaLive');
    lines.push('═'.repeat(51));

    const pad      = n => String(n).padStart(2, '0');
    const d        = `${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
    const t        = `${pad(start.getHours())}-${pad(start.getMinutes())}`;
    const fileName = `Meeting_${d}_${t}.txt`;
    const content  = lines.join('\n');

    const win = window.open('', '_blank');
    if (win) {
      const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      win.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title>` +
        `<style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap');` +
        `body{background:#07071a;color:#e2e8f0;font-family:"Noto Sans KR",monospace;` +
        `white-space:pre-wrap;padding:36px;line-height:1.8;font-size:14px;max-width:860px;margin:0 auto}` +
        `</style></head><body>${esc(content)}</body></html>`
      );
      win.document.close();
      this._showToast('📊 Resumen+script abierto en nueva pestaña. Guarda con Ctrl+S', 'success');
    } else {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none'; a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }
  }

  _generateAISummary(log, listenEntries, replyEntries, srcLang, tgtLang, avgWords) {
    const lines = [];
    const W = 53;
    lines.push('╔' + '═'.repeat(W - 2) + '╗');
    lines.push('║       🤖  AI 학습 분석 리포트' + ' '.repeat(W - 32) + '║');
    lines.push('╚' + '═'.repeat(W - 2) + '╝');
    lines.push('');

    const srcL = LANGUAGES.find(l => l.code === srcLang);
    const tgtL = LANGUAGES.find(l => l.code === tgtLang);
    const allOrig  = listenEntries.map(e => e.orig.toLowerCase()).join(' ');
    const allTrans = listenEntries.map(e => e.trans.toLowerCase()).join(' ');
    const allReply = replyEntries.map(e => (e.inText || e.ko || '').toLowerCase()).join(' ');

    // ── 주제 분류 ──
    const TOPIC_MAP = [
      { label: '인사 / 첫 만남',  kw: ['hola','hello','hi','mucho gusto','encantado','nice to meet','buenas','salut','ciao','konnichiwa','你好','반갑','안녕'] },
      { label: '자기소개',         kw: ['me llamo','soy','mi nombre','my name','i am','je suis','ich bin','저는','나는','제 이름'] },
      { label: '일상 안부',        kw: ['como estas','how are you','comment ca va','잘 지내','어때','are you okay'] },
      { label: '감사 표현',        kw: ['gracias','thank','merci','danke','감사','고마워','arigatou'] },
      { label: '비즈니스 / 업무',  kw: ['reunion','meeting','project','trabajo','work','업무','프로젝트','회의','일정'] },
      { label: '음식 / 식사',      kw: ['comida','food','comer','eat','restaurant','음식','먹다','식사'] },
      { label: '날씨 / 일상',      kw: ['weather','clima','tiempo','lluvia','날씨','비','맑다','덥다'] },
      { label: '숫자 / 시간',      kw: ['hora','tiempo','minuto','one','two','하나','둘','시간','분'] },
    ];
    const topics = TOPIC_MAP.filter(t =>
      t.kw.some(k => allOrig.includes(k) || allTrans.includes(k) || allReply.includes(k))
    ).map(t => t.label);

    const responseRate = listenEntries.length
      ? Math.round(replyEntries.length / listenEntries.length * 100)
      : 0;

    const hasSubstantialContent = listenEntries.length >= 3 || replyEntries.length >= 2 || topics.length >= 2;

    // ══════════════════════════════════════════════
    // 1. 회의 내용 요약 (가장 먼저)
    // ══════════════════════════════════════════════
    lines.push('[ 📋 회의 내용 요약 ]');
    lines.push('');

    if (listenEntries.length === 0 && replyEntries.length === 0) {
      lines.push('  ⚠ 특별한 내용 없음');
      lines.push('  (이번 세션에서 기록된 발화가 없습니다)');
    } else if (!hasSubstantialContent) {
      lines.push('  ⚠ 특별한 내용 없음');
      lines.push('  (세션이 매우 짧아 충분한 내용이 기록되지 않았습니다)');
      if (listenEntries.length > 0) {
        const first = listenEntries[0];
        lines.push(`  짧은 교환: "${first.orig}" — ${first.trans}`);
      }
    } else {
      // 실질적인 내용이 있을 때 서술형 요약
      const topicStr = topics.length ? `【${topics.join(' / ')}】` : '【자유 대화】';
      lines.push(`  오늘은 ${srcL?.name || srcLang} ↔ ${tgtL?.name || tgtLang} 세션으로,`);
      lines.push(`  주제: ${topicStr}`);
      lines.push('');

      if (listenEntries.length > 0) {
        const first = listenEntries[0];
        lines.push(`  대화 시작: "${first.orig}"`);
        lines.push(`            (${first.trans})`);
      }
      if (listenEntries.length > 1) {
        const last = listenEntries[listenEntries.length - 1];
        lines.push(`  대화 종료: "${last.orig}"`);
        lines.push(`            (${last.trans})`);
      }
      if (replyEntries.length > 0) {
        lines.push('');
        const rateStr = responseRate >= 100 ? '전부' : `${responseRate}%`;
        lines.push(`  학습자는 원어민 발화의 ${rateStr}에 응답하며 대화를 이어갔습니다.`);
      }
    }
    lines.push('');

    // ══════════════════════════════════════════════
    // 2. 핵심 포인트 (불릿 정리)
    // ══════════════════════════════════════════════
    lines.push('[ 🎯 핵심 포인트 ]');
    lines.push('');
    const keyPoints = [];
    if (topics.length > 0)
      keyPoints.push(`오늘 다룬 주제: ${topics.join(', ')}`);
    if (listenEntries.length > 0)
      keyPoints.push(`원어민 발화 ${listenEntries.length}회 / 학습자 응답 ${replyEntries.length}회`);
    if (avgWords > 0)
      keyPoints.push(`평균 문장 길이: 약 ${avgWords}단어`);
    if (replyEntries.length > 0) {
      const firstReply = replyEntries[0];
      const inp = firstReply.inText || firstReply.ko || '';
      const out = firstReply.outText || firstReply.es || '';
      if (inp) keyPoints.push(`첫 응답: "${inp}" → "${out}"`);
    }
    if (topics.includes('인사 / 첫 만남'))
      keyPoints.push('기본 인사 표현 연습 완료');
    if (topics.includes('감사 표현'))
      keyPoints.push('감사 표현 사용');
    if (topics.includes('비즈니스 / 업무'))
      keyPoints.push('비즈니스 관련 어휘 학습');

    if (keyPoints.length === 0) {
      lines.push('  ⚠ 특별한 포인트 없음');
    } else {
      keyPoints.forEach(p => lines.push(`  · ${p}`));
    }
    lines.push('');

    // ══════════════════════════════════════════════
    // 3. 상세 분석 (하단)
    // ══════════════════════════════════════════════
    lines.push('─'.repeat(W - 2));
    lines.push('  [ 상세 분석 ]');
    lines.push('');

    // 3-1. 주요 표현 & 어휘
    if (listenEntries.length > 0) {
      lines.push('  < 원어민 주요 표현 >');
      listenEntries.slice(0, 5).forEach((e, i) => {
        lines.push(`  ${i + 1}. "${e.orig}"`);
        lines.push(`     → ${e.trans}`);
      });
      if (listenEntries.length > 5)
        lines.push(`  ... 외 ${listenEntries.length - 5}개 발화`);
      lines.push('');
    }

    // 3-2. 내 응답 요약
    if (replyEntries.length > 0) {
      lines.push('  < 학습자 응답 >');
      replyEntries.slice(0, 5).forEach((e, i) => {
        const inp = e.inText || e.ko || '';
        const out = e.outText || e.es || '';
        lines.push(`  ${i + 1}. ${inp}`);
        if (out) lines.push(`     → ${out}`);
      });
      if (replyEntries.length > 5)
        lines.push(`  ... 외 ${replyEntries.length - 5}개 응답`);
      lines.push('');
    }

    // 3-3. 학습 성과
    lines.push('  < 학습 성과 >');
    const achievements = [];
    if (topics.includes('인사 / 첫 만남'))  achievements.push('기본 인사 표현 복습');
    if (topics.includes('감사 표현'))        achievements.push('감사 표현 연습');
    if (topics.includes('자기소개'))          achievements.push('자기소개 패턴 학습');
    if (topics.includes('비즈니스 / 업무'))   achievements.push('비즈니스 어휘 노출');
    if (replyEntries.length > 0)              achievements.push(`능동적 응답 ${replyEntries.length}회`);
    if (avgWords > 8)   achievements.push('고급 수준 문장 노출');
    else if (avgWords > 3) achievements.push('적정 난이도 학습');
    if (listenEntries.length >= 5) achievements.push('집중 발화 훈련');

    if (achievements.length === 0) {
      lines.push('  ⚠ 세션 데이터 부족 — 더 긴 세션을 권장합니다');
    } else {
      achievements.forEach(a => lines.push(`  ✅ ${a}`));
    }
    lines.push('');

    // 3-4. 다음 학습 추천
    lines.push('  < 다음 학습 추천 >');
    const suggestions = [];
    if (!topics.includes('자기소개') && topics.includes('인사 / 첫 만남'))
      suggestions.push('자기소개 표현으로 확장 (Me llamo..., Soy de...)');
    if (replyEntries.length === 0)
      suggestions.push(`"내 응답" 패널에서 ${tgtL?.name || tgtLang}로 직접 응답 연습`);
    if (avgWords > 0 && avgWords < 4)
      suggestions.push('더 긴 문장으로 대화 이어가기');
    if (listenEntries.length > 0 && listenEntries.length < 3)
      suggestions.push('더 긴 세션(5분 이상)으로 충분한 노출');
    suggestions.push('오늘 배운 표현을 단어장에 저장 후 TTS로 발음 연습');
    suggestions.push(`동일 주제(${topics.length ? topics[0] : '자유 대화'})를 다른 상황에서 반복`);

    suggestions.forEach(s => lines.push(`  → ${s}`));
    lines.push('');
    lines.push('━'.repeat(W - 2));
    lines.push('');
    return lines;
  }


  _extractKeywords(texts) {
    const stop = new Set(['el','la','los','las','un','una','de','que','y','a','en','es','se','no','con','por','su','para','al','del','le','lo','me','mi','tu','te','nos','yo','él','ella','eso','esta','este','como','más','pero','si','o','hay','era','está','son','ser','han','muy','fue','ya','todo','también','sobre','cuando','esto','sin','sus','porque','entre','así','uno','hasta','desde','ni','bien','he','tiene','vez','qué','cómo','tan','les','ha','aquí','allí','entonces','pues','bueno','sí','ok','hola','gracias','favor','bien']);
    const freq = {};
    texts.forEach(t => {
      t.toLowerCase().replace(/[¿¡.,!?;:()""'']/g,'').split(/\s+/).forEach(w => {
        if (w.length > 3 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1;
      });
    });
    return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10).map(([w]) => w);
  }



  /* ── Utils ───────────────────────────────── */

  /* Google/Microsoft 신경망 목소리를 우선 선택 */
  _bestVoice(langBcp47) {
    const voices = speechSynthesis.getVoices();
    const lang   = langBcp47.toLowerCase().slice(0, 2); // 'en', 'es', ...

    // 1순위: Google 신경망 (Chrome)
    const google = voices.find(v =>
      v.lang.toLowerCase().startsWith(lang) &&
      v.name.toLowerCase().includes('google')
    );
    if (google) return google;

    // 2순위: Microsoft Natural (Edge/Windows 11)
    const msNatural = voices.find(v =>
      v.lang.toLowerCase().startsWith(lang) &&
      v.name.toLowerCase().includes('natural')
    );
    if (msNatural) return msNatural;

    // 3순위: 해당 언어 첫 번째 목소리
    return voices.find(v => v.lang.toLowerCase().startsWith(lang)) || null;
  }

  _speak(text, langCode, btnEl) {
    if (!text) return;

    // 같은 버튼 재클릭 → 중단
    if (speechSynthesis.speaking && this._ttsBtn === btnEl) {
      speechSynthesis.cancel();
      return;
    }

    // 기존 재생 중단 + 버튼 복원
    speechSynthesis.cancel();
    if (this._ttsBtn) {
      this._ttsBtn.textContent = '🔊';
      this._ttsBtn = null;
    }

    const langObj = LANGUAGES.find(l => l.code === langCode);
    const bcp47   = langObj?.speech || langCode;

    const doSpeak = () => {
      const utt   = new SpeechSynthesisUtterance(text);
      utt.lang    = bcp47;
      utt.rate    = 0.88;
      utt.pitch   = 1.0;
      const voice = this._bestVoice(bcp47);
      if (voice) utt.voice = voice;

      if (btnEl) { btnEl.textContent = '⏹'; this._ttsBtn = btnEl; }
      utt.onend = utt.onerror = () => {
        if (this._ttsBtn === btnEl) {
          if (btnEl) btnEl.textContent = '🔊';
          this._ttsBtn = null;
        }
      };
      speechSynthesis.speak(utt);
    };

    // 목소리 목록이 아직 안 로딩됐으면 대기
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; doSpeak(); };
    } else {
      doSpeak();
    }
  }

  _copy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this._showToast('📋 Copiado al portapapeles', 'success');
    }).catch(() => {
      this._showToast('Error al copiar', 'error');
    });
  }

  _saveScript() {
    if (!this.history.length && !this.origText) {
      this._showToast('⚠️ No hay script para guardar', 'error');
      return;
    }

    const srcLang = LANGUAGES.find(l => l.code === this.srcLang);
    const tgtLang = LANGUAGES.find(l => l.code === this.tgtLang);
    const now     = new Date();
    const dateStr = now.toLocaleString('ko-KR');

    let lines = [];
    lines.push('═══════════════════════════════════════════');
    lines.push('  LinguaLive 세션 스크립트');
    lines.push(`  날짜: ${dateStr}`);
    lines.push(`  언어: ${srcLang?.name || this.srcLang} → ${tgtLang?.name || this.tgtLang}`);
    lines.push('═══════════════════════════════════════════');
    lines.push('');

    if (this.history.length) {
      lines.push('[ 대화 기록 ]');
      lines.push('');
      [...this.history].reverse().forEach((h, i) => {
        const time = new Date(h.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const srcL = LANGUAGES.find(l => l.code === h.srcLang);
        const tgtL = LANGUAGES.find(l => l.code === h.tgtLang);
        lines.push(`[${i + 1}] ${time}`);
        lines.push(`  ${srcL?.flag || ''} ${srcL?.name || h.srcLang}: ${h.orig}`);
        lines.push(`  ${tgtL?.flag || ''} ${tgtL?.name || h.tgtLang}: ${h.trans}`);
        lines.push('');
      });
    }

    if (this.vocab.count()) {
      lines.push('[ 저장된 단어장 ]');
      lines.push('');
      this.vocab.getAll().forEach(v => {
        const srcL = LANGUAGES.find(l => l.code === v.srcLang);
        const tgtL = LANGUAGES.find(l => l.code === v.tgtLang);
        lines.push(`  • ${srcL?.flag || ''} ${v.srcWord}  →  ${tgtL?.flag || ''} ${v.tgtWord}`);
      });
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════');
    lines.push('  Generated by LinguaLive');
    lines.push('═══════════════════════════════════════════');

    const blob     = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url      = URL.createObjectURL(blob);
    const fileName = `LinguaLive_${now.toLocaleDateString('ko-KR').replace(/\./g, '-').trim()}_${now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }).replace(':', '-')}.txt`;

    const a  = document.createElement('a');
    a.href   = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    this._showToast(`💾 "${fileName}" guardado`, 'success');
  }

  _clearSession() {
    this.origText  = '';
    this.transText = '';
    this.history   = [];
    document.getElementById('origText').innerHTML    = '<span class="placeholder">음성을 인식하면 여기에 표시됩니다...</span>';
    document.getElementById('transText').innerHTML   = '<span class="placeholder">번역 결과가 여기에 표시됩니다...</span>';
    document.getElementById('interimText').textContent = '';
    document.getElementById('keywordsSection').hidden  = true;
    document.getElementById('keywordsList').innerHTML  = '';
    document.getElementById('confBadge').hidden = true;
    this._renderHistory();
    this._showToast('↺ Sesión reiniciada');
  }

  _showConfidence(pct) {
    const el = document.getElementById('confBadge');
    el.textContent = `${pct}%`;
    el.hidden = false;
  }

  _setStatus(msg) {
    const el = document.getElementById('statusTxt');
    if (el) el.textContent = msg;
  }

  _updateReplyFlags() {
    const inL  = LANGUAGES.find(l => l.code === this.replyInLang)  || LANGUAGES[0];
    const outL = LANGUAGES.find(l => l.code === this.replyOutLang) || LANGUAGES[1];
    const inFlag  = document.getElementById('replyInFlag');
    const outFlag = document.getElementById('replyOutFlag');
    if (inFlag)  inFlag.textContent  = inL.flag;
    if (outFlag) outFlag.textContent = outL.flag;
    // 입력창 placeholder도 현재 언어에 맞게 업데이트
    const replyInput = document.getElementById('replyInput');
    if (replyInput) {
      replyInput.placeholder = `Escribe en ${inL.name}... (se traducirá al ${outL.name})`;
    }
  }

  _updatePanelHeaders() {
    const src = LANGUAGES.find(l => l.code === this.srcLang) || LANGUAGES[0];
    const tgt = LANGUAGES.find(l => l.code === this.tgtLang) || LANGUAGES[1];
    document.getElementById('srcFlag').textContent = src.flag;
    document.getElementById('srcName').textContent = src.name;
    document.getElementById('tgtFlag').textContent = tgt.flag;
    document.getElementById('tgtName').textContent = tgt.name;
  }

  _showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className   = `toast${type ? ' ' + type : ''} show`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
}


/* ─── AIConversationManager ─────────────────────────── */
class AIConversationManager {
  constructor(gemini) {
    this.gemini   = gemini;
    this.history  = [];
    this.scene    = 'business';
    this.practLang = 'en';  // 스페인어 사용자가 영어로 AI와 대화
    this.turnCount = 0;
    this._aiListening = false;
    this._aiRec = null;
    this._bound = false;
  }

  // ── 시스템 프롬프트 생성 ───────────────────────────
  _buildSystemPrompt() {
    const langNames = { ko: 'Korean', es: 'Spanish', en: 'English', ja: 'Japanese' };
    const lang = langNames[this.practLang] || 'English';

    const scenes = {
      business:       `You are a professional business meeting partner. Context: international business meeting.`,
      casual:         `You are a friendly native speaker having a casual conversation.`,
      negotiation:    `You are a business counterpart in a price/contract negotiation.`,
      presentation:   `You are an audience member listening to a business presentation. Ask questions and give feedback.`,
      stock:          `You are a Wall Street equity analyst at a major investment bank. The user is a Korean investor or fund manager who wants to discuss US stocks, earnings, market trends, and portfolio strategy. Discuss stocks like a professional: mention specific tickers (AAPL, NVDA, TSLA etc.), P/E ratios, EPS, guidance, sector rotation, Fed policy impact, etc.`,

      // ── 🚆 철도 EPC 시나리오 3종 ───────────────────────
      rail_epc: `You are a senior Railway EPC Contract Manager representing the Employer (or a senior Contractor's PM) on a large-scale international railway project (metro, light rail, or mainline). You are fluent in FIDIC Yellow/Silver book conditions, NEC4 EPC Option, Lump-Sum Turnkey contracts, and railway-specific contract clauses. The Korean user is a railway EPC professional who wants to practice these topics in the target language.

Key discussion topics you should bring up naturally:
- Contract structure: Scope of Work, Employer's Requirements (ERD/ERS), Contractor's Proposals
- Risk allocation: design risk, construction risk, interface risk, delay risk (Force Majeure, Employer Delays)
- Payment mechanisms: milestone payments, advance payment, retention money, LD / Delay Damages
- Variation Orders (VO / Change Orders): procedure, valuation, time impact analysis
- Bonds and Guarantees: Performance Bond, Advance Payment Guarantee, Parent Company Guarantee
- Defects Liability Period (DLP) and rectification obligations
- Dispute resolution: DAB / DAAB, adjudication, arbitration (ICC, UNCITRAL)
- Programme: Baseline Programme, Critical Path, float ownership, delay analysis (SCL Protocol)
- Procurement: long-lead items, rolling stock interfaces, major sub-contracts
- Completion: Taking-Over Certificate (TOC), Section completions, Revenue Service Date (RSD)

Use precise contract and railway terminology (e.g., Engineer's Representative, Provisional Sums, Bill of Quantities, FIDIC Sub-Clause 20).`,

      rail_interface: `You are a seasoned Railway Systems Integration Manager on an international EPC railway project. You coordinate between Civil & Structures, Track, Traction Power (OCS/SSP), Signalling (ETCS/CTCS/CBTC/interlocking), Telecommunications (SCADA, DCS, CCTV, PIS, TETRA), and Rolling Stock teams. The Korean user is a railway systems engineer who wants to practice interface management discussions in the target language.

Key discussion topics:
- Interface Management framework: Interface Register, Interface Control Documents (ICDs), Interface Agreements (IAs)
- Civil-Systems interfaces: cable duct banks, cable trays, equipment room dimensions, cable routes, fixings and embedments
- Track-OCS geometry: contact wire height, stagger, section breaks, neutral sections
- Signalling-Civil interfaces: signal mast foundations, cable trough routes, bored cable crossings, axle counter loops
- Power-Civil interfaces: substation building design, earthing and bonding, lightning protection, cable entry sealing
- Rolling Stock interfaces: platform edge-to-train gap, ATP/ATC onboard requirements, pantograph gauge, coupler interface
- Utility diversion and relocation plans
- Interface Risk Register and open TQ (Technical Query) management
- Multi-discipline design review process: IDC (Interdisciplinary Check), Model Review, BIM coordination
- Interface meeting cadence: weekly discipline leads meeting, monthly Interface Board
- Testing & commissioning interfaces: FAT (Factory Acceptance Test), SAT (Site Acceptance Test), integrated system tests, SIL verification

Use technical interface management terminology naturally and ask probing questions about specific interface challenges.`,

      rail_rams: `You are a senior Railway RAMS (Reliability, Availability, Maintainability, Safety) Engineer and Commissioning Director on an international EPC railway project. You are expert in EN 50126, EN 50128, EN 50129, EN 50159 (CENELEC standards), IEC 61508, and UIC/UITP guidelines. The Korean user is a railway professional who wants to practice RAMS and commissioning discussions in the target language.

Key discussion topics:
- RAMS definitions & targets: MTTF, MTTR, availability (e.g. ≥99.5%), SIL levels
- System Safety Plan (SSP), Safety Case, HAZOP, FMECA (Failure Mode, Effects & Criticality Analysis)
- Functional Safety: Safety Integrity Level (SIL) allocation, verification & validation (V&V)
- Independent Safety Assessor (ISA): role, scope, sign-off conditions for Revenue Service
- Commissioning stages: Factory Acceptance Test (FAT), Site Acceptance Test (SAT), cold commissioning (energised walk-through), hot commissioning (trial runs with rolling stock), integrated tests, trial operations
- Pre-Revenue Service (PRS): staff training, emergency drill, revenue service criteria
- Revenue Service Date (RSD) and contractual conditions precedent
- Defect management during commissioning: Defects List, snag list, Category A/B/C classification
- Reliability Growth Programme (RGP) and FRACAS (Failure Reporting, Analysis & Corrective Action System)
- Handover documentation: O&M Manuals, As-Built drawings, spare parts list, training records
- KPI monitoring during warranty period: availability reporting, failure log, corrective maintenance time

Ask the user detailed technical questions about commissioning progress, test results, outstanding safety actions, and RAMS compliance.`
    };

    return `${scenes[this.scene] || scenes.business}

IMPORTANT RULES:
1. Respond ONLY in ${lang} (target language). Keep responses natural and conversational (2-4 sentences max).
2. After your ${lang} response, add a line break and then add a "COACH:" section in Spanish (Español) that:
   - Notes any grammar mistakes or unnatural expressions in what the USER said
   - Suggests better phrasing if needed
   - If the user's expression was perfect, write "COACH: ¡Expresión perfecta! 👍"
   - If user wrote in Spanish or another language, gently note they should practice in ${lang}
3. Format: [Your ${lang} response]\n\nCOACH: [Spanish coaching notes]`;
  }

  // ── 방 열기 ────────────────────────────────────────
  open(practLang) {
    this.practLang = practLang || 'en';  // 기본: 영어
    this.history   = [];
    this.turnCount = 0;
    this.scene     = 'business';

    // 언어 버튼 active 동기화
    document.querySelectorAll('.lmai-lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === this.practLang);
    });

    // 웰컴 메시지 초기화 (스페인어로 표시)
    const langNames = { ko: '한국어', es: 'Español', en: 'English', ja: '日本語' };
    const langName  = langNames[this.practLang] || this.practLang;
    document.getElementById('lmaiWelcomeMsg').innerHTML =
      `¡Hola! Soy tu compañero de conversación IA.<br>¡Practica <strong>${langName}</strong> conmigo libremente!`;
    document.getElementById('lmAITurnCount').textContent = '0 turnos';

    const win = document.getElementById('lmaiChatWindow');
    win.innerHTML = '';
    const welcome = document.createElement('div');
    welcome.className = 'lmai-welcome';
    welcome.innerHTML = `<div class="lmai-bot-avatar">🤖</div><p id="lmaiWelcomeMsg">${document.getElementById('lmaiWelcomeMsg')?.innerHTML || ''}</p>`;
    win.appendChild(welcome);

    this._stopAIMic();
    this._switchAIMode('mic');

    if (!this._bound) { this._bindUI(); this._bound = true; }

    // AI 첫 인사 생성 (스페인어 사용자에게 영어로 인사)
    this._sendToGemini(`(Conversation start — greet briefly in ${langName} and ask what topic to discuss today. Skip the COACH section.)`, true);
  }

  // ── 이벤트 바인딩 ─────────────────────────────────
  _bindUI() {
    document.getElementById('lmAIBackBtn').addEventListener('click', () => {
      this._stopAIMic();
    });

    // 시나리오 전환
    document.querySelectorAll('.lmai-scenario').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lmai-scenario').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.scene = btn.dataset.scene;
        this.history = [];
        const win = document.getElementById('lmaiChatWindow');
        win.innerHTML = '';
        this._addBotMsg(`[Escenario cambiado: ${btn.textContent.trim()}. ¡Empezamos de nuevo!]`, '');
        this._sendToGemini(`(New scenario: ${btn.textContent.trim()}. Greet briefly in the target language and start.)`, true);
      });
    });

    // 언어 선택
    document.querySelectorAll('.lmai-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lmai-lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.practLang = btn.dataset.lang;
        this.history = [];
        const langNames = { ko: '한국어', es: 'Español', en: 'English', ja: '日本語' };
        const langName = langNames[this.practLang] || this.practLang;
        const win = document.getElementById('lmaiChatWindow');
        win.innerHTML = '';
        this._addBotMsg(`[Idioma cambiado a ${langName}. ¡Nueva conversación!]`, '');
        this._sendToGemini(`(Language changed to ${langName}. Greet briefly and start. Skip COACH section.)`, true);
        // 마이크 언어도 동기화
        if (this._aiRec) { this._stopAIMic(); }
      });
    });

    // 입력 모드 전환
    document.getElementById('lmaiModeMic').addEventListener('click', () => this._switchAIMode('mic'));
    document.getElementById('lmaiModeText').addEventListener('click', () => this._switchAIMode('text'));

    // 마이크
    document.getElementById('lmaiMicBtn').addEventListener('click', () => this._toggleAIMic());

    // 텍스트 전송
    document.getElementById('lmaiSendBtn').addEventListener('click', () => this._sendText());
    document.getElementById('lmaiTextInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendText(); }
    });
  }

  // ── 입력 모드 전환 ────────────────────────────────
  _switchAIMode(mode) {
    const isMic = mode === 'mic';
    document.getElementById('lmaiModeMic').classList.toggle('active', isMic);
    document.getElementById('lmaiModeText').classList.toggle('active', !isMic);
    document.getElementById('lmaiMicWrap').hidden  = !isMic;
    document.getElementById('lmaiTextWrap').hidden = isMic;
    if (!isMic) { this._stopAIMic(); document.getElementById('lmaiTextInput').focus(); }
  }

  // ── 마이크 토글 ───────────────────────────────────
  _toggleAIMic() {
    if (this._aiListening) { this._stopAIMic(); return; }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this._addBotMsg('이 브라우저는 음성 인식을 지원하지 않습니다 (Chrome 권장)', ''); return; }

    const langBcp = { es:'es-ES', en:'en-US', fr:'fr-FR', de:'de-DE', ja:'ja-JP', zh:'zh-CN' };
    this._aiListening = true;

    const btn  = document.getElementById('lmaiMicBtn');
    const icon = document.getElementById('lmaiMicIcon');
    const hint = document.getElementById('lmaiMicHint');
    btn.classList.add('recording');
    icon.textContent = '⏹';
    hint.textContent = '🔴 Escuchando... habla ahora';

    const startRec = () => {
      if (!this._aiListening) return;
      const rec = new SR();
      rec.lang           = langBcp[this.practLang] || 'es-ES';
      rec.continuous     = true;
      rec.interimResults = true;
      this._aiRec = rec;

      rec.onresult = (e) => {
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
        }
        if (final.trim()) {
          this._stopAIMic();
          this._processUserMsg(final.trim());
        }
      };

      rec.onerror = (e) => {
        if (e.error === 'not-allowed') {
          this._aiListening = false;
          btn.classList.remove('recording');
          icon.textContent = '🎙';
          hint.textContent = 'Se necesita permiso de micrófono';
        }
      };

      rec.onend = () => {
        if (this._aiListening) setTimeout(() => { try { startRec(); } catch(_){} }, 150);
      };

      try { rec.start(); } catch(err) {
        this._aiListening = false;
        btn.classList.remove('recording');
        icon.textContent = '🎙';
        hint.textContent = 'Error al iniciar micrófono';
      }
    };
    startRec();
  }

  _stopAIMic() {
    this._aiListening = false;
    if (this._aiRec) { try { this._aiRec.stop(); } catch(_){} this._aiRec = null; }
    const btn  = document.getElementById('lmaiMicBtn');
    const icon = document.getElementById('lmaiMicIcon');
    const hint = document.getElementById('lmaiMicHint');
    if (btn)  btn.classList.remove('recording');
    if (icon) icon.textContent = '🎙';
    if (hint) hint.textContent = 'Presiona y habla';
  }

  // ── 텍스트 전송 ───────────────────────────────────
  _sendText() {
    const input = document.getElementById('lmaiTextInput');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    this._processUserMsg(text);
  }

  // ── 유저 메시지 처리 ───────────────────────────────
  _processUserMsg(text) {
    this._addUserMsg(text);
    this._sendToGemini(text, false);
  }

  // ── Gemini API 호출 ────────────────────────────────
  async _sendToGemini(userText, isSystem, _retryCount = 0) {
    const typingEl = this._showTyping();

    try {
      const raw = await this.gemini.chat(this._buildSystemPrompt(), this.history, userText);
      typingEl.remove();

      // COACH 섹션 분리
      const coachMatch = raw.match(/\bCOACH:\s*([\s\S]+)$/i);
      const coachNote  = coachMatch ? coachMatch[1].trim() : '';
      const reply      = raw.replace(/\n*COACH:[\s\S]+$/i, '').trim();

      if (!isSystem) {
        this.history.push({ role: 'user',  text: userText });
        this.history.push({ role: 'bot',   text: reply });
        this.turnCount++;
        document.getElementById('lmAITurnCount').textContent = `${this.turnCount}번 대화`;
      }

      this._addBotMsg(reply, coachNote);
      this._speakBot(reply);  // AI 응답 TTS (목표 언어로 읽기)

    } catch (err) {
      typingEl.remove();

      // Rate limit 에러 감지
      const isRateLimit = err.message.includes('quota') || err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED');
      const retryMatch  = err.message.match(/retry in (\d+(?:\.\d+)?)s/i);
      const waitSec     = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;

      if (isRateLimit && _retryCount < 2) {
        // 카운트다운 메시지 표시
        const countEl = document.createElement('div');
        countEl.className = 'lmai-msg bot';
        countEl.innerHTML = `
          <div class="lmai-avatar">⏳</div>
          <div class="lmai-bubble-wrap">
            <div class="lmai-bubble lmai-rate-limit">
              🚦 <strong>API 요청 한도 초과</strong> — <span id="lmaiCountdown">${waitSec}</span>초 후 자동 재시도합니다...
            </div>
          </div>`;
        document.getElementById('lmaiChatWindow').appendChild(countEl);
        document.getElementById('lmaiChatWindow').scrollTop = 99999;

        // 카운트다운 실행
        let remaining = waitSec;
        const timer = setInterval(() => {
          remaining--;
          const cd = document.getElementById('lmaiCountdown');
          if (cd) cd.textContent = remaining;
          if (remaining <= 0) {
            clearInterval(timer);
            countEl.remove();
            this._sendToGemini(userText, isSystem, _retryCount + 1);
          }
        }, 1000);

      } else if (isRateLimit) {
        // 재시도 횟수 초과
        this._addBotMsg(
          `⚠️ API 한도 초과로 잠시 대화를 멈춥니다.<br>` +
          `<small>무료 플랜은 분당 20회 제한이 있습니다. 1~2분 기다린 후 다시 시도하세요.</small>`,
          ''
        );
      } else {
        this._addBotMsg(`⚠️ 오류: ${err.message}`, '');
      }
    }
  }


  // ── UI 헬퍼 ───────────────────────────────────────
  _addUserMsg(text) {
    const win  = document.getElementById('lmaiChatWindow');
    const msg  = document.createElement('div');
    msg.className = 'lmai-msg user';
    msg.innerHTML = `
      <div class="lmai-avatar">👤</div>
      <div class="lmai-bubble-wrap">
        <div class="lmai-bubble">${text}</div>
      </div>`;
    win.appendChild(msg);
    win.scrollTop = win.scrollHeight;
  }

  _addBotMsg(reply, coachNote) {
    const win = document.getElementById('lmaiChatWindow');
    const msg = document.createElement('div');
    msg.className = 'lmai-msg bot';
    msg.innerHTML = `
      <div class="lmai-avatar">🤖</div>
      <div class="lmai-bubble-wrap">
        <div class="lmai-bubble">${reply}</div>
        ${coachNote ? `<div class="lmai-coach-note">💡 <strong>코칭:</strong> ${coachNote}</div>` : ''}
      </div>`;
    win.appendChild(msg);
    win.scrollTop = win.scrollHeight;
  }

  _showTyping() {
    const win = document.getElementById('lmaiChatWindow');
    const el  = document.createElement('div');
    el.className = 'lmai-msg bot';
    el.innerHTML = `
      <div class="lmai-avatar">🤖</div>
      <div class="lmai-bubble-wrap">
        <div class="lmai-bubble">
          <div class="lmai-typing"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    win.appendChild(el);
    win.scrollTop = win.scrollHeight;
    return el;
  }

  // ── TTS (AI 응답 자동 읽기) ───────────────────────
  _speakBot(text) {
    speechSynthesis.cancel();
    const langMap = { es:'es-ES', en:'en-US', fr:'fr-FR', de:'de-DE', ja:'ja-JP', zh:'zh-CN' };
    const bcp47   = langMap[this.practLang] || 'es-ES';
    const voices  = speechSynthesis.getVoices();
    const lang    = bcp47.slice(0, 2);
    const best    =
      voices.find(v => v.lang.toLowerCase().startsWith(lang) && v.name.toLowerCase().includes('google')) ||
      voices.find(v => v.lang.toLowerCase().startsWith(lang));
    const utt     = new SpeechSynthesisUtterance(text);
    utt.lang = bcp47; utt.rate = 0.9;
    if (best) utt.voice = best;
    speechSynthesis.speak(utt);
  }
}

/* ─── Init ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LinguaLiveApp();

  const gemini = new GeminiService('AIzaSyBfvVJ6HiVXmXcR0xyGa5zkZEsJUjUi6Fc');
  window.aiConv = new AIConversationManager(gemini);
});