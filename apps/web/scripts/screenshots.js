/**
 * Old Legs — screenshot capture script
 *
 * Takes viewport screenshots of the running app at http://localhost:3000
 * and saves them to docs/screenshots/.
 *
 * The app must already be running before executing this script.
 *
 * Auth: if scripts/auth-state.json exists, loads saved session.
 *       Otherwise opens a headed browser — log in, then press Enter.
 *
 * Run from apps/web:
 *   node scripts/screenshots.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('@playwright/test');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const AUTH_STATE_PATH = path.join(__dirname, 'auth-state.json');
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'docs', 'screenshots');
const BASE_URL = 'http://localhost:3000';

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => { rl.close(); resolve(); });
  });
}

async function waitForNetworkIdleAndSettle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function takeScreenshot(page, filename) {
  const dest = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`  Saved: ${filename}`);
}

async function isSessionValid(statePath) {
  const testBrowser = await chromium.launch({ headless: true });
  const testContext = await testBrowser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: statePath,
  });
  const testPage = await testContext.newPage();
  await testPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await testPage.waitForTimeout(1500);
  const url = testPage.url();
  await testBrowser.close();
  return url.includes('/dashboard');
}

async function resolveAuthState() {
  if (fs.existsSync(AUTH_STATE_PATH)) {
    process.stdout.write('Auth state found — verifying session... ');
    const valid = await isSessionValid(AUTH_STATE_PATH);
    if (valid) {
      console.log('valid.');
      return AUTH_STATE_PATH;
    }
    console.log('expired. Deleting and re-logging in.');
    fs.unlinkSync(AUTH_STATE_PATH);
  }

  console.log('\nOpening browser for Strava login...');
  console.log('Complete the full login flow until you can see the DASHBOARD, then press Enter.\n');

  const setupBrowser = await chromium.launch({ headless: false });
  const setupContext = await setupBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  const setupPage = await setupContext.newPage();
  await setupPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  let verified = false;
  while (!verified) {
    process.stdout.write('Press Enter once you are on the dashboard... ');
    await waitForEnter();
    const currentUrl = setupPage.url();
    if (currentUrl.includes('/dashboard')) {
      verified = true;
    } else {
      console.log(`  Still on ${currentUrl} — finish the Strava login first, then press Enter.`);
    }
  }

  const state = await setupContext.storageState();
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  console.log('Auth state saved.');

  await setupBrowser.close();
  return AUTH_STATE_PATH;
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const savedStatePath = await resolveAuthState();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: savedStatePath,
  });
  const page = await context.newPage();

  // 1. Dashboard
  console.log('Capturing 01-dashboard.png...');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForNetworkIdleAndSettle(page);
  await takeScreenshot(page, '01-dashboard.png');

  // 2. Activities list
  console.log('Capturing 02-activities.png...');
  await page.goto(`${BASE_URL}/activities`, { waitUntil: 'domcontentloaded' });
  await waitForNetworkIdleAndSettle(page);
  await takeScreenshot(page, '02-activities.png');

  // 3. Activity dispatch — click first activity card (divs with onClick + cursor-pointer)
  console.log('Capturing 03-dispatch.png — clicking first activity...');
  const selectors = [
    '[data-testid="activity-card"]',
    'div.cursor-pointer:has(div)',  // lead article and edition rows both match
    'article',
    'a[href^="/activities/"]',
  ];
  let clicked = false;
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      try {
        const navPromise = page.waitForURL(/\/activities\/\d+/, { timeout: 5000 });
        await el.click();
        await navPromise;
        clicked = true;
        break;
      } catch {
        console.log(`  Selector "${sel}" found but navigation didn't follow — trying next.`);
      }
    }
  }
  if (clicked) {
    await waitForNetworkIdleAndSettle(page);
    await takeScreenshot(page, '03-dispatch.png');
  } else {
    console.warn('  WARNING: Could not navigate to activity detail. 03-dispatch.png skipped.');
  }

  // 4. Plan
  console.log('Capturing 04-plan.png...');
  await page.goto(`${BASE_URL}/plan`, { waitUntil: 'domcontentloaded' });
  await waitForNetworkIdleAndSettle(page);
  await takeScreenshot(page, '04-plan.png');

  // 5. Coach chat
  console.log('Capturing 05-chat.png...');
  await page.goto(`${BASE_URL}/coach`, { waitUntil: 'domcontentloaded' });
  await waitForNetworkIdleAndSettle(page);
  await takeScreenshot(page, '05-chat.png');

  await browser.close();
  console.log(`\nDone. Screenshots saved to docs/screenshots/`);
}

main().catch((err) => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
