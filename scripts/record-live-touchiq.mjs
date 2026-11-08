import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('research/touchiq/evidence/screenshots');
const TRACES_DIR = path.resolve('research/touchiq/evidence/browser-traces');
const INTERACTION_DIR = path.resolve('research/touchiq/evidence/interaction-recordings');

async function run() {
  console.log('--- STARTING LIVE TOUCHIQ PLAYWRIGHT HARNESS ---');
  
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const networkLog = [];
  const consoleLog = [];
  const interactionTrace = [];

  // Helper to record steps
  function recordStep(id, action, state, details = {}) {
    interactionTrace.push({
      timestamp: new Date().toISOString(),
      stepId: id,
      action,
      state,
      details,
    });
    console.log(`[STEP ${id}] ${action} -> State: ${state}`);
  }

  // 1. DESKTOP RUN
  console.log('\n=== RUNNING DESKTOP PASS (1440x900) ===');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  page.on('request', req => {
    networkLog.push({
      type: 'request',
      url: req.url(),
      method: req.method(),
      headers: req.headers(),
      postData: req.postData(),
      timestamp: Date.now(),
    });
  });

  page.on('response', async res => {
    let bodySnippet = '';
    try {
      const b = await res.body();
      bodySnippet = b.toString('utf8').slice(0, 200);
    } catch (e) {}
    networkLog.push({
      type: 'response',
      url: res.url(),
      status: res.status(),
      headers: res.headers(),
      size: bodySnippet.length,
      timestamp: Date.now(),
    });
  });

  page.on('console', msg => {
    consoleLog.push({ type: msg.type(), text: msg.text(), location: msg.location() });
  });

  recordStep('D-01', 'Navigate to https://touchiq.com.mx/', 'INITIAL_LOAD');
  await page.goto('https://touchiq.com.mx/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-desktop-lock-stage1.png') });
  recordStep('D-02', 'Capture Lock Screen Stage 1', 'LOCK_STAGE_1', { screenshot: '01-desktop-lock-stage1.png' });

  // Advance to Stage 2 by clicking #lock
  await page.click('#lock');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-desktop-lock-stage2-pad.png') });
  recordStep('D-03', 'Click lock screen to reveal PIN pad', 'LOCK_STAGE_2_PAD', { screenshot: '02-desktop-lock-stage2-pad.png' });

  // Type PIN 7779 by clicking on keypad buttons
  const padButtons = await page.$$eval('#pad button', btns => btns.map(b => b.textContent.trim()));
  console.log('Available pad buttons:', padButtons);

  // Click '7', '7', '7', '9'
  for (const digit of ['7', '7', '7', '9']) {
    const btn = await page.$(`#pad button:text("${digit}")`);
    if (btn) {
      await btn.click();
      await page.waitForTimeout(150);
    }
  }

  recordStep('D-04', 'Enter PIN 7779', 'PIN_ENTERED');
  // Wait for success animation and transition to #app
  await page.waitForTimeout(2500);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-desktop-home.png') });
  recordStep('D-05', 'Unlock success & Home screen render', 'HOME_VIEW', { screenshot: '03-desktop-home.png' });

  // Test Audio toggle
  const sndBtn = await page.$('#snd');
  if (sndBtn) {
    const sndText = await page.evaluate(el => el.textContent, sndBtn);
    recordStep('D-06', 'Check Audio toggle', 'AUDIO_CHECK', { buttonText: sndText });
  }

  // Open NFL Dashboard
  console.log('Opening NFL Dashboard...');
  // Find robot card or sport card for NFL
  const nflCard = await page.$('.rc[data-go="0"], [data-i="0"]');
  if (nflCard) {
    await nflCard.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-desktop-nfl-dashboard.png') });
    recordStep('D-07', 'Click NFL card -> Open iframe', 'NFL_DASHBOARD', { screenshot: '04-desktop-nfl-dashboard.png' });

    // Inside iframe #fr
    const frame = page.frameLocator('#fr');
    // Check tabs in NFL
    const tabs = await frame.locator('nav#nav button').allTextContents();
    console.log('NFL tabs found in iframe:', tabs);

    // Click each tab and take screenshot if possible
    // Tab: Partidos (default)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-desktop-nfl-tab-partidos.png') });

    // Tab: Simulador
    const simTab = frame.locator('nav#nav button:text("Simulador")');
    if (await simTab.count() > 0) {
      await simTab.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-desktop-nfl-tab-simulador.png') });
      recordStep('D-08', 'Click NFL Simulador tab', 'NFL_SIMULADOR', { screenshot: '06-desktop-nfl-tab-simulador.png' });
    }

    // Tab: Noticias / Bajas
    const bajasTab = frame.locator('nav#nav button:text("Noticias"), nav#nav button:text("Lesiones"), nav#nav button:text("Bajas")');
    if (await bajasTab.count() > 0) {
      await bajasTab.first().click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-desktop-nfl-tab-lesiones.png') });
      recordStep('D-09', 'Click NFL Lesiones tab', 'NFL_LESIONES', { screenshot: '07-desktop-nfl-tab-lesiones.png' });
    }

    // Tab: Dinero
    const dinTab = frame.locator('nav#nav button:has-text("DINERO"), nav#nav button:has-text("Dinero")');
    if (await dinTab.count() > 0) {
      await dinTab.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-desktop-nfl-tab-dinero.png') });
      recordStep('D-10', 'Click NFL Dinero tab', 'NFL_DINERO', { screenshot: '08-desktop-nfl-tab-dinero.png' });
    }

    // Close sport by clicking #hback
    const hback = await page.$('#hback');
    if (hback) {
      await hback.click();
      await page.waitForTimeout(1000);
      recordStep('D-11', 'Click back -> Return to Home', 'HOME_VIEW');
    }
  }

  // Open NCAA Dashboard
  console.log('Opening NCAA Dashboard...');
  const ncaaCard = await page.$('.rc[data-go="1"], [data-i="1"]');
  if (ncaaCard) {
    await ncaaCard.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-desktop-ncaa-dashboard.png') });
    recordStep('D-12', 'Click NCAA card -> Open iframe', 'NCAA_DASHBOARD', { screenshot: '09-desktop-ncaa-dashboard.png' });

    // Close sport
    const hback = await page.$('#hback');
    if (hback) {
      await hback.click();
      await page.waitForTimeout(1000);
      recordStep('D-13', 'Click back -> Return to Home', 'HOME_VIEW');
    }
  }

  // Test Football / 4 Torneos transition
  console.log('Testing Fútbol transition...');
  const fbCard = await page.$('[data-go="fb"]');
  if (fbCard) {
    await fbCard.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-desktop-futbol-selector.png') });
    recordStep('D-14', 'Click Fútbol card -> Transition to #s2', 'FUTBOL_SELECTOR', { screenshot: '10-desktop-futbol-selector.png' });

    // Go back to s1
    const bk2 = await page.$('#bk2');
    if (bk2) {
      await bk2.click();
      await page.waitForTimeout(800);
      recordStep('D-15', 'Click #bk2 -> Return to #s1', 'HOME_VIEW');
    }
  }

  // Test Boleto drawer
  console.log('Testing Boleto drawer...');
  const slipb = await page.$('#slipb');
  if (slipb) {
    // If hidden, remove hide class or trigger it
    const isHidden = await page.evaluate(el => el.classList.contains('hide'), slipb);
    if (isHidden) {
      await page.evaluate(el => el.classList.remove('hide'), slipb);
    }
    await slipb.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-desktop-boleto-drawer.png') });
    recordStep('D-16', 'Open Boleto Drawer (Tab Boleto)', 'BOLETO_DRAWER', { screenshot: '11-desktop-boleto-drawer.png' });

    // Click Tab Historial
    const histTab = await page.$('.sp-tabs button[data-st="h"]');
    if (histTab) {
      await histTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12-desktop-boleto-historial.png') });
      recordStep('D-17', 'Switch to Historial tab', 'BOLETO_HISTORIAL', { screenshot: '12-desktop-boleto-historial.png' });
    }

    // Click Tab Bankroll
    const bkTab = await page.$('.sp-tabs button[data-st="c"]');
    if (bkTab) {
      await bkTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13-desktop-boleto-bankroll.png') });
      recordStep('D-18', 'Switch to Bankroll tab', 'BOLETO_BANKROLL', { screenshot: '13-desktop-boleto-bankroll.png' });
    }

    // Close Boleto
    const slipx = await page.$('#slipx');
    if (slipx) {
      await slipx.click();
      await page.waitForTimeout(400);
    }
  }

  // Test Assistant
  console.log('Testing Assistant widget...');
  const aib = await page.$('#aib');
  if (aib) {
    await aib.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14-desktop-assistant-open.png') });
    recordStep('D-19', 'Open AI Assistant', 'ASSISTANT_OPEN', { screenshot: '14-desktop-assistant-open.png' });

    // Send a message via #aiq and form submit
    const aiIn = await page.$('#aiq');
    const aiForm = await page.$('#aif');
    if (aiIn && aiForm) {
      await aiIn.fill('¿Cuál es el mejor pick de NFL de hoy?');
      await page.waitForTimeout(200);
      await aiForm.evaluate(form => form.requestSubmit());
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15-desktop-assistant-response.png') });
      
      const responseText = await page.$$eval('#aim .am', msgs => msgs.map(m => m.textContent));
      recordStep('D-20', 'Send query to AI Assistant', 'ASSISTANT_REPLIED', {
        messages: responseText,
        screenshot: '15-desktop-assistant-response.png'
      });
    }

    // Close Assistant
    const aix = await page.$('#aix');
    if (aix) {
      await aix.click();
      await page.waitForTimeout(400);
    }
  }

  await context.close();

  // 2. MOBILE RUN (iPhone 14 viewport: 390x844)
  console.log('\n=== RUNNING MOBILE PASS (390x844) ===');
  const mContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  });

  const mPage = await mContext.newPage();
  await mPage.goto('https://touchiq.com.mx/', { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(800);
  await mPage.screenshot({ path: path.join(SCREENSHOT_DIR, '16-mobile-lock-stage1.png') });

  // Unlock on mobile
  await mPage.click('#lock');
  await mPage.waitForTimeout(400);
  for (const digit of ['7', '7', '7', '9']) {
    const btn = await mPage.$(`#pad button:text("${digit}")`);
    if (btn) {
      await btn.click();
      await mPage.waitForTimeout(100);
    }
  }
  await mPage.waitForTimeout(2500);
  await mPage.screenshot({ path: path.join(SCREENSHOT_DIR, '17-mobile-home.png') });
  recordStep('M-01', 'Mobile Home View', 'MOBILE_HOME', { screenshot: '17-mobile-home.png' });

  // Mobile NFL
  const mNflCard = await mPage.$('.rc[data-go="0"], [data-i="0"]');
  if (mNflCard) {
    await mNflCard.click();
    await mPage.waitForTimeout(1500);
    await mPage.screenshot({ path: path.join(SCREENSHOT_DIR, '18-mobile-nfl-dashboard.png') });
    recordStep('M-02', 'Mobile NFL Dashboard', 'MOBILE_NFL', { screenshot: '18-mobile-nfl-dashboard.png' });
  }

  await mContext.close();
  await browser.close();

  // Write outputs
  fs.writeFileSync(path.join(TRACES_DIR, 'network-requests.json'), JSON.stringify(networkLog, null, 2));
  fs.writeFileSync(path.join(TRACES_DIR, 'console-logs.json'), JSON.stringify(consoleLog, null, 2));
  fs.writeFileSync(path.join(INTERACTION_DIR, 'session-walkthrough.json'), JSON.stringify(interactionTrace, null, 2));

  console.log('\n--- LIVE PLAYWRIGHT HARNESS COMPLETED SUCCESSFULLY ---');
  console.log(`Total network requests logged: ${networkLog.length}`);
  console.log(`Total interaction steps logged: ${interactionTrace.length}`);
}

run().catch(err => {
  console.error('Fatal error running harness:', err);
  process.exit(1);
});
