const fs = require("node:fs");
const path = require("node:path");
const PptxGenJS = require("pptxgenjs");
const { imageSizingCrop, imageSizingContain } = require("/Users/bairen/.codex/skills/slide-skill/pptxgenjs_helpers/image.js");
const { safeOuterShadow } = require("/Users/bairen/.codex/skills/slide-skill/pptxgenjs_helpers/util.js");
const {
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = require("/Users/bairen/.codex/skills/slide-skill/pptxgenjs_helpers/layout.js");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "artifacts");
const outFile = path.join(outDir, "code-any-source-analysis.pptx");
const demoImage = path.join(repoRoot, "assets", "demo.png");

const COLORS = {
  ink: "13212E",
  subInk: "516170",
  softInk: "7B8792",
  paper: "F4F1EA",
  card: "FFFDF8",
  line: "D7D0C4",
  accent: "0E6E6E",
  accent2: "D86C45",
  accent3: "1E3F66",
  accent4: "F0B759",
  dark: "0F1720",
  white: "FFFFFF",
  success: "2E7D5B",
  warn: "C8821F",
  risk: "B64B44",
};

const FONT = {
  title: "Avenir Next",
  body: "PingFang SC",
  mono: "Menlo",
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function addNotes(slide, lines) {
  if (typeof slide.addNotes === "function") {
    slide.addNotes(lines.join("\n"));
  }
}

function setupPpt() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "OpenAI Codex";
  pptx.company = "OpenAI";
  pptx.subject = "code-any 源码分析";
  pptx.title = "code-any 源码分析";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: FONT.title,
    bodyFontFace: FONT.body,
    lang: "zh-CN",
  };
  pptx.defineLayout({ name: "WIDE_SAFE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE_SAFE";
  return pptx;
}

function addBackground(slide, tone = "paper") {
  slide.background = { color: COLORS[tone] || COLORS.paper };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.16,
    line: { color: COLORS.accent, transparency: 100 },
    fill: { color: COLORS.accent },
  });
  slide.addShape("rect", {
    x: 0,
    y: 7.28,
    w: 13.333,
    h: 0.22,
    line: { color: COLORS.dark, transparency: 100 },
    fill: { color: COLORS.dark },
  });
}

function addTitleBlock(slide, eyebrow, title, subtitle, pageNo, tone = "light") {
  const textColor = tone === "dark" ? COLORS.white : COLORS.ink;
  const subColor = tone === "dark" ? "D6E1EA" : COLORS.subInk;
  slide.addText(eyebrow, {
    x: 0.7, y: 0.42, w: 3.2, h: 0.25,
    fontFace: FONT.body, fontSize: 10, color: COLORS.accent2,
    bold: true, charSpace: 1.6,
  });
  slide.addText(title, {
    x: 0.7, y: 0.72, w: 8.8, h: 0.62,
    fontFace: FONT.title, fontSize: 24, bold: true, color: textColor,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.72, y: 1.34, w: 9.6, h: 0.42,
      fontFace: FONT.body, fontSize: 11, color: subColor,
    });
  }
  slide.addText(String(pageNo).padStart(2, "0"), {
    x: 12.1, y: 0.42, w: 0.55, h: 0.25,
    align: "right",
    fontFace: FONT.title, fontSize: 11, color: tone === "dark" ? "C6D3DD" : COLORS.softInk,
  });
}

function addFooter(slide, text = "code-any / source analysis") {
  slide.addText(text, {
    x: 0.72, y: 7.06, w: 4.6, h: 0.18,
    fontFace: FONT.body, fontSize: 8.5, color: "B6BDC4",
  });
}

function addCard(slide, x, y, w, h, opts = {}) {
  slide.addShape("roundRect", {
    x, y, w, h,
    rectRadius: 0.08,
    fill: { color: opts.fill || COLORS.card },
    line: { color: opts.line || COLORS.line, pt: opts.linePt || 1 },
    shadow: opts.shadow === false ? undefined : safeOuterShadow("000000", 0.18, 45, 2, 1),
  });
}

function addBulletList(slide, items, x, y, w, opts = {}) {
  const fontSize = opts.fontSize || 15;
  const lineGap = opts.lineGap || 0.46;
  items.forEach((item, index) => {
    slide.addText("•", {
      x, y: y + index * lineGap, w: 0.22, h: 0.24,
      fontFace: FONT.body, fontSize, color: opts.bulletColor || COLORS.accent,
      bold: true,
    });
    slide.addText(item, {
      x: x + 0.24, y: y + index * lineGap - 0.01, w: w - 0.24, h: 0.28,
      fontFace: FONT.body, fontSize, color: opts.color || COLORS.ink,
      breakLine: false,
    });
  });
}

