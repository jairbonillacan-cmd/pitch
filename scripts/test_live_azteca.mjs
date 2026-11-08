import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Iniciando prueba en vivo contra https://aztecavet.com/...");
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "es-MX"
  });

  const page = await context.newPage();

  const networkLog = [];
  page.on("request", req => {
    networkLog.push({ type: "request", url: req.url(), method: req.method(), headers: req.headers() });
  });
  page.on("response", res => {
    networkLog.push({ type: "response", url: res.url(), status: res.status(), headers: res.headers() });
  });

  const consoleLogs = [];
  page.on("console", msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  // 1. Navegar a https://aztecavet.com/
  const response = await page.goto("https://aztecavet.com/", { waitUntil: "networkidle" });
  console.log("Status de respuesta:", response.status());
  console.log("Headers de respuesta:", JSON.stringify(response.headers(), null, 2));

  const screenshotDir = path.resolve("research/aztecavet/evidence/screenshots");

  // Captura pantalla inicial (Stage 1 - Gate)
  await page.screenshot({ path: path.join(screenshotDir, "01_gate_stage1.png") });
  console.log("Capturado 01_gate_stage1.png");

  // Verificar título y estructura inicial
  const title = await page.title();
  console.log("Título:", title);

  // Esperar 1.2 segundos para superar el cooldown de 900ms de stage 1
  await page.waitForTimeout(1200);

  // Click en #lock para avanzar a Stage 2
  await page.click("#lock");
  await page.waitForTimeout(800);

  // Captura Stage 2 (Pad de entrada)
  await page.screenshot({ path: path.join(screenshotDir, "02_gate_stage2_pad.png") });
  console.log("Capturado 02_gate_stage2_pad.png");

  // Introducir la clave autorizada: 7779 usando los botones del pad o teclado
  // Verificamos los botones en #pad
  const buttons = await page.$$eval("#pad button", btns => btns.map(b => b.textContent.trim()));
  console.log("Botones del pad:", buttons);

  // Introducir dígitos "7", "7", "7", "9"
  await page.keyboard.press("7");
  await page.waitForTimeout(150);
  await page.keyboard.press("7");
  await page.waitForTimeout(150);
  await page.keyboard.press("7");
  await page.waitForTimeout(150);
  await page.keyboard.press("9");
  console.log("Código 7779 introducido.");

  // Esperar animación de unlock (1.8s) y montaje de #app
  await page.waitForTimeout(2200);

  // Captura Home Screen tras desbloqueo
  await page.screenshot({ path: path.join(screenshotDir, "03_home_unlocked.png") });
  console.log("Capturado 03_home_unlocked.png");

  // Inspeccionar localStorage y cookies
  const storage = await page.evaluate(() => {
    const s = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      s[k] = localStorage.getItem(k);
    }
    return s;
  });
  console.log("localStorage actual:", storage);

  const cookies = await context.cookies();
  console.log("Cookies actuales:", cookies);

  // Guardar log de red inicial y consola
  fs.writeFileSync(
    "research/aztecavet/evidence/browser-traces/initial_navigation_trace.json",
    JSON.stringify({ network: networkLog, console: consoleLogs, storage, cookies }, null, 2)
  );

  await browser.close();
  console.log("Prueba inicial completada con éxito.");
}

main().catch(err => {
  console.error("Error en main:", err);
  process.exit(1);
});
