# 青年组 · 引力波事件识别挑战 — 公开评分台<br>Senior Group · GW Event-Detection Challenge — Public Scoring Station

一个**纯静态、零后端**的公开评分网站：任何人只要打开网址，就能上传自己的
`id,prediction` 提交文件，浏览器**本地即时**算出 ROC-AUC 得分，并以团队名记入排行榜。
通过 GitHub Actions 自动部署到 GitHub Pages。

A fully static, **backend-free** public scoring site. Anyone with the URL can upload an
`id,prediction` submission; the ROC-AUC score is computed **entirely in the browser** and
logged under a team name. Auto-deployed to GitHub Pages via GitHub Actions.

> 赛事已结束，本站为公开演示。评分在客户端完成，**答案文件 `data/solution.csv`
> 随站点公开**（供自测），因此排行榜仅供学习交流，不作正式名次依据。
> Competition closed; the answer key is public by design (client-side scoring), so the
> board is for practice, not official ranking.

---

## 它怎么工作 / How it works

1. 选手下载 `data/test_strain.npy`（1200×16384 的测试应变流），用自己的方法给每个
   8 秒窗打一个"含引力波信号的显著性/概率"分。
2. 写成 `id,prediction` 两列的 CSV（见 `data/sample_submission.csv`）。
3. 打开网站 → 填团队名 → 拖入 CSV → 点"计算得分"。
4. 浏览器读取 `data/solution.csv`(`id,label`)，用**平均秩 ROC-AUC**（与
   `sklearn.metrics.roc_auc_score` 逐位一致）算出 AUC，**得分 = AUC × 100**。
5. 成绩写入浏览器 `localStorage`，同队保留历史最高分。

评分核心在 [`scoring.js`](./scoring.js)，无 DOM 依赖，可用 Node 单测（见下）。

## 目录 / Layout

```
index.html            单页界面（提交 + 排行榜 + 赛题说明）
scoring.js            评分核心：CSV 解析 + 平均秩 AUC + 得分（纯函数，浏览器/Node 通用）
app.js                DOM 交互、localStorage 排行榜、chirp 波形题图
styles.css            深色"探测器控制台"主题
.nojekyll             关闭 Jekyll，原样发布 data/
.github/workflows/deploy.yml   GitHub Actions → Pages 自动部署
data/
  test_strain.npy         测试应变流 (1200, 16384)  —— 生成预测用
  train_strain.npy        训练应变流 (800, 16384)
  train_labels.csv        训练标签
  train_injections.csv    训练注入参数
  sample_submission.csv   提交模板 (id,prediction, 全 0.5)
  solution.csv            答案 (id,label) —— 客户端评分用（公开）
  template_bank.csv       模板库参数
  meta.json               数据规格
```

## 本地预览 / Run locally

`fetch()` 需要 http（不能用 `file://`）：

```bash
cd senior_public
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 评分自测 / Verify scoring (Node)

```bash
node -e '
const fs=require("fs"), {scoreSubmission,parseCSV}=require("./scoring.js");
const sol=new Map();
parseCSV(fs.readFileSync("data/solution.csv","utf8")).rows.slice(1)
  .forEach(([id,l])=>{ if(l==="0"||l==="1") sol.set(id,+l); });
let perfect="id,prediction\n"; sol.forEach((l,id)=>perfect+=id+","+l+"\n");
console.log("perfect AUC =", scoreSubmission(perfect,sol).auc);   // 1
'
```

## 部署 / Deployment

已通过 **GitHub Actions** 自动部署到 **GitHub Pages**：
每次 `git push` 到 `main`，`.github/workflows/deploy.yml` 就会把整个仓库根作为
静态站点发布。仓库 **Settings → Pages → Build and deployment → Source** 需设为
**GitHub Actions**（首次由部署脚本 `gh api ... build_type=workflow` 自动开启）。

Auto-deployed to GitHub Pages on every push to `main` via GitHub Actions — no build step,
the repo root *is* the site.
