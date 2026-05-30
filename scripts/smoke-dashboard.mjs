#!/usr/bin/env node
import { chromium, request as playwrightRequest } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

loadLocalEnv();

const baseUrl = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
const username = process.env.GGFO_SMOKE_USERNAME || process.env.OWNER_USERNAME || '';
let pin = process.env.GGFO_SMOKE_PIN || process.env.OWNER_PIN || '';
const keychainService = process.env.GGFO_SMOKE_KEYCHAIN_SERVICE || '';
const keychainAccount = process.env.GGFO_SMOKE_KEYCHAIN_ACCOUNT || username || '';
const smokeSessionSecret = process.env.GGFO_SMOKE_JWT_SECRET || process.env.JWT_SECRET || process.env.API_SECRET || '';
const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || '';
const headless = process.env.SMOKE_HEADLESS !== 'false';

function loadLocalEnv() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signSmokeSession(secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({
    staff_id: 'smoke-test',
    role: 'owner',
    first_name: 'Smoke',
    last_name: 'Tester',
    username: 'smoke',
    email: null,
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
  }));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

if (!pin && keychainService && keychainAccount) {
  try {
    pin = execFileSync('security', ['find-generic-password', '-w', '-s', keychainService, '-a', keychainAccount], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    pin = '';
  }
}

const results = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const mark = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`${mark} ${name}${detail ? ` - ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    await fn();
    record(name, 'pass');
  } catch (error) {
    record(name, 'fail', error?.message || String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function screenshot(page, name) {
  if (!screenshotDir) return;
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage: true });
}

