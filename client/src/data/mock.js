export const STAGE_META = [
  { name: "Input Acquisition", input: "wireframe.png", output: "asset_manifest.json", model: null, confidence: 99, warnings: [], duration: 180 },
  { name: "Preprocessing & Normalization", input: "asset_manifest.json", output: "normalized_regions.json", model: "cv-preprocess-v2", confidence: 93, warnings: ["Low-contrast scan upsampled 2\u00d7 before analysis."], duration: 420 },
  { name: "Multimodal Understanding", input: "normalized_regions.json", output: "region_labels.json", model: "vision-encoder-l14", confidence: 68, warnings: ["Ambiguous region near primary CTA."], duration: 610 },
  { name: "Semantic Planning", input: "region_labels.json", output: "component_plan.json", model: "planner-mini", confidence: 94, warnings: [], duration: 340 },
  { name: "Code Generation & Assembly", input: "component_plan.json", output: "Hero.jsx", model: "codegen-turbo", confidence: 91, warnings: [], duration: 980 },
  { name: "Validation & QA", input: "Hero.jsx", output: "qa_report.json", model: "qa-linter-v1", confidence: 88, warnings: [], duration: 460 },
  { name: "Output Delivery", input: "Hero.jsx + qa_report.json", output: "section_bundle.zip", model: null, confidence: 99, warnings: [], duration: 140 },
];

export const NEEDS_INPUT_STAGE = 2;
export const FAILED_STAGE = 4;
export const FAILED_MESSAGE = "Code generation stalled while assembling the CTA button component \u2014 the planner referenced a slot that doesn't exist in the layout tree. Try simplifying the wireframe or supplying a code reference.";

export const NEEDS_INPUT_QUESTION = {
  guessedLabel: "Primary CTA button",
  confidence: 68,
  choices: ["Primary CTA button", "Secondary nav link", "Decorative badge"],
};

export const jobs = [
  { id: "j1", name: "SaaS landing hero", mode: "Wireframe", time: "2 min ago" },
  { id: "j2", name: "Pricing comparison", mode: "Prompt", time: "Yesterday" },
  { id: "j3", name: "Dashboard shell", mode: "Code", time: "Monday" },
];

export const CANVAS_W = 760;
export const CANVAS_H = 420;

export const ELEMENT_LABELS = { headline: "Headline", subtext: "Supporting copy", cta: "CTA label", image: "Image block" };

export const defaultElements = [
  { id: "headline", type: "text", tag: "h1", content: "Ship work that moves the world.", x: 40, y: 46, width: 440, height: null, fontSize: 38, fontWeight: 650, color: "#18181b", bg: "", align: "left", padding: 0 },
  { id: "subtext", type: "text", tag: "p", content: "A calmer, clearer workspace for teams who build what comes next.", x: 40, y: 150, width: 380, height: null, fontSize: 15, fontWeight: 400, color: "#52525b", bg: "", align: "left", padding: 0 },
  { id: "cta", type: "button", tag: "button", content: "Start building", x: 40, y: 224, width: 160, height: null, fontSize: 13, fontWeight: 600, color: "#ffffff", bg: "", align: "center", padding: 12 },
  { id: "image", type: "image", tag: "div", content: "", x: 470, y: 46, width: 250, height: 190, fontSize: 0, fontWeight: 400, color: "", bg: "#e5e5e0", align: "center", padding: 0 },
];

export function getStageStatuses(jobState, runningIndex) {
  return STAGE_META.map((meta, i) => {
    let status = "pending";
    let duration = null;
    if (jobState === "running") {
      if (i < runningIndex) { status = i === 1 ? "degraded" : "ok"; duration = meta.duration; }
      else if (i === runningIndex) status = "running";
    } else if (jobState === "needs-input") {
      if (i < NEEDS_INPUT_STAGE) { status = "ok"; duration = meta.duration; }
      else if (i === NEEDS_INPUT_STAGE) status = "running";
    } else if (jobState === "done") {
      status = "ok"; duration = meta.duration;
    } else if (jobState === "failed") {
      if (i < FAILED_STAGE) { status = "ok"; duration = meta.duration; }
      else if (i === FAILED_STAGE) status = "failed";
    }
    return { ...meta, status, duration };
  });
}

