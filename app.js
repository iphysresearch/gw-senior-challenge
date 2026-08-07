/* ============================================================================
   app.js —— DOM 交互、排行榜(localStorage)、题图动画。评分逻辑在 scoring.js。
   ========================================================================== */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const LB_KEY = 'gw_senior_leaderboard_v1';
  const SOLUTION_URL = './data/solution.csv';

  // ---- 状态 ----------------------------------------------------------------
  let solution = null;         // Map<id, label>
  let solutionErr = null;
  let fileText = null;         // 已选文件文本
  let fileName = null;

  // ---- 预加载答案（用于客户端评分）----------------------------------------
  fetch(SOLUTION_URL, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then((txt) => {
      solution = new Map();
      const { rows } = window.GWScore.parseCSV(txt);
      for (let i = 1; i < rows.length; i++) {   // 跳过表头 id,label
        const [id, lab] = rows[i];
        if (lab === '0' || lab === '1') solution.set(id, parseInt(lab, 10));
      }
      refreshBtn();
    })
    .catch((e) => { solutionErr = e.message; refreshBtn(); });

  // ---- 文件选择 / 拖放 -----------------------------------------------------
  const drop = $('#drop'), fileInput = $('#file');
  const dropBig = $('#dropBig'), dropSmall = $('#dropSmall');

  function acceptFile(f) {
    if (!f) return;
    fileName = f.name;
    const reader = new FileReader();
    reader.onload = () => {
      fileText = reader.result;
      dropBig.innerHTML = '已选择 <span class="fname">' + escapeHtml(f.name) + '</span>';
      dropSmall.textContent = Math.round(f.size / 1024) + ' KB · 点击可更换 / click to replace';
      refreshBtn();
    };
    reader.readAsText(f);
  }
  fileInput.addEventListener('change', (e) => acceptFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { fileInput.files = e.dataTransfer.files; acceptFile(f); }
  });

  const teamInput = $('#team');
  teamInput.addEventListener('input', refreshBtn);

  function refreshBtn() {
    const btn = $('#scoreBtn');
    const ready = solution && fileText && teamInput.value.trim().length > 0;
    btn.disabled = !ready;
    if (solutionErr) {
      btn.disabled = true;
      btn.textContent = '答案加载失败 · 请刷新';
    }
  }

  // ---- 评分 ----------------------------------------------------------------
  $('#scoreBtn').addEventListener('click', () => {
    const team = teamInput.value.trim();
    if (!team || !fileText || !solution) return;
    const res = window.GWScore.scoreSubmission(fileText, solution);
    renderReadout(team, res);
    if (res.ok) {
      saveScore(team, res.score, res.auc);
      renderBoard(team);
    }
  });

  // ---- 结果面板 ------------------------------------------------------------
  function renderReadout(team, res) {
    const el = $('#readout');
    el.classList.remove('idle');
    if (!res.ok) {
      el.innerHTML =
        '<div class="score-wrap"><div class="score-lab">评分失败 / Cannot score</div></div>' +
        '<div class="errs">' + res.errors.map((e) =>
          '<div class="err">✕ ' + escapeHtml(e) + '</div>').join('') + '</div>';
      return;
    }
    const warn = [];
    if (res.extra > 0) warn.push('提交含 ' + res.extra + ' 个多余 id（已忽略）/ ' + res.extra + ' extra id(s) ignored');
    res.errors.forEach((e) => warn.push(e));
    el.innerHTML =
      '<div class="score-wrap">' +
        '<div class="score-lab">得分 SCORE</div>' +
        '<div class="score" id="scoreNum">0.0</div>' +
        '<div class="team-echo">团队 <b>' + escapeHtml(team) + '</b></div>' +
      '</div>' +
      '<div class="metrics">' +
        '<div class="metric"><div class="v" id="aucVal">·</div><div class="k">ROC-AUC</div></div>' +
        '<div class="metric"><div class="v">' + res.matched + '</div><div class="k">窗数 Windows</div></div>' +
        '<div class="metric"><div class="v">100</div><div class="k">满分 Max</div></div>' +
      '</div>' +
      (warn.length ? '<div class="errs">' + warn.map((w) =>
        '<div class="err warn">! ' + escapeHtml(w) + '</div>').join('') + '</div>' : '');
    countUp($('#scoreNum'), res.score, 1);
    countUp($('#aucVal'), res.auc, 4);
  }

  function countUp(node, target, decimals) {
    const dur = 900, t0 = performance.now();
    function frame(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);           // easeOutCubic
      node.textContent = (target * e).toFixed(decimals);
      if (k < 1) requestAnimationFrame(frame);
      else node.textContent = target.toFixed(decimals);
    }
    requestAnimationFrame(frame);
  }

  // ---- 排行榜（localStorage；每队保留最高分）------------------------------
  function loadLB() {
    try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveScore(team, score, auc) {
    const lb = loadLB();
    const key = team.toLowerCase();
    const existing = lb.find((r) => r.team.toLowerCase() === key);
    const now = Date.now();
    if (existing) {
      if (score > existing.score) { existing.score = score; existing.auc = auc; existing.ts = now; }
      existing.tries = (existing.tries || 1) + 1;
    } else {
      lb.push({ team: team, score: score, auc: auc, ts: now, tries: 1 });
    }
    localStorage.setItem(LB_KEY, JSON.stringify(lb));
  }
  function renderBoard(freshTeam) {
    const lb = loadLB().sort((a, b) => b.score - a.score || a.ts - b.ts);
    const body = $('#lbBody'), table = $('#lbTable'), empty = $('#lbEmpty');
    if (lb.length === 0) { table.hidden = true; empty.hidden = false; return; }
    table.hidden = false; empty.hidden = true;
    body.innerHTML = lb.map((r, i) => {
      const fresh = freshTeam && r.team.toLowerCase() === freshTeam.toLowerCase();
      return '<tr class="' + (fresh ? 'fresh' : '') + '">' +
        '<td class="rank ' + (i < 3 ? 'top' : '') + '">' + (i + 1) + '</td>' +
        '<td class="team">' + escapeHtml(r.team) + '</td>' +
        '<td class="num sc">' + r.score.toFixed(1) + '</td>' +
        '<td class="num auc">' + r.auc.toFixed(4) + '</td>' +
        '<td class="num when">' + fmtTime(r.ts) + '</td>' +
      '</tr>';
    }).join('');
  }
  $('#clearBtn').addEventListener('click', () => {
    if (confirm('清空本浏览器排行榜？此操作不可撤销。\nClear the local leaderboard? This cannot be undone.')) {
      localStorage.removeItem(LB_KEY); renderBoard();
    }
  });
  $('#exportBtn').addEventListener('click', () => {
    const lb = loadLB().sort((a, b) => b.score - a.score || a.ts - b.ts);
    if (!lb.length) { alert('排行榜为空 / Leaderboard is empty'); return; }
    let csv = 'rank,team,score,auc,submitted_at,tries\n';
    lb.forEach((r, i) => {
      csv += [i + 1, '"' + r.team.replace(/"/g, '""') + '"', r.score.toFixed(4),
        r.auc.toFixed(6), new Date(r.ts).toISOString(), r.tries || 1].join(',') + '\n';
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'gw_senior_leaderboard.csv'; a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---- 工具 ----------------------------------------------------------------
  function fmtTime(ts) {
    const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  renderBoard();

  // ---- 题图：引力波 chirp 波形动画 -----------------------------------------
  (function chirp() {
    const cv = document.getElementById('chirp');
    if (!cv) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = cv.getContext('2d');
    function resize() {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize(); window.addEventListener('resize', resize);

    // chirp：频率随时间上升、幅度先增后骤减（ringdown），像真实并合波形
    function wave(x, phase) {          // x∈[0,1]
      const f = 1.5 + Math.pow(x, 2.4) * 26;         // 上扬频率
      const env = Math.exp(-Math.pow((x - 0.72) * 3.1, 2)) * (0.35 + x * 0.75);
      return Math.sin(x * f * Math.PI * 2 + phase) * env;
    }
    let ph = 0;
    function draw() {
      const W = cv.clientWidth, H = cv.clientHeight, mid = H / 2;
      ctx.clearRect(0, 0, W, H);
      // 基线
      ctx.strokeStyle = 'rgba(120,150,200,.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      // 发光 chirp 轨迹
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(79,227,208,.15)');
      grad.addColorStop(0.68, 'rgba(79,227,208,.95)');
      grad.addColorStop(0.82, 'rgba(255,138,61,1)');
      grad.addColorStop(1, 'rgba(255,180,84,.25)');
      ctx.strokeStyle = grad; ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(79,227,208,.5)'; ctx.shadowBlur = 10;
      ctx.beginPath();
      const N = 480;
      for (let i = 0; i <= N; i++) {
        const x = i / N;
        const y = mid - wave(x, ph) * (H * 0.36);
        i ? ctx.lineTo(x * W, y) : ctx.moveTo(x * W, y);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      if (!reduce) { ph -= 0.045; requestAnimationFrame(draw); }
    }
    draw();
  })();
})();