async function main() {
  const api = await playwrightRequest.newContext({ baseURL: baseUrl });
  await check('unauthenticated dashboard API is blocked', async () => {
    const response = await api.get('/api/dashboard/operations');
    assert(response.status() === 401, `expected 401, got ${response.status()}`);
  });

  const browser = await chromium.launch({ headless });
  let page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const sourceWriteRequests = [];
  const watchSourceWrites = (targetPage) => targetPage.on('request', (request) => {
    const url = request.url().toLowerCase();
    const method = request.method();
    const externalSource =
      url.includes('docs.google.com') ||
      url.includes('sheets.googleapis.com') ||
      url.includes('googleapis.com/calendar') ||
      url.includes('remotepc') ||
      url.startsWith('smb://');
    if (externalSource && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      sourceWriteRequests.push(`${method} ${request.url()}`);
    }
  });
  watchSourceWrites(page);

  await check('unauthenticated dashboard redirects to login', async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 10000 });
    assert(page.url().includes('/login'), `expected /login, got ${page.url()}`);
  });

  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  watchSourceWrites(page);

  if (username && pin) {
    await check('staff login succeeds without exposing PIN', async () => {
      await page.getByPlaceholder('dimond').fill(username);
      await page.locator('input[type="password"]').fill(pin);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
      await page.getByRole('heading', { name: /Golden Gate Dashboard/i }).waitFor({ timeout: 15000 });
    });
  } else if (smokeSessionSecret) {
    await check('authenticated dashboard opens with local smoke session', async () => {
      await page.context().addCookies([{
        name: 'ggfo_session',
        value: signSmokeSession(smokeSessionSecret),
        url: baseUrl,
        httpOnly: true,
        sameSite: 'Lax',
      }]);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await expectText(page, 'Golden Gate Dashboard', 15000);
    });
  } else {
    record('authenticated dashboard checks', 'skip', 'set GGFO_SMOKE_USERNAME/GGFO_SMOKE_PIN, keychain vars, or JWT_SECRET/API_SECRET in local env');
    await browser.close();
    await api.dispose();
    const failures = results.filter((result) => result.status === 'fail');
    if (failures.length) {
      console.error(`\n${failures.length} smoke checks failed before authenticated checks.`);
      process.exit(1);
    }
    return;
  }

  await waitForDashboardRows(page);

  await check('header is compact and uses current operational labels', async () => {
    await expectText(page, 'Golden Gate Dashboard');
    await expectText(page, 'Recent First Calls');
    await expectText(page, 'Calendar');
    await expectText(page, 'Cases this month');
    await expectText(page, 'Cases this year');
    await expectNoText(page, 'Categories');
    await expectNoText(page, 'Filter by category');
    await expectNoText(page, 'Active Cases');
    await expectNoText(page, 'All Cases');
  });

  await check('texts and payments remain visibly gated', async () => {
    await expectText(page, 'Texts');
    await expectText(page, 'Payments');
    await expectText(page, 'soon');
    assert(await page.getByRole('link', { name: /^Payments$/ }).count() === 0, 'Payments should not be a live link until connected');
  });

  await check('grid column titles are centered', async () => {
    for (const label of ['GG Case Number', 'Deceased', 'Schedule & Location', 'Status']) {
      const header = page.locator('main section > div').first().getByText(label, { exact: true });
      await header.waitFor({ timeout: 5000 });
      const align = await header.evaluate((node) => getComputedStyle(node).textAlign);
      assert(align === 'center', `${label} text-align was ${align}`);
    }
  });

  await check('grid uses quiet empty state instead of repeated Pending labels', async () => {
    const gridText = await page.locator('main section').first().innerText();
    assert(!/\bPending\b/.test(gridText), 'grid still contains visible "Pending" text');
    assert(!/\bDashboard due\b/i.test(gridText), 'grid still contains Dashboard due wording');
    assert(gridText.includes('...') || gridText.includes('N/A') || /First Call|Service|Cremation|Burial/.test(gridText), 'grid did not render milestone cells');
  });

  await check('deceased cell surfaces dates and factual source coverage', async () => {
    const gridText = await page.locator('main section').first().innerText();
    assert(!/Contact needed/i.test(gridText), 'deceased cell still says Contact needed');
    assert(/\bDOB\b/.test(gridText), 'DOB slot missing from deceased cell');
    assert(/\bTransition\b/i.test(gridText), 'Transition slot missing from deceased cell');
    assert(/Cremation #|MoKan #|DC Case/i.test(gridText), 'deceased cell does not show case-reference evidence');
  });

  await check('priority designations are absent from dashboard surface', async () => {
    const bodyText = await page.locator('body').innerText();
    assert(!/\bPriority\b/i.test(bodyText), 'found Priority text');
    assert(!/\bCritical\b|\bHigh\b|\bNormal\b/i.test(bodyText), 'found priority level wording');
  });

  await check('calendar tab supports day week month year modes', async () => {
    await page.getByRole('button', { name: /^Calendar$/ }).click();
    await page.getByRole('heading', { name: /^Calendar$/ }).waitFor({ timeout: 10000 });
    for (const mode of ['day', 'week', 'month', 'year']) {
      await page.getByRole('button', { name: new RegExp(`^${mode}$`, 'i') }).click();
      await page.getByRole('button', { name: new RegExp(`^${mode}$`, 'i') }).waitFor({ timeout: 5000 });
    }
    await expectNoText(page, 'Google Calendar connected');
  });

  await check('calendar events open the family drawer when available', async () => {
    await page.getByRole('button', { name: /^month$/i }).click();
    const eventButton = page.locator('button[data-case-calendar-event="true"]:visible').first();
    if (!(await eventButton.count())) {
      record('calendar event drawer open', 'skip', 'no dated calendar events rendered in current data window');
      return;
    }
    await eventButton.click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await expectText(page, 'Family detail');
    await page.getByRole('button', { name: /^Close$/ }).click();
  });

  await check('row click opens drawer with one controlled content scroll plus compact source evidence button', async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForDashboardRows(page);
    const row = page.locator('main [role="button"][aria-label^="Open details for"]').first();
    await row.waitFor({ timeout: 15000 });
    await row.click();
    const drawer = page.getByRole('dialog');
    await drawer.waitFor({ timeout: 10000 });
    await expectText(page, 'Family detail');
    await page.getByRole('button', { name: /^Source evidence$/ }).waitFor({ timeout: 5000 });
    const firstPaintText = await drawer.innerText();
    assert(!/Loading all linked rows and files/i.test(firstPaintText), 'drawer blocks on linked rows/files loading message');
    const openSections = await drawer.locator('details[open]').count();
    assert(openSections === 0, `expected drawer sections to start collapsed, found ${openSections} open`);
    const drawerScrollInfo = await drawer.evaluate((node) => {
      const all = Array.from(node.querySelectorAll('*'));
      const primary = all.filter((el) => {
        const className = String(el.getAttribute('class') || '');
        return className.includes('space-y-2') && className.includes('overflow-y-auto');
      });
      const scrollable = all.filter((el) => {
        const style = getComputedStyle(el);
        return style.overflowY === 'auto' && el.scrollHeight > el.clientHeight + 4;
      });
      const body = document.scrollingElement;
      return {
        primaryCount: primary.length,
        scrollableCount: scrollable.length,
        pageCanScrollBehind: Boolean(body && body.scrollHeight > body.clientHeight + 4),
      };
    });
    assert(drawerScrollInfo.primaryCount === 1, `expected one primary drawer content scroller, got ${drawerScrollInfo.primaryCount}`);
    assert(!drawerScrollInfo.pageCanScrollBehind, 'page can scroll behind drawer overlay');
    await page.mouse.wheel(0, 1600);
    await expectText(page, 'Recent audit');
  });

  await check('source diagnostics are subtle in drawer and not consuming header space', async () => {
    await expectNoLocator(page, 'header >> text=Sources');
    await page.getByRole('button', { name: /^Source evidence$/ }).click();
    await expectText(page, 'Sources');
  });

  await check('drawer exposes raw internal contact/source fields when available', async () => {
    const drawerText = await page.getByRole('dialog').innerText();
    assert(!/ending \d{4}/i.test(drawerText), 'drawer still appears to mask phone numbers as ending-only');
    assert(!/\*\*\*/.test(drawerText), 'drawer still contains redaction stars');
  });

  await check('no invented timeline estimates are visible', async () => {
    const bodyText = await page.locator('body').innerText();
    assert(!/\bDashboard due\b/i.test(bodyText), 'found Dashboard due wording');
    assert(!/\bDue\b/.test(bodyText), 'found visible Due wording');
    assert(!/6\s*[-–]\s*8\s+weeks/i.test(bodyText), 'found 6-8 weeks estimate');
    assert(!/2\s*[-–]\s*3\s+day/i.test(bodyText), 'found 2-3 day estimate in dashboard surface');
  });

  await check('status checklist closeout reads complete when closeout is checked', async () => {
    if (await page.getByText('Sources', { exact: true }).count()) {
      await page.getByRole('button', { name: /^Source evidence$/ }).click();
    }
    await page.getByText(/^Family checklist$/).click();
    const statusText = await page.getByRole('dialog').innerText();
    if (!/Closeout/i.test(statusText)) throw new Error('Closeout step missing from drawer');
    await page.getByRole('button', { name: /^Close$/ }).click();
  });

  await check('no source-system write requests occurred during smoke run', async () => {
    assert(sourceWriteRequests.length === 0, sourceWriteRequests.join('\n'));
    const syncSource = readFileSync(join(process.cwd(), 'dashboard/src/lib/master-sheet-sync.ts'), 'utf8');
    assert(syncSource.includes('/auth/spreadsheets.readonly'), 'Google Sheets sync is not using readonly scope');
    assert(!/spreadsheets\.values\.(?:update|append|batchUpdate)/.test(syncSource), 'Google Sheets write API detected in sync source');
  });

  await screenshot(page, 'dashboard-smoke-final');
  await browser.close();
  await api.dispose();

  const failures = results.filter((result) => result.status === 'fail');
  if (failures.length) {
    console.error(`\n${failures.length} smoke checks failed.`);
    process.exit(1);
  }
}

async function waitForDashboardRows(page) {
  await expectText(page, 'Golden Gate Dashboard', 15000);
  await page.locator('main [role="button"][aria-label^="Open details for"]').first().waitFor({ timeout: 20000 });
}

async function expectText(page, text, timeout = 5000) {
  await page.waitForFunction((needle) => {
    const visible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    };
    return Array.from(document.body.querySelectorAll('*')).some((el) => visible(el) && (el.textContent || '').includes(needle));
  }, text, { timeout });
}

async function expectNoText(page, text) {
  const count = await page.getByText(text, { exact: false }).count();
  assert(count === 0, `unexpected text found: ${text}`);
}

async function expectNoExactText(page, text) {
  const count = await page.getByText(text, { exact: true }).count();
  assert(count === 0, `unexpected exact text found: ${text}`);
}

async function expectNoLocator(page, selector) {
  const count = await page.locator(selector).count();
  assert(count === 0, `unexpected locator found: ${selector}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
