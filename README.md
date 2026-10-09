# PaperReader AI V3 — PDF 阅读与段落识别修复

修复范围：PDF.js Canvas 多页滚动、宽度自适应、放大缩小、页码跳转、IntersectionObserver 懒渲染、透明可选中文字层；按坐标合并行与段落、双栏顺序、段落分类与调试框、段落点击定位。其他功能沿用 V2。

部署：将 index.html、style.css、app.js、README.md 上传至 GitHub Pages 仓库根目录并覆盖旧文件（不要直接上传 ZIP）。

PDF.js 3.11.174 当前通过 cdnjs 加载（首次联网需要能访问该 CDN）；不支持扫描 PDF OCR。双栏、公式、跨栏、脚注及复杂排版仍可能误判。段落数依论文而异，未提供测试 PDF，无法给出实际数目。缩放按钮为 PDF 阅读区域内缩放，Safari 系统双指手势行为由浏览器控制。
