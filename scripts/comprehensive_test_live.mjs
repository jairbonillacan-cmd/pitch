import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function runTest() {
  console.log("=== INICIANDO PRUEBAS COMPLETAS EN VIVO DE AZTECA VET ===");
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "es-MX"
  });

  const page = await context.newPage();
  const screenDir = path.resolve("research/aztecavet/evidence/screenshots");
  const traceDir = path.resolve("research/aztecavet/evidence/browser-traces");
  const netDir = path.resolve("research/aztecavet/evidence/network-schemas");
  const interDir = path.resolve("research/aztecavet/evidence/interaction-tests");

  let leagues = [];
  const networkRequests = [];
  page.on("request", req => {
    networkRequests.push({
      url: req.url(),
      method: req.method(),
      headers: req.headers(),
      postData: req.postData()
    });
  });

  page.on("response", res => {
    networkRequests.push({
      type: "response",
      url: res.url(),
      status: res.status(),
      headers: res.headers()
    });
  });

  // 1. CARGA INICIAL
  console.log("[1] Cargando https://aztecavet.com/ ...");
  const initialRes = await page.goto("https://aztecavet.com/", { waitUntil: "networkidle" });
  console.log("Status HTTP:", initialRes.status());
  await page.screenshot({ path: path.join(screenDir, "01_initial_gate.png") });

  // 2. PRUEBA DE CLAVE INCORRECTA
  console.log("[2] Probando clave incorrecta...");
  await page.waitForTimeout(1100);
  await page.click("#lock");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenDir, "02_pad_open.png") });

  await page.keyboard.press("1");
  await page.waitForTimeout(100);
  await page.keyboard.press("2");
  await page.waitForTimeout(100);
  await page.keyboard.press("3");
  await page.waitForTimeout(100);
  await page.keyboard.press("4");
  await page.waitForTimeout(200);

  const failMsg = await page.$eval("#msg", el => el.textContent);
  console.log("Mensaje tras clave incorrecta:", failMsg);
  await page.screenshot({ path: path.join(screenDir, "03_code_fail.png") });

  // 3. PRUEBA DE CLAVE CORRECTA
  console.log("[3] Introduciendo clave autorizada 7779...");
  await page.waitForTimeout(800);
  await page.keyboard.press("7");
  await page.waitForTimeout(100);
  await page.keyboard.press("7");
  await page.waitForTimeout(100);
  await page.keyboard.press("7");
  await page.waitForTimeout(100);
  await page.keyboard.press("9");
  await page.waitForTimeout(200);

  const successMsg = await page.$eval("#msg", el => el.textContent);
  console.log("Mensaje tras clave correcta:", successMsg);
  await page.screenshot({ path: path.join(screenDir, "04_code_success.png") });

  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(screenDir, "05_home_unlocked.png") });

  // 4. HOME SCREEN
  console.log("[4] Explorando Home...");
  const clkText = await page.$eval("#clk", el => el.textContent).catch(() => "n/a");
  console.log("Reloj visible en Home:", clkText);

  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenDir, "06_home_bento_grid.png") });

  // 5. NAVEGACIÓN A FÚTBOL
  console.log("[5] Abriendo selector de torneos de Fútbol...");
  const fbCard = await page.$("[data-go='fb']");
  if (fbCard) {
    await fbCard.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(screenDir, "07_football_tournaments_menu.png") });

    leagues = await page.$$eval("#s2 [data-i]", els => els.map(el => el.textContent.trim()));
    console.log("Torneos de fútbol disponibles:", leagues);

    console.log("Abriendo Liga MX en iframe...");
    await page.click("#s2 [data-i='0']");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(screenDir, "08_ligamx_dashboard.png") });

    // PROBAR ASISTENTE IA DENTRO DE LIGA MX
    console.log("Probando Asistente IA dentro de Liga MX...");
    await page.click("#aib");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenDir, "09_ai_inside_ligamx.png") });

    await page.fill("#aiq", "¿Cuál es el mejor pick de hoy?");
    await page.press("#aiq", "Enter");
    await page.waitForTimeout(800);
    const aiInSportResp = await page.$$eval("#aim .am.a", els => els.map(e => e.textContent));
    console.log("Respuesta IA en Liga MX (mejor pick):", aiInSportResp[aiInSportResp.length - 1]);
    await page.screenshot({ path: path.join(screenDir, "10_ai_inside_ligamx_answer.png") });

    await page.click("#aix");
    await page.waitForTimeout(400);

    console.log("Regresando al Home...");
    await page.click("#hback");
    await page.waitForTimeout(800);
  }

  // 6. NAVEGACIÓN A NHL
  console.log("[6] Abriendo NHL...");
  const nhlBtn = await page.$("[data-go='4'], [data-i='4']");
  if (nhlBtn) {
    await nhlBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(screenDir, "11_nhl_dashboard.png") });
    await page.click("#hback");
    await page.waitForTimeout(800);
  }

  // 7. NAVEGACIÓN A MLB
  console.log("[7] Abriendo MLB...");
  const mlbBtn = await page.$("[data-go='5'], [data-i='5']");
  if (mlbBtn) {
    await mlbBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(screenDir, "12_mlb_dashboard.png") });
    await page.click("#hback");
    await page.waitForTimeout(800);
  }

  // 8. BOLETO (SLIP), HISTORIAL Y BANKROLL MODAL
  console.log("[8] Probando modal de Boleto / Historial / Bankroll...");
  await page.click("#slipb");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenDir, "13_slip_tab_boleto.png") });

  const histTab = await page.$("[data-tab='h']");
  if (histTab) {
    await histTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenDir, "14_slip_tab_historial.png") });
  }

  const cfgTab = await page.$("[data-tab='c']");
  if (cfgTab) {
    await cfgTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenDir, "15_slip_tab_bankroll.png") });
  }

  await page.click("#slipx");
  await page.waitForTimeout(500);

  // 9. ASISTENTE EN HOME
  console.log("[9] Probando Asistente IA en Home...");
  await page.click("#aib");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenDir, "16_ai_home_open.png") });

  await page.fill("#aiq", "¿Qué partidos hay disponibles?");
  await page.press("#aiq", "Enter");
  await page.waitForTimeout(800);

  const aiResp1 = await page.$$eval("#aim .am.a", els => els.map(e => e.textContent));
  console.log("Respuesta asistente en Home:", aiResp1[aiResp1.length - 1]);
  await page.screenshot({ path: path.join(screenDir, "17_ai_home_answer.png") });

  await page.click("#aix");
  await page.waitForTimeout(400);

  // 10. RECARGA DE PÁGINA
  console.log("[10] Probando recarga de página...");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const lockVisibleAfterReload = await page.$eval("#lock", el => !el.classList.contains("hide") && !el.classList.contains("out"));
  console.log("¿Pantalla de bloqueo (#lock) reaparece tras recarga?:", lockVisibleAfterReload);
  await page.screenshot({ path: path.join(screenDir, "18_after_reload_gate.png") });

  // Guardar traza de red y prueba de interacción
  fs.writeFileSync(
    path.join(netDir, "comprehensive_network_log.json"),
    JSON.stringify(networkRequests, null, 2)
  );

  fs.writeFileSync(
    path.join(interDir, "interaction_results.json"),
    JSON.stringify({
      status: "SUCCESS",
      lockVisibleAfterReload,
      leagues,
      clkText,
      failMsg,
      successMsg,
      aiHomeResponse: aiResp1[aiResp1.length - 1]
    }, null, 2)
  );

  await browser.close();
  console.log("=== PRUEBAS COMPLETAS FINALIZADAS CON ÉXITO ===");
}

runTest().catch(err => {
  console.error("Error ejecutando pruebas completas:", err);
  process.exit(1);
});