function addStatCard(slide, x, y, w, h, value, label, accent) {
  addCard(slide, x, y, w, h, { fill: COLORS.card });
  slide.addShape("rect", {
    x: x + 0.16, y: y + 0.16, w: 0.08, h: h - 0.32,
    line: { color: accent, transparency: 100 },
    fill: { color: accent },
  });
  slide.addText(value, {
    x: x + 0.36, y: y + 0.28, w: w - 0.5, h: 0.34,
    fontFace: FONT.title, fontSize: 20, bold: true, color: COLORS.dark,
  });
  slide.addText(label, {
    x: x + 0.36, y: y + 0.72, w: w - 0.5, h: 0.22,
    fontFace: FONT.body, fontSize: 10.5, color: COLORS.subInk,
  });
}

function addCodeBlock(slide, title, code, x, y, w, h) {
  addCard(slide, x, y, w, h, { fill: "151B23", line: "2B3542" });
  slide.addText(title, {
    x: x + 0.2, y: y + 0.14, w: w - 0.4, h: 0.2,
    fontFace: FONT.body, fontSize: 9.5, color: "AAB5C2",
  });
  slide.addText(code, {
    x: x + 0.2, y: y + 0.42, w: w - 0.4, h: h - 0.56,
    fontFace: FONT.mono, fontSize: 10.5, color: COLORS.white,
    margin: 0.02,
    valign: "top",
    breakLine: false,
    fit: "shrink",
  });
}

function addArrow(slide, x1, y1, x2, y2, color = COLORS.accent3) {
  slide.addShape("line", {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color, pt: 1.5, endArrowType: "triangle" },
  });
}

function addNode(slide, x, y, w, h, title, body, fill, line) {
  addCard(slide, x, y, w, h, { fill, line });
  slide.addText(title, {
    x: x + 0.16, y: y + 0.14, w: w - 0.32, h: 0.22,
    fontFace: FONT.title, fontSize: 14, bold: true, color: COLORS.dark,
  });
  slide.addText(body, {
    x: x + 0.16, y: y + 0.42, w: w - 0.32, h: h - 0.56,
    fontFace: FONT.body, fontSize: 9.5, color: COLORS.subInk,
    valign: "mid",
  });
}

function finalizeSlide(slide, pptx) {
  warnIfSlideElementsOutOfBounds(slide, pptx);
}