export function downloadCode(code, filename = "Hero.jsx") {
  const blob = new Blob([code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function effectiveBg(el, color) {
  return el.bg || (el.type === "button" ? color : el.type === "image" ? "#e5e5e0" : "transparent");
}

export function generateCode(elements, accent) {
  const color = /^#[0-9a-fA-F]{3,8}$/.test(accent || "") ? accent : "#3b82f6";
  const lines = elements.map(el => {
    const parts = [
      `position: "absolute"`, `left: ${el.x}`, `top: ${el.y}`, `width: ${el.width}`,
      ...(el.height ? [`height: ${el.height}`] : []),
      ...(el.type !== "image" ? [`fontSize: ${el.fontSize}`, `fontWeight: ${el.fontWeight}`, `color: "${el.color}"`, `textAlign: "${el.align}"`] : []),
      `background: "${effectiveBg(el, color)}"`,
      `padding: ${el.padding}`,
      `borderRadius: ${el.type === "button" ? 7 : el.type === "image" ? 6 : 0}`,
    ].join(", ");
    return `      <${el.tag} data-el="${el.id}" style={{ ${parts} }}>${el.type === "image" ? "" : el.content}</${el.tag}>`;
  }).join("\n");
  return `export function Hero() {\n  return (\n    <section className="hero" style={{ position: "relative" }}>\n${lines}\n    </section>\n  );\n}`;
}

export function parseCodeToElements(code, elements, accent) {
  const color = /^#[0-9a-fA-F]{3,8}$/.test(accent || "") ? accent : "#3b82f6";
  let changed = false;
  const next = elements.map(el => {
    const block = code.match(new RegExp(`data-el="${el.id}"[^>]*style=\\{\\{([^}]*)\\}\\}[^>]*>([\\s\\S]*?)<\\/`));
    if (!block) return el;
    const styleStr = block[1];
    const text = block[2].trim();
    const num = key => { const m = styleStr.match(new RegExp(`${key}:\\s*(-?\\d+(?:\\.\\d+)?)`)); return m ? parseFloat(m[1]) : undefined; };
    const str = key => { const m = styleStr.match(new RegExp(`${key}:\\s*"([^"]*)"`)); return m ? m[1] : undefined; };
    const patch = {};
    ["left", "top", "width", "height", "fontSize", "fontWeight", "padding"].forEach(k => {
      const v = num(k);
      if (v !== undefined) patch[{ left: "x", top: "y" }[k] || k] = v;
    });
    const bgParsed = str("background");
    if (bgParsed !== undefined) {
      const inherited = effectiveBg({ ...el, bg: "" }, color);
      patch.bg = bgParsed === inherited ? "" : bgParsed;
    }
    const color2 = str("color"); if (color2 !== undefined) patch.color = color2;
    const align = str("textAlign"); if (align !== undefined) patch.align = align;
    if (el.type !== "image" && text !== el.content) patch.content = text;
    if (Object.keys(patch).length) { changed = true; return { ...el, ...patch }; }
    return el;
  });
  return changed ? next : null;
}

export function buildPreviewDoc({ page, section, elements, accent }) {
  const color = /^#[0-9a-fA-F]{3,8}$/.test(accent || "") ? accent : "#3b82f6";
  const safePage = escapeHtml(page);
  const safeSection = escapeHtml(section);
  const blocks = elements.map(el => {
    const style = [
      "position:absolute", `left:${el.x}px`, `top:${el.y}px`, `width:${el.width}px`,
      el.height ? `height:${el.height}px` : "",
      el.type !== "image" ? `font-size:${el.fontSize}px;line-height:1.28` : "",
      el.type !== "image" ? `font-weight:${el.fontWeight}` : "",
      el.type !== "image" ? `color:${el.color}` : "",
      el.type !== "image" ? `text-align:${el.align}` : "",
      `background:${effectiveBg(el, color)}`,
      `padding:${el.padding}px`,
      `border-radius:${el.type === "button" ? 7 : el.type === "image" ? 6 : 0}px`,
      el.type === "button" ? "border:0;cursor:pointer;font-family:inherit" : "",
    ].filter(Boolean).join(";");
    return `<div style="${style}">${el.type === "image" ? "" : escapeHtml(el.content)}</div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box;margin:0}
    body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#f7f7f5;color:#18181b;overflow-x:auto}
    nav{display:flex;align-items:center;justify-content:space-between;padding:20px 6%;border-bottom:1px solid #e4e4e0;min-width:${CANVAS_W + 80}px}
    nav b{font-size:14px;letter-spacing:-.03em}
    nav div{display:flex;align-items:center;gap:22px;font-size:12px;color:#71717a}
    nav button{border:0;background:${color};color:#fff;border-radius:6px;padding:9px 14px;font-size:11px;font-weight:600;cursor:pointer}
    .eyebrow{font:600 10px 'JetBrains Mono',monospace;letter-spacing:.14em;color:${color};text-transform:uppercase;position:absolute;top:14px;left:40px}
    .canvas{position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;margin:26px auto 10px}
    footer{padding:14px 7% 8%;font-size:11px;color:#a1a1aa;min-width:${CANVAS_W + 80}px}
  </style></head><body>
    <nav><b>${safePage || "northstar"}</b><div><span>Product</span><span>Solutions</span><button>Get started</button></div></nav>
    <div class="canvas"><div class="eyebrow">${safeSection || "Marketing / Hero"}</div>${blocks}</div>
    <footer>Live preview \u00b7 updates as your section generates</footer>
  </body></html>`;
}
