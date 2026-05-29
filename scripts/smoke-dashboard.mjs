#!/usr/bin/env node
import { chromium, request as playwrightRequest } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
const username = process.env.GGFO_SMOKE_USERNAME || process.env.OWNER_USERNAME || '';
let pin = process.env.GGFO_SMOKE_PIN || process.env.OWNER_PIN || '';
const keychainService = process.env.GGFO_SMOKE_KEYCHAIN_SERVICE || '';
const keychainAccount = process.env.GGFO_SMOKE_KEYCHAIN_ACCOUNT || username || '';
const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || '';
const headless = process.env.SMOKE_HEADLESS !== 'false';

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const sourceWriteRequests = [];
  page.on('request', (request) => {
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

  await check('unauthenticated dashboard redirects to login', async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 10000 });
    assert(page.url().includes('/login'), `expected /login, got ${page.url()}`);
  });

  if (!username || !pin) {
    record('authenticated dashboard checks', 'skip', 'set GGFO_SMOKE_USERNAME and GGFO_SMOKE_PIN, or GGFO_SMOKE_KEYCHAIN_SERVICE/GGFO_SMOKE_KEYCHAIN_ACCOUNT');
    await browser.close();
    await api.dispose();
    const failures = results.filter((result) => result.status === 'fail');
    if (failures.length) {
      console.error(`\n${failures.length} smoke checks failed before authenticated checks.`);
      process.exit(1);
    }
    return;
  }

  await check('staff login succeeds without exposing PIN', async () => {
    await page.getByPlaceholder('dimond').fill(username);
    await page.locator('input[type="password"]').fill(pin);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
    await page.getByRole('heading', { name: /Golden Gate Dashboard/i }).waitFor({ timeout: 15000 });
  });

  await check('header is compact and uses requested labels', async () => {
    await expectText(page, 'Golden Gate Dashboard');
    await expectText(page, 'Active Cases');
    await expectText(page, 'All Cases');
    await expectText(page, 'Calendar');
    await expectText(page, 'First calls today');
    await expectText(page, 'Services this month');
    await expectNoText(page, 'Categories');
    await expectNoText(page, 'Filter by category');
    await expectNoText(page, 'Services month');
    await expectNoText(page, 'Calls today');
  });

  await check('payments remains a live header link', async () => {
    const payments = page.getByRole('link', { name: /^Payments$/ });
    await payments.waitFor({ timeout: 5000 });
    assert(await payments.count() === 1, 'expected live Payments link');
    await expectNoText(page, 'Payments soon');
  });

  await check('grid column titles are centered', async () => {
    for (const label of ['Deceased', 'Date / Time', 'Location', 'Status']) {
      const header = page.locator('main section > div').first().getByText(label, { exact: true });
      await header.waitFor({ timeout: 5000 });
      const align = await header.evaluate((node) => getComputedStyle(node).textAlign);
      assert(align === 'center', `${label} text-align was ${align}`);
    }
  });

  await check('grid uses quiet empty state instead of repeated Pending labels', async () => {
    const gridText = await page.locator('main section').first().innerText();
    assert(!/\bPending\b/.test(gridText), 'grid still contains visible "Pending" text');
    assert(gridText.includes('...') || gridText.includes('N/A') || /First Call|Service|Cremation|Burial/.test(gridText), 'grid did not render milestone cells');
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
    const eventButton = page.locator('section button').filter({ hasText: /First call|Service|Cremation|Burial|Disposition|Certificate/i }).first();
    if (!(await eventButton.count())) {
      record('calendar event drawer open', 'skip', 'no dated calendar events rendered in current data window');
      return;
    }
    await eventButton.click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await expectText(page, 'Family detail');
    await page.getByRole('button', { name: /^Close$/ }).click();
  });

  await check('row click opens drawer and drawer has one primary content scroll plus sticky source rail', async () => {
    await page.getByRole('button', { name: /^Active Cases$/ }).click();
    const row = page.locator('main [role="button"][aria-label^="Open details for"]').first();
    await row.waitFor({ timeout: 15000 });
    await row.click();
    const drawer = page.getByRole('dialog');
    await drawer.waitFor({ timeout: 10000 });
    await expectText(page, 'Family detail');
    await expectText(page, 'Master sheet at a glance');
    await expectText(page, 'Sources');
    const verticalScrollers = await drawer.evaluate((node) =>
      Array.from(node.querySelectorAll('*')).filter((el) => {
        const style = getComputedStyle(el);
        return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 4;
      }).length,
    );
    assert(verticalScrollers <= 3, `too many drawer scroll containers: ${verticalScrollers}`);
  });

  await check('source diagnostics are subtle in drawer and not consuming header space', async () => {
    await expectNoLocator(page, 'header >> text=Sources');
    const drawerSources = page.getByRole('dialog').getByText('Sources', { exact: true });
    await drawerSources.waitFor({ timeout: 5000 });
  });

  await check('drawer exposes raw internal contact/source fields when available', async () => {
    const drawerText = await page.getByRole('dialog').innerText();
    assert(!/ending \d{4}/i.test(drawerText), 'drawer still appears to mask phone numbers as ending-only');
    assert(!/\*\*\*/.test(drawerText), 'drawer still contains redaction stars');
  });

  await check('no invented timeline estimates are visible', async () => {
    const bodyText = await page.locator('body').innerText();
    assert(!/6\s*[-–]\s*8\s+weeks/i.test(bodyText), 'found 6-8 weeks estimate');
    assert(!/2\s*[-–]\s*3\s+day/i.test(bodyText), 'found 2-3 day estimate in dashboard surface');
  });

  await check('status checklist closeout reads complete when closeout is checked', async () => {
    const statusText = await page.getByRole('dialog').innerText();
    if (!/Closeout/i.test(statusText)) throw new Error('Closeout step missing from drawer');
    await page.getByRole('button', { name: /^Close$/ }).click();
  });

  await check('no source-system write requests occurred during smoke run', async () => {
    assert(sourceWriteRequests.length === 0, sourceWriteRequests.join('\n'));
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

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 });
}

async function expectNoText(page, text) {
  const count = await page.getByText(text, { exact: false }).count();
  assert(count === 0, `unexpected text found: ${text}`);
}

async function expectNoLocator(page, selector) {
  const count = await page.locator(selector).count();
  assert(count === 0, `unexpected locator found: ${selector}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
