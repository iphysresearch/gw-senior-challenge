/*
 * scoring.js —— 青年组「引力波事件识别」纯客户端评分核心（无 DOM 依赖）
 *
 * 评分口径（与组委会 evaluate.py 一致）：
 *   提交文件格式：id,prediction（prediction = 该 8s 窗含引力波信号的显著性/概率）
 *   与答案 solution.csv(id,label) 按 id 对齐 → 计算全体测试窗的单一 ROC-AUC
 *   最终得分 = AUC × 100（0–100 分）
 *
 * computeAUC 采用「平均秩」的 Mann–Whitney U 公式，正确处理并列(ties)，
 * 数值与 sklearn.metrics.roc_auc_score 逐位一致。
 *
 * 该文件同时可在浏览器(<script>)与 Node(module.exports) 中运行。
 */
(function (root) {
  'use strict';

  // 解析 CSV 文本 → { header:[...], rows:[[...], ...] }
  // 容忍：BOM、CRLF、行尾空白、空行、字段两侧空白
  function parseCSV(text) {
    const clean = String(text).replace(/^﻿/, '');
    const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
    const rows = lines.map((l) => l.split(',').map((c) => c.trim()));
    return { header: rows.length ? rows[0] : [], rows: rows };
  }

  // 从提交 CSV 文本解析出 Map<id(string), prediction(number)>。
  // - 首行若为表头(id,prediction 之类)则跳过；纯数字首行则当数据处理
  // - 只取前两列：第一列=id，第二列=prediction
  // 返回 { preds: Map, errors: [..] }
  function parseSubmission(text) {
    const { rows } = parseCSV(text);
    const errors = [];
    const preds = new Map();
    if (rows.length === 0) {
      errors.push('文件为空 / File is empty');
      return { preds, errors };
    }
    let start = 0;
    const first = rows[0];
    const firstNumeric = first.length >= 2 && isFinite(parseFloat(first[0])) &&
      isFinite(parseFloat(first[1])) && /^-?\d/.test(first[0]);
    if (!firstNumeric) start = 1; // 视首行为表头
    let dup = 0;
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2) {
        errors.push(`第 ${i + 1} 行列数不足（需 id,prediction）/ row ${i + 1} needs 2 columns`);
        continue;
      }
      const id = r[0];
      const p = parseFloat(r[1]);
      if (!isFinite(p)) {
        errors.push(`第 ${i + 1} 行 prediction 非数值：“${r[1]}” / non-numeric prediction`);
        continue;
      }
      if (preds.has(id)) dup++;
      preds.set(id, p); // 重复 id 取最后一次
    }
    if (dup > 0) errors.push(`发现 ${dup} 个重复 id（取最后一次）/ ${dup} duplicate id(s), last kept`);
    return { preds, errors };
  }

  // 平均秩 ROC-AUC：labels/scores 为等长数组（label ∈ {0,1}）。
  // 返回 AUC ∈ [0,1]；单一类别返回 NaN。
  function computeAUC(labels, scores) {
    const n = labels.length;
    const idx = Array.from({ length: n }, (_, i) => i);
    idx.sort((a, b) => scores[a] - scores[b]);
    // 分配平均秩（秩从 1 开始；并列取平均）
    const rank = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && scores[idx[j + 1]] === scores[idx[i]]) j++;
      const avg = (i + j) / 2 + 1; // (i..j) 的 1-based 平均秩
      for (let k = i; k <= j; k++) rank[idx[k]] = avg;
      i = j + 1;
    }
    let nPos = 0, nNeg = 0, sumRankPos = 0;
    for (let t = 0; t < n; t++) {
      if (labels[t] === 1) { nPos++; sumRankPos += rank[t]; }
      else nNeg++;
    }
    if (nPos === 0 || nNeg === 0) return NaN;
    return (sumRankPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
  }

  // 给定答案 solution(Map<id,label>) 与提交文本 → 完整评分结果。
  // 返回 { ok, auc, score, matched, total, missing, extra, errors }
  function scoreSubmission(submissionText, solution) {
    const { preds, errors } = parseSubmission(submissionText);
    const labels = [];
    const scores = [];
    let missing = 0;
    solution.forEach((label, id) => {
      if (preds.has(id)) {
        labels.push(label);
        scores.push(preds.get(id));
      } else {
        missing++;
      }
    });
    let extra = 0;
    preds.forEach((_v, id) => { if (!solution.has(id)) extra++; });

    const total = solution.size;
    if (missing > 0) {
      errors.unshift(
        `提交缺少 ${missing}/${total} 个测试窗的 prediction，无法评分 / ` +
        `submission is missing ${missing}/${total} predictions`);
      return { ok: false, auc: NaN, score: NaN, matched: total - missing, total, missing, extra, errors };
    }
    const auc = computeAUC(labels, scores);
    if (!isFinite(auc)) {
      errors.unshift('AUC 无法定义（答案单一类别？）/ AUC undefined');
      return { ok: false, auc: NaN, score: NaN, matched: total, total, missing, extra, errors };
    }
    return {
      ok: true,
      auc: auc,
      score: Math.max(0, Math.min(100, auc * 100)),
      matched: total,
      total: total,
      missing: 0,
      extra: extra,
      errors: errors,
    };
  }

  const api = { parseCSV, parseSubmission, computeAUC, scoreSubmission };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GWScore = api;
})(typeof window !== 'undefined' ? window : globalThis);
