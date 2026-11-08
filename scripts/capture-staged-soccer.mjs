import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://touchiq.com.mx/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('#lock');
  await page.waitForTimeout(600);
  for (const d of ['7','7','7','9']) {
    const btn = await page.$(`#pad button:text("${d}")`);
    if (btn) await btn.click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(2200);

  // Invoke lv2() in page
  await page.evaluate(() => {
    // In index.html, lv2 is in script scope
    if (typeof window.lv2 === 'function') {
      window.lv2();
    } else {
      // In script_0, function lv2 is at top level of script
      eval('lv2()');
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'research/touchiq/evidence/screenshots/10-desktop-futbol-selector.png' });
  console.log('Successfully captured 10-desktop-futbol-selector.png!');
  await browser.close();
}

main().catch(console.error);
