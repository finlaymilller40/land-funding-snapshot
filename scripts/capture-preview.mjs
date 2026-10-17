// Capture the start page's workspace preview (public/workspace-preview.webp)
// with headless Chrome over the DevTools protocol. No extra packages.
//
// Needs: `npm run dev` on port 3000 against the LOCAL database, and Google
// Chrome in /Applications (macOS). The fields are standard test site 4 and the
// field just north of it (British National Grid 529500,261500 and
// 529500,261850, 300 m squares), as a GeoJSON file in longitude/latitude.
//
// Usage: node scripts/capture-preview.mjs public/workspace-preview.webp <fields.geojson>
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [out, sitePath] = process.argv.slice(2);
const site = readFileSync(sitePath, "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--remote-debugging-port=9333",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "shoot-"))}`,
  "--window-size=1440,900",
  "--hide-scrollbars",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "about:blank",
], { stdio: "ignore" });

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      target = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).find((t) => t.type === "page");
    } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await send("Page.enable");
  await send("Page.navigate", { url: "http://localhost:3000/check" });
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    const ready = await evaluate("!!document.querySelector('input[type=file]') && !!document.querySelector('.maplibregl-canvas')");
    if (ready) break;
  }
  await sleep(3000); // map style and region outline

  const flow = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const input = document.querySelector('input[type=file]');
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(site)}], 'fields.geojson'));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1500);
    const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
    btn('Continue').click(); await sleep(500);
    document.querySelectorAll('input[name=access]')[0].click(); await sleep(300);
    btn('See my estimate').click(); await sleep(6000);
    const row = [...document.querySelectorAll('aside li > button')].find((b) => b.textContent.includes('Riverside shade bonus'));
    row.click(); await sleep(500);
    [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === 'Show on map').click();
    await sleep(500);
    // Scroll only the panel so the open payment sits near the top.
    const panel = document.querySelector('aside > div');
    panel.scrollTop = row.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 16;
    // Tidy for the picture: close the map key and hide the Next.js dev badge.
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Map key'))?.click();
    document.querySelector('nextjs-portal')?.remove();
    return document.querySelector('aside').innerText.slice(0, 120);
  })()`;
  console.log(await evaluate(flow));
  await sleep(6000); // tiles and overlays
  const shot = await send("Page.captureScreenshot", { format: "webp", quality: 88 });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("saved", out);
  ws.close();
} finally {
  chrome.kill();
}
