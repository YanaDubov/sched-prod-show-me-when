import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:4175';
let server;
let browser;
const incidents = [
  { id: 'INC-2', service: 'booking', region: 'EU', summary: 'Newer failure', severity: 'sev1', openedAt: '2026-11-12T03:03:00.000Z' },
  { id: 'INC-1', service: 'calendar', region: 'NZ', summary: 'Older failure', severity: 'sev2', openedAt: '2026-11-12T02:03:00.000Z' },
];

before(async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, SERVE_DIR: 'app', PORT: '4175' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test server startup timed out')), 10000);
    server.once('error', reject);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
  });
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function fixture(t, { locale = 'en-GB', timezoneId = 'Europe/Berlin' } = {}) {
  const context = await browser.newContext({ locale, timezoneId });
  t.after(() => context.close());
  const page = await context.newPage();
  const state = { incidents: structuredClone(incidents), count: 0, requests: [], ackCalls: [], fail: false, ackFail: false };
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const API = 'https://fixture.invalid/api'; export const SESSION = 'fixture-only';` }));
  await page.route('https://fixture.invalid/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/incidents')) {
      state.count++;
      state.requests.push(url.searchParams.get('since'));
      if (state.hold) await state.hold;
      return route.fulfill({ status: state.fail ? 503 : 200, json: { updatedAt: '2026-11-12T03:04:00Z', incidents: state.incidents, cursor: 'cursor-' + state.count } });
    }
    state.ackCalls.push({ id: url.searchParams.get('id'), cursor: url.searchParams.get('cursor') });
    return route.fulfill({ status: state.ackFail ? 409 : 200, json: { id: url.searchParams.get('id'), ackedAt: '2026-11-12T03:05:00Z', receipt: 'fixture-only-not-course-proof' } });
  });
  return { page, state };
}

test('loader lasts until a successful answer and hooks render sorted rows', async t => {
  const { page, state } = await fixture(t);
  let release;
  state.hold = new Promise(resolve => { release = resolve; });
  state.incidents.reverse();
  await page.goto(origin);
  assert.equal(await page.getByTestId('loader').isVisible(), true);
  release();
  await page.getByTestId('incident-row').first().waitFor();
  assert.equal(await page.getByTestId('loader').count(), 0);
  assert.deepEqual(await page.getByTestId('incident-row').evaluateAll(rows => rows.map(row => row.dataset.id)), ['INC-2', 'INC-1']);
  assert.equal(await page.getByTestId('empty').isVisible(), false);
});

test('Ack targets its row, uses the current cursor and survives a refresh', async t => {
  const { page, state } = await fixture(t);
  await page.goto(origin);
  const row = page.locator('[data-id="INC-1"]');
  await row.getByTestId('ack').click();
  await row.getByTestId('acked').waitFor();
  assert.deepEqual(state.ackCalls, [{ id: 'INC-1', cursor: 'cursor-1' }]);
  assert.equal(await page.locator('[data-id="INC-2"]').getByTestId('acked').count(), 0);
  await page.waitForResponse(response => response.url().includes('since=cursor-1'));
  assert.equal(await row.getByTestId('acked').count(), 1);
});

test('polling stages a new row; only the new bar applies it without navigation', async t => {
  const { page, state } = await fixture(t);
  await page.goto(origin);
  await page.getByTestId('incident-row').first().waitFor();
  const originalIds = await page.getByTestId('incident-row').evaluateAll(rows => rows.map(row => row.dataset.id));
  const target = page.locator('[data-id="INC-1"]').getByTestId('ack');
  const originalBox = await target.boundingBox();
  state.incidents.push({ ...incidents[0], id: 'INC-3', openedAt: '2026-11-12T04:03:00Z' });
  await page.getByTestId('new-bar').waitFor();
  assert.equal(await page.getByTestId('new-bar').textContent(), '1 new');
  assert.deepEqual(await page.getByTestId('incident-row').evaluateAll(rows => rows.map(row => row.dataset.id)), originalIds);
  assert.deepEqual(await target.boundingBox(), originalBox, 'The bar must not shift the aimed-at button.');
  await page.getByTestId('new-bar').click();
  await page.locator('[data-id="INC-3"]').waitFor();
  assert.equal(await page.getByTestId('incident-row').first().getAttribute('data-id'), 'INC-3');
  assert.equal(await page.getByTestId('new-bar').isVisible(), false);
  assert.equal(state.requests[1], 'cursor-1');
  assert.equal(page.url(), origin + '/');
});

test('an actual coordinate click still acknowledges the aimed-at incident after arrivals', async t => {
  const { page, state } = await fixture(t);
  await page.goto(origin);
  const row = page.locator('[data-id="INC-1"]');
  const button = row.getByTestId('ack');
  await button.waitFor();
  const box = await button.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  state.incidents.unshift({ ...incidents[0], id: 'INC-3', openedAt: '2026-11-12T04:03:00Z' });
  await page.getByTestId('new-bar').waitFor();
  await page.mouse.click(point.x, point.y);
  await row.getByTestId('acked').waitFor();
  assert.equal(state.ackCalls[0].id, 'INC-1');
  assert.equal(state.ackCalls[0].cursor, 'cursor-2');
  await page.getByTestId('new-bar').click();
  await page.locator('[data-id="INC-3"]').waitFor();
  assert.equal(await row.getByTestId('acked').count(), 1);
});

test('the bar counts distinct unseen IDs, not polling responses, and does not update existing rows', async t => {
  const { page, state } = await fixture(t);
  await page.goto(origin);
  await page.getByTestId('incident-row').first().waitFor();
  const before = await page.getByTestId('incident-row').evaluateAll(rows => rows.map(row => row.innerText));
  state.incidents[0].summary = 'Pending changed text';
  state.incidents.push({ ...incidents[0], id: 'INC-3' });
  await page.getByTestId('new-bar').waitFor();
  state.incidents.push({ ...incidents[0], id: 'INC-4' });
  await page.waitForFunction(() => document.querySelector('[data-testid="new-bar"]').textContent === '2 new');
  await page.waitForResponse(response => response.url().includes('since=cursor-3'));
  assert.equal(await page.getByTestId('new-bar').textContent(), '2 new');
  assert.deepEqual(await page.getByTestId('incident-row').evaluateAll(rows => rows.map(row => row.innerText)), before);
});

test('empty response is distinct from loading or errors', async t => {
  const { page, state } = await fixture(t);
  state.incidents = [];
  await page.goto(origin);
  await page.getByTestId('empty').waitFor();
  assert.equal(await page.getByTestId('loader').count(), 0);
  assert.equal(await page.getByTestId('incident-row').count(), 0);
});

test('an unsuccessful Ack does not display a false success', async t => {
  const { page, state } = await fixture(t);
  state.ackFail = true;
  await page.goto(origin);
  await page.locator('[data-id="INC-2"]').getByTestId('ack').click();
  await page.getByRole('alert').getByText(/Could not acknowledge/).waitFor();
  assert.equal(await page.getByTestId('acked').count(), 0);
  assert.equal(await page.locator('[data-id="INC-2"]').getByTestId('ack').isEnabled(), true);
});

test('feed failures keep existing incidents and recover on a later poll', async t => {
  const { page, state } = await fixture(t);
  await page.goto(origin);
  await page.getByTestId('incident-row').first().waitFor();
  state.fail = true;
  await page.getByRole('alert').getByText(/Could not refresh/).waitFor();
  assert.equal(await page.getByTestId('incident-row').count(), 2);
  state.fail = false;
  await page.waitForFunction(() => document.querySelector('[role="alert"]').textContent === '');
});

for (const [locale, timezoneId, hour] of [['en-NZ', 'Pacific/Auckland', '04:03'], ['de-DE', 'Europe/Berlin', '04:03']]) {
  test(`local time in ${timezoneId} preserves UTC datetime and day-first date`, async t => {
    const { page } = await fixture(t, { locale, timezoneId });
    await page.goto(origin);
    const time = page.locator('[data-id="INC-2"] time');
    await time.waitFor();
    assert.equal(await time.getAttribute('datetime'), incidents[0].openedAt);
    const text = await time.textContent();
    assert.ok(text.includes(hour), text);
    if (timezoneId === 'Pacific/Auckland') assert.match(text, /pm.*NZDT/i);
    else assert.match(text, /MEZ|GMT\+1/);
    assert.match(await time.textContent(), /12[/.]11[/.]2026/);
  });
}

test('incident text is not interpreted as HTML', async t => {
  const { page, state } = await fixture(t);
  state.incidents[0].summary = '<img src=x onerror="window.injected=true">';
  await page.goto(origin);
  await page.getByTestId('incident-row').first().waitFor();
  assert.equal(await page.locator('img').count(), 0);
  assert.ok((await page.getByTestId('incident-row').first().textContent()).includes('<img'));
});