function buildSlides(pptx) {
  let slide;

  slide = pptx.addSlide();
  slide.background = { color: COLORS.dark };
  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 7.5,
    line: { color: COLORS.dark, transparency: 100 },
    fill: { color: COLORS.dark },
  });
  slide.addShape("rect", {
    x: 7.6, y: 0, w: 5.733, h: 7.5,
    line: { color: COLORS.accent, transparency: 100 },
    fill: { color: "102E3B", transparency: 0 },
  });
  slide.addText("code-any\n源码分析", {
    x: 0.8, y: 1.08, w: 4.6, h: 1.3,
    fontFace: FONT.title, fontSize: 27, bold: true, color: COLORS.white,
    breakLine: false,
  });
  slide.addText("一个 Claude Code 风格终端编程代理的最小可运行实现", {
    x: 0.82, y: 2.55, w: 5.3, h: 0.5,
    fontFace: FONT.body, fontSize: 14, color: "D4DCE5",
  });
  addBulletList(slide, [
    "面向技术团队的架构与源码解构",
    "按实际调用链拆出关键模块与设计取舍",
    "重点关注 Explore、上下文预算、工具边界与测试",
  ], 0.86, 3.42, 5.7, { color: "E9EEF3", bulletColor: COLORS.accent4, fontSize: 14 });
  slide.addImage({
    path: demoImage,
    ...imageSizingCrop(demoImage, 7.95, 0.7, 4.75, 5.72),
  });
  slide.addShape("roundRect", {
    x: 8.16, y: 6.52, w: 4.3, h: 0.54,
    rectRadius: 0.08,
    fill: { color: COLORS.paper },
    line: { color: COLORS.paper, transparency: 100 },
  });
  slide.addText("15 页 / 平衡型结构 / 适合内部技术分享", {
    x: 8.4, y: 6.69, w: 3.9, h: 0.16,
    fontFace: FONT.body, fontSize: 11, color: COLORS.dark, align: "center",
  });
  addFooter(slide, "code-any / source analysis / 2026-04-01");
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "PROJECT POSITIONING", "01 这到底是什么项目", "不是聊天 CLI，而是一个面向 coding workflow 的 agent 骨架。", 2);
  addCard(slide, 0.72, 1.95, 5.15, 4.42);
  slide.addText("README 给出的四个核心关键词", {
    x: 1.0, y: 2.2, w: 3.2, h: 0.24,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "Agent 循环：模型与工具多轮往返",
    "上下文工程：预算感知裁剪，控制噪声",
    "Explore 子代理：先低成本收集上下文",
    "工具输出分离：原始输出留本地，摘要进模型",
  ], 1.02, 2.62, 4.35, { fontSize: 13.5 });
  addCard(slide, 6.15, 1.95, 6.46, 4.42, { fill: "FFF9F2" });
  slide.addText("一句话理解", {
    x: 6.42, y: 2.2, w: 2.0, h: 0.24,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  slide.addText("code-any 用很少的 TypeScript 代码，把一个 coding agent 最关键的运行约束完整串了起来：", {
    x: 6.42, y: 2.62, w: 5.66, h: 0.44,
    fontFace: FONT.body, fontSize: 14, color: COLORS.ink,
  });
  addBulletList(slide, [
    "终端 REPL 交互",
    "Anthropic 流式 provider",
    "工具注册与执行",
    "审批与 yolo 模式",
    "子代理探索",
    "上下文裁剪和消息构建",
  ], 6.42, 3.34, 5.42, { fontSize: 13.5, bulletColor: COLORS.accent2 });
  slide.addText("这使它更像“教学级架构样板”，而不是“产品功能堆叠”。", {
    x: 6.42, y: 5.94, w: 5.4, h: 0.22,
    fontFace: FONT.body, fontSize: 13, color: COLORS.subInk,
    italic: true,
  });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "REPO SNAPSHOT", "02 代码库轮廓", "从体量和目录结构看，它明显是一个“收敛范围”的实验性实现。", 3);
  addStatCard(slide, 0.9, 1.95, 2.35, 1.25, "65", "TS 文件总数（src + tests）", COLORS.accent);
  addStatCard(slide, 3.5, 1.95, 2.35, 1.25, "2581", "源码行数（src）", COLORS.accent2);
  addStatCard(slide, 6.1, 1.95, 2.35, 1.25, "1666", "测试行数（tests）", COLORS.accent3);
  addStatCard(slide, 8.7, 1.95, 2.35, 1.25, "6", "内置工具数量", COLORS.accent4);
  addStatCard(slide, 11.3, 1.95, 1.15, 1.25, "1", "Provider", COLORS.success);
  addCard(slide, 0.92, 3.55, 5.25, 2.68);
  slide.addText("目录责任拆分", {
    x: 1.18, y: 3.82, w: 2.0, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "cli：REPL、命令解析、终端渲染、启动参数",
    "agent：主循环、审批、任务整形、Explore 子代理",
    "context：预算控制、消息构建、结果裁剪",
    "provider：Anthropic SDK 与流式事件映射",
    "tools：6 个工作区工具与统一注册表",
    "tests：单测 + 集成测试双层保护",
  ], 1.18, 4.18, 4.65, { fontSize: 12.8 });
  addCodeBlock(slide, "src/ 目录", [
    "src/",
    "  agent/",
    "  cli/",
    "  context/",
    "  provider/",
    "  tools/",
    "  utils/",
    "  index.ts",
  ].join("\n"), 6.5, 3.55, 2.25, 2.68);
  addCodeBlock(slide, "tests/ 目录", [
    "tests/",
    "  agent/",
    "  cli/",
    "  context/",
    "  integration/",
    "  provider/",
    "  tools/",
    "  utils/",
  ].join("\n"), 8.98, 3.55, 2.1, 2.68);
  addCard(slide, 11.34, 3.55, 1.3, 2.68, { fill: "F6F1E6" });
  slide.addText("判断", {
    x: 11.53, y: 3.86, w: 0.9, h: 0.22,
    fontFace: FONT.title, fontSize: 14, bold: true, color: COLORS.dark,
  });
  slide.addText("模块分工已经比较成熟，但 provider 和工具生态仍刻意收缩，目的是让主线设计保持清晰。", {
    x: 11.52, y: 4.26, w: 0.82, h: 1.6,
    fontFace: FONT.body, fontSize: 10.2, color: COLORS.subInk,
    valign: "mid",
    fit: "shrink",
  });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "BOOTSTRAP", "03 启动与装配路径", "入口文件本身很薄，价值在于把运行时依赖一次性装配完整。", 4);
  addNode(slide, 0.82, 2.0, 1.8, 1.0, "CLI Flags", "解析 --help / --version / --model / --yolo", "F8EEE7", "E3C5B5");
  addNode(slide, 2.95, 2.0, 1.8, 1.0, "Config", "读取 cwd、模型、token 与审批模式", "EEF7F3", "BED7C7");
  addNode(slide, 5.08, 2.0, 1.8, 1.0, "Context", "创建 ContextBudgetManager 与 ToolContext", "EEF4FA", "C4D4E8");
  addNode(slide, 7.21, 2.0, 1.8, 1.0, "Provider", "包装 Anthropic SDK 与流式事件源", "F8EEE7", "E3C5B5");
  addNode(slide, 9.34, 2.0, 1.8, 1.0, "Session", "记录模型、审批状态、消息历史", "EEF7F3", "BED7C7");
  addNode(slide, 11.47, 2.0, 1.05, 1.0, "REPL", "进入交互循环", "EEF4FA", "C4D4E8");
  addArrow(slide, 2.62, 2.5, 2.95, 2.5);
  addArrow(slide, 4.75, 2.5, 5.08, 2.5);
  addArrow(slide, 6.88, 2.5, 7.21, 2.5);
  addArrow(slide, 9.01, 2.5, 9.34, 2.5);
  addArrow(slide, 11.14, 2.5, 11.47, 2.5);
  addCodeBlock(slide, "index.ts 的角色", [
    "const budgetManager = new ContextBudgetManager();",
    "const toolContext = createDefaultToolContext(...);",
    "const registry = createToolRegistry();",
    "const provider = createAnthropicProvider(...);",
    "const session = createSessionState(...);",
    "await runInteractiveRepl(...);",
  ].join("\n"), 0.92, 4.1, 5.35, 2.2);
  addCard(slide, 6.6, 4.1, 5.96, 2.2);
  slide.addText("设计含义", {
    x: 6.88, y: 4.36, w: 1.6, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "入口不承载业务逻辑，降低耦合。",
    "上下文预算、工具上下文、provider、session 都是显式依赖。",
    "后续替换 provider 或工具集时，不需要改 REPL 主结构。",
  ], 6.88, 4.76, 5.2, { fontSize: 13.2 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "INTERACTION LAYER", "04 交互层：REPL 与斜杠命令", "用户输入只有两类：控制命令，或交给 agent loop 的自然语言任务。", 5);
  addCard(slide, 0.9, 2.0, 3.65, 4.25);
  slide.addText("命令面", {
    x: 1.16, y: 2.24, w: 1.0, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "/help / /tools / /model",
    "/approval / /diff",
    "/clear / /exit",
  ], 1.18, 2.7, 2.85, { fontSize: 14 });
  slide.addText("这些命令不走模型，直接在本地处理。", {
    x: 1.18, y: 4.38, w: 2.9, h: 0.28,
    fontFace: FONT.body, fontSize: 12.5, color: COLORS.subInk,
  });
  addCard(slide, 4.82, 2.0, 3.95, 4.25, { fill: "F9F4EC" });
  slide.addText("输入分流", {
    x: 5.1, y: 2.24, w: 1.2, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addCodeBlock(slide, "commands.ts", [
    "if (trimmed.startsWith('/')) {",
    "  return { kind: 'command', name, args };",
    "}",
    "return { kind: 'prompt', text: input };",
  ].join("\n"), 5.06, 2.68, 3.45, 1.7);
  slide.addText("这个分界很重要：把 REPL 控制面和 agent 推理面彻底分离。", {
    x: 5.08, y: 4.74, w: 3.2, h: 0.55,
    fontFace: FONT.body, fontSize: 12.4, color: COLORS.subInk,
  });
  addCard(slide, 9.02, 2.0, 3.6, 4.25);
  slide.addText("运行时状态线", {
    x: 9.28, y: 2.24, w: 1.6, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "启动时打印模型、审批模式和 yolo 状态",
    "执行中持续渲染 progress line",
    "脚本模式与交互模式共用同一套 runtime",
  ], 9.28, 2.7, 2.95, { fontSize: 12.8 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "MAIN FLOW", "05 一次任务如何跑完", "真正的主链路在 runAgentLoop：它决定先探索、再推理、再执行工具。", 6);
  const seqY = 2.45;
  ["用户输入", "shapeTask", "Explore?", "主模型", "ToolRegistry", "回填消息", "最终回答"].forEach((label, i) => {
    const x = 0.75 + i * 1.82;
    addNode(slide, x, seqY, 1.42, 0.9, label, "", i % 2 === 0 ? "EEF4FA" : "F8EEE7", i % 2 === 0 ? "C4D4E8" : "E3C5B5");
    if (i < 6) {
      addArrow(slide, x + 1.42, seqY + 0.45, x + 1.82, seqY + 0.45, COLORS.accent2);
    }
  });
  addCard(slide, 0.9, 4.15, 5.65, 2.05);
  slide.addText("主循环做了三件事", {
    x: 1.18, y: 4.42, w: 2.0, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "维护 session 消息历史，并在每轮发送前通过 budget manager 裁剪。",
    "接受 provider 流式事件，区分 text、tool_use、done 三种内部事件。",
    "当出现 tool_use 时，把工具结果封装成 tool_result 再回注入会话。",
  ], 1.18, 4.82, 5.0, { fontSize: 12.7 });
  addCodeBlock(slide, "run-agent-loop.ts", [
    "for (let iteration = 0; iteration < maxIterations; iteration += 1) {",
    "  const messages = buildMessages(session.messages, budgetManager);",
    "  const response = await provider.send(...);",
    "  for await (const event of response.events) { ... }",
    "  if (!sawToolUse) break;",
    "}",
  ].join("\n"), 6.82, 4.15, 5.76, 2.05);
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "CORE ENGINE", "06 runAgentLoop 为什么是系统中枢", "它不是简单的 while-loop，而是产品行为、上下文工程和工具边界的汇合点。", 7);
  addCard(slide, 0.92, 2.0, 4.2, 4.2);
  slide.addText("职责集中在这里", {
    x: 1.2, y: 2.26, w: 1.8, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "接入 `shapeTask` 的任务改写结果",
    "按 `shouldUseExplore` 决定是否先走探索子代理",
    "把 `messagesSentToMainModel` 保留下来供 debug 追踪",
    "处理审批阻断，生成对用户可读的 blocked message",
    "控制最大迭代次数，避免无限循环",
  ], 1.2, 2.68, 3.52, { fontSize: 12.8 });
  addCodeBlock(slide, "被忽略但很重要的一段", [
    "if (toolResult.status === 'requires_approval') {",
    "  const finalText = buildApprovalRequiredMessage(...);",
    "  session = appendMessage(session, { role: 'assistant', content: finalText });",
    "  return { finalText, ... };",
    "}",
  ].join("\n"), 5.44, 2.0, 3.35, 2.05);
  addCard(slide, 5.44, 4.3, 3.35, 1.9, { fill: "EEF7F3" });
  slide.addText("这意味着审批不是外围逻辑，而是 agent loop 的内建分支。", {
    x: 5.68, y: 4.76, w: 2.84, h: 0.72,
    fontFace: FONT.body, fontSize: 12.4, color: COLORS.ink,
    valign: "mid",
  });
  addCard(slide, 9.05, 2.0, 3.52, 4.2, { fill: "FFF9F2" });
  slide.addText("工程判断", {
    x: 9.34, y: 2.26, w: 1.3, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "主循环既暴露足够多的状态，又保持 API 面很小。",
    "它让 debug、测试和未来的多 provider 扩展都有落点。",
    "缺点是功能持续增加后，`runAgentLoop.ts` 会成为最先膨胀的文件。",
  ], 9.34, 2.72, 2.92, { fontSize: 12.8, bulletColor: COLORS.accent2 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "EXPLORE SUBAGENT", "07 Explore 子代理：先廉价探索，再让主代理决策", "这是项目最像 Claude Code 思路的地方，也是控制主会话上下文的关键。", 8);
  addCard(slide, 0.92, 2.0, 3.7, 4.25);
  slide.addText("触发条件", {
    x: 1.18, y: 2.28, w: 1.2, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "用户输入出现“深入 / 全面 / 梳理 / trace”等广域意图",
    "初始搜索结果太多",
    "仓库体量较大",
  ], 1.18, 2.78, 3.0, { fontSize: 13 });
  slide.addText("这里是启发式决策，不是复杂 planner。", {
    x: 1.18, y: 4.65, w: 2.8, h: 0.26,
    fontFace: FONT.body, fontSize: 12, color: COLORS.subInk,
  });
  addCodeBlock(slide, "Explore 返回结构", [
    "{",
    '  "candidatePaths": [...],',
    '  "searchSummary": [...],',
    '  "recommendedNextReads": [...],',
    '  "risks": [...]',
    "}",
  ].join("\n"), 4.92, 2.0, 2.85, 2.1);
  addCard(slide, 4.92, 4.38, 2.85, 1.87, { fill: "EEF7F3" });
  slide.addText("且 Explore 工具集被刻意缩成只读版：\n仅 `list_files` / `read_file` / `search_code`。", {
    x: 5.18, y: 4.82, w: 2.34, h: 0.72,
    fontFace: FONT.body, fontSize: 12.3, color: COLORS.ink,
    valign: "mid",
  });
  addCard(slide, 8.02, 2.0, 4.56, 4.25, { fill: "FFF9F2" });
  slide.addText("设计价值", {
    x: 8.32, y: 2.28, w: 1.2, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "把“查哪里”与“怎么做”分成两个推理阶段。",
    "把大范围探索交给更便宜的模型，主模型只吃结构化结果。",
    "通过单独 registry，把子代理权限天然收紧。",
    "局限是触发条件较粗糙，还缺少质量反馈闭环。",
  ], 8.32, 2.78, 3.85, { fontSize: 12.8 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "CONTEXT ENGINEERING", "08 上下文预算与裁剪策略", "项目最值得复用的经验，不是某个工具，而是这套“只把有价值内容送进模型”的原则。", 9);
  addCard(slide, 0.92, 2.0, 3.1, 4.25);
  slide.addText("默认预算", {
    x: 1.18, y: 2.28, w: 1.2, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "tool 输出上限：4000 chars",
    "shell / diff 更小：3000 chars",
    "历史消息保留：12 条",
    "单条消息上限：6000 chars",
  ], 1.18, 2.76, 2.5, { fontSize: 13 });
  addCard(slide, 4.35, 2.0, 4.0, 4.25, { fill: "EEF4FA" });
  slide.addText("clipHistory 的细节值得注意", {
    x: 4.62, y: 2.28, w: 2.4, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "总是保留第一条 user message，也就是原始问题。",
    "裁剪尾部时避免从 tool message 开始，防止 orphan tool_result。",
    "这两个约束都在防止“上下文看起来还在，但逻辑断裂”。",
  ], 4.62, 2.78, 3.3, { fontSize: 12.6 });
  addCodeBlock(slide, "truncateText 的输出形式", [
    "[truncated output: N chars]",
    "<开头窗口>",
    "...",
    "<结尾窗口>",
  ].join("\n"), 8.72, 2.0, 3.85, 2.0);
  addCard(slide, 8.72, 4.28, 3.85, 1.97, { fill: "FFF9F2" });
  slide.addText("这说明项目选择的是“可解释截断”而不是静默丢弃。对 agent 系统来说，这一点非常关键。", {
    x: 8.98, y: 4.78, w: 3.3, h: 0.66,
    fontFace: FONT.body, fontSize: 12.2, color: COLORS.ink,
    valign: "mid",
  });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "TOOL BOUNDARY", "09 工具执行、摘要回填与审批边界", "项目没有把 tool output 直接塞回模型，而是先做封装和去敏。", 10);
  addCard(slide, 0.92, 2.0, 4.02, 4.3);
  slide.addText("ToolRegistry 统一负责", {
    x: 1.18, y: 2.28, w: 1.9, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "注册工具实现与 schema",
    "执行前走审批判断",
    "执行后统一返回 envelope",
    "异常统一包装成 failed tool result",
  ], 1.18, 2.78, 3.3, { fontSize: 12.9 });
  addCard(slide, 5.22, 2.0, 3.1, 4.3, { fill: "EEF7F3" });
  slide.addText("6 个工具", {
    x: 5.5, y: 2.28, w: 1.0, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "list_files",
    "read_file",
    "search_code",
    "write_file",
    "run_shell",
    "diff_workspace",
  ], 5.5, 2.8, 2.1, { fontSize: 13.2, bulletColor: COLORS.accent2 });
  slide.addText("其中 `write_file` 与 `run_shell` 被定义为危险工具。", {
    x: 5.5, y: 5.7, w: 2.25, h: 0.26,
    fontFace: FONT.body, fontSize: 11.8, color: COLORS.subInk,
  });
  addCard(slide, 8.58, 2.0, 4.0, 4.3, { fill: "FFF9F2" });
  slide.addText("message-builder 的关键动作", {
    x: 8.86, y: 2.28, w: 2.3, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "把 tool result 变成 provider 可消费的 `tool_result` 消息。",
    "过滤 metadata 里的 stdout / stderr / rawOutput。",
    "长字符串 metadata 只保留头尾，继续压缩噪声。",
    "把模型可见信息限制在 `status / summary / truncation / metadata`。",
  ], 8.86, 2.78, 3.28, { fontSize: 12.3 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "PROVIDER ADAPTER", "10 Provider 流式适配层", "内部只保留三种 ProviderEvent，说明项目刻意收窄了上层对底层 SDK 的耦合。", 11);
  addCard(slide, 0.92, 2.05, 5.25, 4.15);
  slide.addText("Anthropic stream event", {
    x: 1.18, y: 2.34, w: 2.0, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addNode(slide, 1.18, 2.92, 1.25, 0.8, "text_delta", "文本增量", "EEF4FA", "C4D4E8");
  addNode(slide, 2.72, 2.92, 1.45, 0.8, "tool_use start", "工具开始", "F8EEE7", "E3C5B5");
  addNode(slide, 4.46, 2.92, 1.25, 0.8, "json_delta", "工具参数片段", "EEF7F3", "BED7C7");
  addNode(slide, 2.72, 4.28, 1.45, 0.8, "block_stop", "工具块结束", "FFF9F2", "E7D7B9");
  addArrow(slide, 2.43, 3.32, 2.72, 3.32, COLORS.accent3);
  addArrow(slide, 4.17, 3.32, 4.46, 3.32, COLORS.accent3);
  addArrow(slide, 4.46, 3.72, 4.17, 4.28, COLORS.accent3);
  addArrow(slide, 2.72, 3.72, 3.44, 4.28, COLORS.accent3);
  slide.addText("mapAnthropicStreamEvents 会把它们统一映射成：\ntext / tool_use / done", {
    x: 1.18, y: 5.15, w: 4.2, h: 0.55,
    fontFace: FONT.body, fontSize: 13.4, color: COLORS.ink,
  });
  addCard(slide, 6.48, 2.05, 6.08, 4.15, { fill: "FFF9F2" });
  slide.addText("为什么这层抽象值得保留", {
    x: 6.76, y: 2.34, w: 2.4, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "上层 agent loop 不需要理解 Anthropic 原始事件细节。",
    "tool input 的 JSON 增量被收敛为一个完整 `input` 对象。",
    "未来替换 provider 时，只要继续输出这三类内部事件即可。",
    "代价是 provider 能力被裁平，复杂特性不一定能直接暴露出来。",
  ], 6.76, 2.84, 5.2, { fontSize: 12.6 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "TESTING", "11 测试面覆盖了什么", "这个项目虽然小，但测试分层比很多实验性仓库更完整。", 12);
  addStatCard(slide, 0.9, 2.05, 2.35, 1.2, "29", "测试文件数量", COLORS.accent);
  addStatCard(slide, 3.5, 2.05, 2.35, 1.2, "1666", "测试行数", COLORS.accent2);
  addStatCard(slide, 6.1, 2.05, 2.35, 1.2, "5", "integration 测试", COLORS.accent3);
  addStatCard(slide, 8.7, 2.05, 3.05, 1.2, "context regression", "专门覆盖上下文相关回归", COLORS.success);
  addCard(slide, 0.92, 3.7, 3.6, 2.55);
  slide.addText("单元测试", {
    x: 1.18, y: 3.96, w: 1.0, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "approval / parser / render",
    "budget manager / message builder",
    "provider stream mapping",
    "每个工具各自测试",
  ], 1.18, 4.4, 2.85, { fontSize: 12.7 });
  addCard(slide, 4.86, 3.7, 3.6, 2.55, { fill: "EEF7F3" });
  slide.addText("集成测试", {
    x: 5.12, y: 3.96, w: 1.0, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "agent loop 主流程",
    "explore flow / subagent",
    "debug message flow",
    "context regression",
  ], 5.12, 4.4, 2.9, { fontSize: 12.7 });
  addCard(slide, 8.8, 3.7, 3.78, 2.55, { fill: "FFF9F2" });
  slide.addText("这说明什么", {
    x: 9.08, y: 3.96, w: 1.2, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "作者知道最容易坏的是消息流和上下文边界。",
    "测试重点并不在 UI，而在运行时行为是否稳定。",
    "这与项目定位高度一致。",
  ], 9.08, 4.4, 3.0, { fontSize: 12.5, bulletColor: COLORS.accent2 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "STRENGTHS", "12 这个项目的设计亮点", "如果把它当成“如何实现最小 coding agent”的参考样板，价值非常高。", 13);
  addCard(slide, 0.92, 2.05, 2.82, 1.75, { fill: "EEF4FA" });
  addCard(slide, 3.95, 2.05, 2.82, 1.75, { fill: "F8EEE7" });
  addCard(slide, 6.98, 2.05, 2.82, 1.75, { fill: "EEF7F3" });
  addCard(slide, 10.01, 2.05, 2.6, 1.75, { fill: "FFF9F2" });
  [
    ["边界清楚", "REPL、loop、provider、tools、context 分层很干净"],
    ["上下文意识强", "从设计开始就把预算与裁剪当成一等能力"],
    ["子代理克制", "只做 Explore，且权限受限，没有盲目多 agent 化"],
    ["测试方向对", "把回归风险集中在消息流与运行时行为"],
  ].forEach((item, idx) => {
    const x = [1.16, 4.19, 7.22, 10.25][idx];
    slide.addText(item[0], {
      x, y: 2.42, w: 2.1, h: 0.22,
      fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
    });
    slide.addText(item[1], {
      x, y: 2.86, w: idx === 3 ? 2.1 : 2.32, h: 0.55,
      fontFace: FONT.body, fontSize: 11.8, color: COLORS.subInk,
    });
  });
  addCard(slide, 0.92, 4.18, 11.7, 2.02);
  slide.addText("核心结论", {
    x: 1.2, y: 4.46, w: 1.4, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  slide.addText("这不是一个靠功能数量取胜的项目，而是一个靠“关键约束都在正确位置上”取胜的项目。对于内部技术分享，这类代码比大型框架更适合拆解，因为每一层设计意图都还能看得见。", {
    x: 1.2, y: 4.94, w: 10.95, h: 0.72,
    fontFace: FONT.body, fontSize: 13.4, color: COLORS.ink,
    valign: "mid",
  });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  addBackground(slide);
  addTitleBlock(slide, "LIMITS", "13 局限与下一步演进", "优点成立的前提，是它还刻意保持“小而克制”。", 14);
  addCard(slide, 0.92, 2.02, 2.82, 1.85, { fill: "FFF6F4" });
  addCard(slide, 3.95, 2.02, 2.82, 1.85, { fill: "FFF6F4" });
  addCard(slide, 6.98, 2.02, 2.82, 1.85, { fill: "FFF6F4" });
  addCard(slide, 10.01, 2.02, 2.6, 1.85, { fill: "FFF6F4" });
  [
    ["Provider 单一", "目前几乎只围绕 Anthropic，抽象层足够但生态仍窄。"],
    ["Planner 简单", "Explore 触发规则偏启发式，缺少反馈回路和效果评估。"],
    ["工具集有限", "没有浏览器、补丁、并行工具等更复杂的能力。"],
    ["主循环会膨胀", "功能继续增多时，runAgentLoop 最先变重。"],
  ].forEach((item, idx) => {
    const x = [1.16, 4.19, 7.22, 10.25][idx];
    slide.addText(item[0], {
      x, y: 2.38, w: 2.05, h: 0.22,
      fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.risk,
    });
    slide.addText(item[1], {
      x, y: 2.82, w: idx === 3 ? 2.05 : 2.3, h: 0.62,
      fontFace: FONT.body, fontSize: 11.5, color: COLORS.subInk,
    });
  });
  addCard(slide, 0.92, 4.18, 11.7, 2.02, { fill: "EEF7F3" });
  slide.addText("更合理的下一步", {
    x: 1.2, y: 4.46, w: 1.8, h: 0.22,
    fontFace: FONT.title, fontSize: 15, bold: true, color: COLORS.dark,
  });
  addBulletList(slide, [
    "把 planner 从启发式升级成带成功率反馈的策略层。",
    "为工具结果增加更清晰的结构化摘要协议，而不是主要依赖文本摘要。",
    "继续保留边界清晰的前提下，再扩展 provider 与工具生态。",
    "在主循环外抽出更多状态机逻辑，防止核心文件持续膨胀。",
  ], 1.2, 4.92, 10.6, { fontSize: 12.8 });
  addFooter(slide);
  finalizeSlide(slide, pptx);

  slide = pptx.addSlide();
  slide.background = { color: COLORS.dark };
  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 7.5,
    line: { color: COLORS.dark, transparency: 100 },
    fill: { color: COLORS.dark },
  });
  slide.addText("结论", {
    x: 0.88, y: 0.86, w: 2.0, h: 0.4,
    fontFace: FONT.title, fontSize: 24, bold: true, color: COLORS.white,
  });
  slide.addText("code-any 的价值，不在于“做了多少功能”，\n而在于它把 coding agent 最关键的工程约束，放在了正确的位置上。", {
    x: 0.92, y: 1.7, w: 6.5, h: 1.1,
    fontFace: FONT.title, fontSize: 21, bold: true, color: COLORS.paper,
  });
  addBulletList(slide, [
    "可作为内部分享的 agent 架构入门样板",
    "可作为后续扩展更复杂工具链的基础代码",
    "也可作为“如何做上下文工程”的教学案例",
  ], 1.02, 3.5, 5.8, { color: "E2E8EF", bulletColor: COLORS.accent4, fontSize: 14 });
  slide.addShape("line", {
    x: 7.52, y: 1.12, w: 0, h: 5.18,
    line: { color: "365061", pt: 1.2 },
  });
  addCodeBlock(slide, "建议的讲法", [
    "1. 先讲它要解决的问题",
    "2. 再讲主链路和模块分层",
    "3. 最后挑 Explore / Budget / Tool Boundary 深挖",
    "",
    "这样 15 页刚好，不会变成逐文件念代码。",
  ].join("\n"), 8.08, 1.7, 4.25, 2.4);
  slide.addShape("roundRect", {
    x: 8.1, y: 4.58, w: 4.22, h: 1.1,
    rectRadius: 0.08,
    fill: { color: COLORS.accent },
    line: { color: COLORS.accent, transparency: 100 },
  });
  slide.addText("谢谢", {
    x: 8.1, y: 4.9, w: 4.22, h: 0.24,
    align: "center",
    fontFace: FONT.title, fontSize: 18, bold: true, color: COLORS.white,
  });
  slide.addText("artifacts/code-any-source-analysis.pptx", {
    x: 8.1, y: 5.96, w: 4.22, h: 0.18,
    align: "center",
    fontFace: FONT.body, fontSize: 9.5, color: "9FB2BF",
  });
  addFooter(slide, "code-any / source analysis / final slide");
  finalizeSlide(slide, pptx);

}

async function main() {
  ensureDir(outDir);
  const pptx = setupPpt();
  buildSlides(pptx);
  await pptx.writeFile({ fileName: outFile });
  console.log(`Wrote ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
