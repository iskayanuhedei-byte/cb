'use strict';

// Run with: node tests/frontend.spec.cjs [optional test-name filter]
// A real HTTP origin and Chromium document.referrer exercise the browser contract.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const assets = path.resolve(__dirname, '../referral-ads/assets');
const cases = new Map();
const tests = [];
let nextCase = 1;
let origin;

function campaign(overrides = {}) {
  const base = {
    id: 'campaign-one', name: 'Campaign one', enabled: true, format: 'banner',
    headline: 'Contoh iklan', description: 'Deskripsi iklan yang jelas.',
    label: 'Iklan', buttonText: 'Kunjungi pengiklan', imageUrl: '', imageAlt: '',
    linkMode: 'direct', directUrl: 'https://advertiser.example/offer',
    parameterName: 'ad_url', allowedLinkHosts: [], forwardPage: false,
    sourceParameter: 'source_page', width: 728, height: 90, responsive: true,
    stickyPosition: 'bottom', placement: {
      type: 'css', value: '#target', attribute: 'data-testid', textExact: true,
      tags: 'button, a, div, section', insert: 'append',
    }, pageMode: 'all', pages: [], devices: 'all', delay: 0, timeout: 15000,
    closeDelay: 0, frequency: 'page', requireVisible: true,
  };
  return { ...base, ...overrides, placement: { ...base.placement, ...(overrides.placement || {}) } };
}

function config(campaigns = [campaign()], overrides = {}) {
  return { enabled: true, referrers: ['google.com', 'facebook.com', 'detik.com'], debug: false, campaigns, ...overrides };
}

function fixture(data, options = {}) {
  const token = String(nextCase++);
  cases.set(token, {
    config: data,
    body: options.body === undefined ? '<main id="target">Konten halaman</main>' : options.body,
    script: options.script || '',
    style: options.style || '',
  });
  const url = new URL(options.path || '/page/', origin);
  url.searchParams.set('__case', token);
  Object.entries(options.query || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

function test(name, run) { tests.push({ name, run }); }
function roots(page) { return page.locator('[data-rfa-campaign]'); }
function root(page, id = 'campaign-one') { return page.locator(`[data-rfa-campaign="${id}"]`); }
async function shown(page, id = 'campaign-one') { await root(page, id).waitFor({ state: 'visible', timeout: 3000 }); }
async function absent(page, ms = 140) { await page.waitForTimeout(ms); assert.equal(await roots(page).count(), 0); }
async function open(page, url, referrer = 'https://www.google.com/search?q=contoh') {
  await page.goto(url, referrer ? { referer: referrer, waitUntil: 'load' } : { waitUntil: 'load' });
}
async function destination(page, id = 'campaign-one') {
  return root(page, id).locator('a[href]').first().getAttribute('href');
}
async function monitorObservers(page) {
  await page.addInitScript(() => {
    const NativeObserver = window.MutationObserver;
    window.__activeObservers = 0;
    window.MutationObserver = class extends NativeObserver {
      observe(...args) {
        super.observe(...args);
        if (!this.__testActive) { this.__testActive = true; window.__activeObservers++; }
      }
      disconnect() {
        super.disconnect();
        if (this.__testActive) { this.__testActive = false; window.__activeObservers--; }
      }
    };
  });
}
async function closeButton(page, id = 'campaign-one') {
  const buttons = root(page, id).locator('button');
  for (let index = 0; index < await buttons.count(); index++) {
    const item = buttons.nth(index);
    const label = [await item.getAttribute('aria-label'), await item.getAttribute('title'), await item.textContent()].join(' ');
    if (/tutup|close|×|✕|✖/i.test(label)) return item;
  }
  throw new Error('A sticky/interstitial close button must have a recognizable accessible label.');
}

test('mandatory referrer: direct visit renders nothing', async ({ page }) => {
  await open(page, fixture(config()), null);
  assert.equal(await page.evaluate(() => document.referrer), '');
  await absent(page);
});

test('mandatory referrer: an empty allowlist blocks every format', async ({ page }) => {
  const formats = ['banner', 'sticky', 'native', 'interstitial', 'popunder'];
  await open(page, fixture(config(formats.map((format, index) => campaign({ id: `empty-${index}`, format })), { referrers: [] })));
  await absent(page);
});

test('referrer hostname boundaries reject lookalike and suffix domains', async ({ page }) => {
  for (const referrer of ['https://google.com.evil.example/', 'https://notgoogle.com/', 'https://evilgoogle.com/', 'https://google.com@evil.example/']) {
    await open(page, fixture(config()), referrer);
    await absent(page, 60);
  }
});

test('exact allowed host and real subdomains qualify', async ({ page }) => {
  for (const referrer of ['https://google.com/', 'https://news.google.com/', 'https://www.facebook.com/', 'https://www.detik.com/']) {
    await open(page, fixture(config()), referrer);
    await shown(page);
    assert.equal(await roots(page).count(), 1);
  }
});

test('global and campaign enable switches are enforced', async ({ page }) => {
  await open(page, fixture(config([campaign()], { enabled: false })));
  await absent(page, 60);
  await open(page, fixture(config([campaign({ enabled: false })])));
  await absent(page, 60);
});

test('all five ad formats render with explicit identity', async ({ page }) => {
  const formats = ['banner', 'sticky', 'native', 'interstitial', 'popunder'];
  await open(page, fixture(config(formats.map((format, index) => campaign({ id: `format-${index}`, format })))));
  for (let index = 0; index < formats.length; index++) {
    await shown(page, `format-${index}`);
    assert.equal(await root(page, `format-${index}`).getAttribute('data-rfa-format'), formats[index]);
  }
  assert.equal(await roots(page).count(), 5);
  assert.match(await root(page, 'format-4').textContent(), /iklan|pengiklan/i);
});

test('banner dimensions and mobile responsive containment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, fixture(config([campaign({ width: 728, height: 90 })])));
  await shown(page);
  const box = await root(page).boundingBox();
  assert.ok(box.width <= 390, `Responsive banner overflowed: ${box.width}px`);
  assert.ok(box.height >= 90, `Configured height not honored: ${box.height}px`);
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, fixture(config([campaign({ width: 300, height: 250, responsive: false })])));
  await shown(page);
  const fixed = await root(page).boundingBox();
  assert.ok(Math.abs(fixed.width - 300) <= 2, `Expected 300px width, got ${fixed.width}`);
  assert.ok(Math.abs(fixed.height - 250) <= 2, `Expected 250px height, got ${fixed.height}`);
});

test('compact mobile banners retain a visible unclipped advertising label', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.route('https://media.example/**', route => route.fulfill({
    status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#2463eb"/></svg>',
  }));
  for (const format of ['banner', 'sticky']) {
    for (const [width, height] of [[120, 50], [160, 60], [320, 50]]) {
      await open(page, fixture(config([campaign({ format, width, height, imageUrl: 'https://media.example/creative.svg' })])));
      await shown(page);
      const label = root(page).locator('.rfa-label');
      assert.equal(await label.isVisible(), true, `${format} ${width}x${height} must identify itself as advertising.`);
      assert.equal(await label.textContent(), 'Iklan');
      const cardBox = await root(page).boundingBox();
      const labelBox = await label.boundingBox();
      assert.ok(labelBox.width > 0 && labelBox.height > 0);
      assert.ok(labelBox.y >= cardBox.y && labelBox.y + labelBox.height <= cardBox.y + cardBox.height + 1, `${format} ${width}x${height} label is clipped vertically.`);
      assert.ok(labelBox.x >= cardBox.x && labelBox.x + labelBox.width <= cardBox.x + cardBox.width + 1, `${format} ${width}x${height} label is clipped horizontally.`);
    }
  }
});

test('sticky positions and close button work', async ({ page }) => {
  for (const stickyPosition of ['top', 'bottom']) {
    await open(page, fixture(config([campaign({ format: 'sticky', stickyPosition })])));
    await shown(page);
    const position = await root(page).evaluate(el => getComputedStyle(el).position);
    assert.equal(position, 'fixed');
    const box = await root(page).boundingBox();
    const viewport = page.viewportSize();
    if (stickyPosition === 'top') assert.ok(box.y <= 20);
    else assert.ok(viewport.height - box.y - box.height <= 20);
    await (await closeButton(page)).click();
    await root(page).waitFor({ state: 'hidden', timeout: 1000 });
    await page.evaluate(() => document.body.append(document.createElement('div')));
    await absent(page, 100);
  }
});

test('interstitial has a dismissible accessible dialog', async ({ page }) => {
  await open(page, fixture(config([campaign({ format: 'interstitial' })])));
  await shown(page);
  assert.ok(await root(page).locator('[role="dialog"]').count() || await root(page).getAttribute('role') === 'dialog', 'Interstitial must expose a dialog role.');
  await (await closeButton(page)).click();
  await root(page).waitFor({ state: 'hidden', timeout: 1000 });
});

test('interstitial closeDelay postpones dismissal', async ({ page }) => {
  await open(page, fixture(config([campaign({ format: 'interstitial', closeDelay: 1 })])));
  await shown(page);
  const close = await closeButton(page);
  const before = await close.evaluate(el => el.disabled || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none' || el.getAttribute('aria-disabled') === 'true');
  assert.equal(before, true, 'Close control should be unavailable during closeDelay.');
  await page.waitForTimeout(1150);
  await close.click();
  await root(page).waitFor({ state: 'hidden', timeout: 1000 });
});

test('interstitial dismissal restores focus and the original scroll style', async ({ page }) => {
  await open(page, fixture(config([campaign({ format: 'interstitial', delay: 80 })]), {
    body: '<main id="target"><button id="original-focus">Original focus</button></main>',
    script: 'document.body.style.setProperty("overflow", "scroll", "important"); document.getElementById("original-focus").focus();',
  }));
  await shown(page);
  assert.deepEqual(await page.evaluate(() => [document.body.style.getPropertyValue('overflow'), document.body.style.getPropertyPriority('overflow')]), ['hidden', 'important']);
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await root(page).evaluate(el => el.contains(document.activeElement)), true);
  }
  await page.keyboard.press('Escape');
  await root(page).waitFor({ state: 'hidden', timeout: 1000 });
  assert.deepEqual(await page.evaluate(() => [document.body.style.getPropertyValue('overflow'), document.body.style.getPropertyPriority('overflow')]), ['scroll', 'important']);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'original-focus');
  assert.equal(await page.locator('.rfa-overlay').count(), 0);
});

test('popunder requires its own real user click', async ({ page }) => {
  await page.addInitScript(() => {
    window.__popupCalls = [];
    window.open = (...args) => { window.__popupCalls.push(args); return { focus() {}, blur() {} }; };
  });
  await open(page, fixture(config([campaign({ format: 'popunder' })]), { body: '<main id="target">Konten halaman</main><button id="ordinary">Tombol halaman</button>' }));
  await shown(page);
  assert.equal(await page.evaluate(() => window.__popupCalls.length), 0);
  await page.locator('#ordinary').click();
  assert.equal(await page.evaluate(() => window.__popupCalls.length), 0, 'Unrelated page clicks must never open an ad.');
  const controls = root(page).locator('a, button');
  assert.ok(await controls.count() > 0, 'Popunder must expose an explicit CTA.');
  await controls.first().click();
  const calls = await page.evaluate(() => window.__popupCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://advertiser.example/offer');
});

test('popunder CTA opens a browser window without granting opener access', async ({ page, context }) => {
  await context.route('https://advertiser.example/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>Pengiklan</title><p>Landing page</p>',
  }));
  await open(page, fixture(config([campaign({ format: 'popunder' })])));
  await shown(page);
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 3000 }),
    root(page).locator('a, button').first().click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), 'https://advertiser.example/offer');
  assert.equal(await popup.evaluate(() => window.opener), null);
});

test('flexible placement supports CSS, id, name, class, attribute, XPath, and text', async ({ page }) => {
  const selectors = [
    { type: 'css', value: 'section[data-slot="ad"]' },
    { type: 'id', value: 'target-slot' },
    { type: 'name', value: 'slot-name' },
    { type: 'class', value: 'slot-class' },
    { type: 'attribute', value: 'slot-value', attribute: 'data-testid' },
    { type: 'xpath', value: '//section[@id="target-slot"]' },
    { type: 'text', value: 'Tujuan iklan', tags: 'section', textExact: true },
  ];
  for (const selector of selectors) {
    await open(page, fixture(config([campaign({ name: 'Independent campaign name', placement: selector })]), {
      body: '<section id="target-slot" name="slot-name" class="slot-class" data-slot="ad" data-testid="slot-value">Tujuan iklan</section>',
    }));
    await shown(page);
    assert.equal(await page.locator('#target-slot > [data-rfa-campaign]').count(), 1, `Failed ${selector.type} placement`);
  }
});

test('placement selects the first visible enabled candidate', async ({ page }) => {
  await open(page, fixture(config([campaign({ placement: { type: 'css', value: '.slot', insert: 'after' } })]), {
    body: '<div class="slot" id="hidden" style="display:none">Hidden</div><button class="slot" id="disabled" disabled>Disabled</button><section class="slot" id="valid">Visible</section>',
  }));
  await shown(page);
  assert.equal(await page.locator('#valid + [data-rfa-campaign]').count(), 1);
});

test('inline ads avoid nesting their CTA inside existing interactive controls', async ({ page, context }) => {
  await context.route('https://advertiser.example/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Ad destination</title>' }));
  await open(page, fixture(config([campaign({ placement: { type: 'css', value: '.slot', insert: 'append' } })]), {
    body: '<button class="slot" id="button-slot">Original button</button><a href="#original" id="original-link"><span class="slot">Original link content</span></a><section class="slot" id="safe-slot">Safe container</section>',
    script: 'window.__originalClicks = 0; document.querySelector("#button-slot").addEventListener("click", () => window.__originalClicks++); document.querySelector("#original-link").addEventListener("click", () => window.__originalClicks++);',
  }));
  await shown(page);
  assert.equal(await page.locator('#safe-slot > [data-rfa-campaign]').count(), 1, 'Interactive controls and their descendants must not contain nested advertising links.');
  await root(page).locator('a[href]').click({ modifiers: ['Control'] });
  assert.equal(await page.evaluate(() => window.__originalClicks), 0, 'Ad CTA must not trigger the original target control.');
});

test('insert modes preserve target content and handlers', async ({ page }) => {
  for (const insert of ['before', 'after', 'append', 'prepend']) {
    await open(page, fixture(config([campaign({ placement: { insert } })]), {
      body: '<main id="target"><button id="original">Tombol asli</button><span id="last">Akhir</span></main>',
      script: 'window.__originalClicks = 0; document.querySelector("#original").addEventListener("click", () => window.__originalClicks++);',
    }));
    await shown(page);
    const relationship = await root(page).evaluate((el, position) => {
      const target = document.getElementById('target');
      if (position === 'before') return el.nextElementSibling === target;
      if (position === 'after') return el.previousElementSibling === target;
      if (position === 'append') return target.lastElementChild === el;
      return target.firstElementChild === el;
    }, insert);
    assert.equal(relationship, true, `Incorrect ${insert} placement`);
    await page.locator('#original').click();
    assert.equal(await page.evaluate(() => window.__originalClicks), 1);
  }
});

test('bad selector cannot abort independent campaigns', async ({ page }) => {
  await open(page, fixture(config([
    campaign({ id: 'invalid-css', placement: { value: '[' }, timeout: 1000 }),
    campaign({ id: 'invalid-xpath', placement: { type: 'xpath', value: '//[' }, timeout: 1000 }),
    campaign({ id: 'valid' }),
  ])));
  await shown(page, 'valid');
  assert.equal(await roots(page).count(), 1);
});

test('late target resolves without automatic original-element clicks', async ({ page }) => {
  await monitorObservers(page);
  await open(page, fixture(config([campaign({ placement: { type: 'name', value: 'late', insert: 'after' } })]), {
    body: '<main>Konten tanpa target</main>',
    script: 'window.__originalClicks = 0; setTimeout(() => { const target = document.createElement("button"); target.name = "late"; target.textContent = "Unduh asli"; target.addEventListener("click", () => window.__originalClicks++); document.body.append(target); }, 80);',
  }));
  await shown(page);
  assert.equal(await page.evaluate(() => window.__originalClicks), 0);
  assert.equal(await page.evaluate(() => window.__activeObservers), 0, 'Placement observer must disconnect after rendering.');
});

test('DOM mutations cannot bypass initial delay', async ({ page }) => {
  await open(page, fixture(config([campaign({ delay: 500 })]), {
    body: '<section>Target akan muncul</section>',
    script: 'setTimeout(() => { const target = document.createElement("main"); target.id = "target"; target.textContent = "Target terlambat"; document.body.append(target); }, 20);',
  }));
  await absent(page, 250);
  await shown(page);
  const elapsed = await root(page).evaluate(el => el.dataset.rfaTestRenderedAt || window.__renderedAt);
  if (elapsed !== undefined) assert.ok(Number(elapsed) >= 475);
});

test('timeout releases retries and a target arriving afterward stays empty', async ({ page }) => {
  await monitorObservers(page);
  await open(page, fixture(config([campaign({ timeout: 1000 })]), { body: '<section>Target tidak ada</section>' }));
  await absent(page, 1200);
  assert.equal(await page.evaluate(() => window.__activeObservers), 0, 'Placement observer must disconnect after timeout.');
  await page.evaluate(() => { const target = document.createElement('main'); target.id = 'target'; target.textContent = 'Too late'; document.body.append(target); });
  await absent(page, 200);
});

test('direct and parameter links use safe destinations and sponsored attributes', async ({ page }) => {
  await open(page, fixture(config()));
  await shown(page);
  assert.equal(await destination(page), 'https://advertiser.example/offer');
  const anchor = root(page).locator('a[href]').first();
  assert.equal(await anchor.getAttribute('target'), '_blank');
  const rel = (await anchor.getAttribute('rel')).split(/\s+/);
  for (const required of ['sponsored', 'noopener', 'noreferrer']) assert.ok(rel.includes(required), `Missing rel=${required}`);
  await open(page, fixture(config([campaign({ linkMode: 'parameter', allowedLinkHosts: ['partner.example'] })]), { query: { ad_url: 'https://cdn.partner.example/promo?x=1' } }));
  await shown(page);
  assert.equal(await destination(page), 'https://cdn.partner.example/promo?x=1');
});

test('parameter mode blocks spoofed hosts and dangerous protocols using direct fallback', async ({ page }) => {
  for (const ad_url of ['https://partner.example.evil.test/offer', 'https://notpartner.example/offer', 'javascript:alert(1)', 'data:text/html,hello']) {
    await open(page, fixture(config([campaign({ linkMode: 'parameter', allowedLinkHosts: ['partner.example'] })]), { query: { ad_url } }));
    await shown(page);
    assert.equal(await destination(page), 'https://advertiser.example/offer', `Unsafe parameter did not fall back: ${ad_url}`);
  }
});

test('parameter mode permits current host, direct-link host, and relative URLs', async ({ page }) => {
  for (const ad_url of [`${origin}/local-offer?x=1`, 'https://advertiser.example/other', '/relative-offer?x=2']) {
    const url = fixture(config([campaign({ linkMode: 'parameter' })]), { query: { ad_url } });
    await open(page, url);
    await shown(page);
    assert.equal(await destination(page), new URL(ad_url, url).href);
  }
});

test('forwardPage preserves destination parameters and forwards current page', async ({ page }) => {
  const url = fixture(config([campaign({ directUrl: 'https://advertiser.example/offer?keep=one#details', forwardPage: true, sourceParameter: 'landing_page' })]), { query: { visit: 'two' } });
  await open(page, url);
  await shown(page);
  const link = new URL(await destination(page));
  assert.equal(link.searchParams.get('keep'), 'one');
  assert.equal(link.searchParams.get('landing_page'), url);
  assert.equal(link.hash, '#details');
});

test('page include and exclude rules use pathname, exact and prefix patterns', async ({ page }) => {
  const definitions = [
    { path: '/allowed/', pageMode: 'include', pages: ['/allowed/'], expected: true },
    { path: '/allowed/child/', pageMode: 'include', pages: ['/allowed/'], expected: false },
    { path: '/allowed/child/', pageMode: 'include', pages: ['/allowed/*'], expected: true },
    { path: '/blocked/child/', pageMode: 'exclude', pages: ['/blocked/*'], expected: false },
    { path: '/elsewhere/', pageMode: 'exclude', pages: ['/blocked/*'], expected: true },
    { path: '/elsewhere/', pageMode: 'include', pages: ['/allowed/'], query: { redirect: '/allowed/' }, expected: false },
  ];
  for (const rule of definitions) {
    await open(page, fixture(config([campaign({ pageMode: rule.pageMode, pages: rule.pages })]), rule));
    if (rule.expected) await shown(page); else await absent(page, 60);
  }
});

test('device rules honor the 767px boundary', async ({ page }) => {
  for (const [width, devices, expected] of [[767, 'mobile', true], [768, 'mobile', false], [767, 'desktop', false], [768, 'desktop', true]]) {
    await page.setViewportSize({ width, height: 800 });
    await open(page, fixture(config([campaign({ devices })])));
    if (expected) await shown(page); else await absent(page, 60);
  }
});

test('session frequency persists successful rendering across navigations', async ({ page }) => {
  const url = fixture(config([campaign({ frequency: 'session' })]));
  await open(page, url);
  await shown(page);
  await open(page, url);
  await absent(page, 120);
});

test('session frequency is marked only after successful placement', async ({ page }) => {
  await open(page, fixture(config([campaign({ frequency: 'session', timeout: 1000 })]), { body: '<section>No target</section>' }));
  await absent(page, 100);
  await open(page, fixture(config([campaign({ frequency: 'session' })])));
  await shown(page);
});

test('page and always frequency allow subsequent loads without same-document duplicates', async ({ page }) => {
  for (const frequency of ['page', 'always']) {
    const url = fixture(config([campaign({ frequency })]));
    await open(page, url);
    await shown(page);
    for (let index = 0; index < 3; index++) await page.evaluate(() => document.body.append(document.createElement('section')));
    await page.waitForTimeout(120);
    assert.equal(await roots(page).count(), 1);
    await open(page, url);
    await shown(page);
  }
});

test('sessionStorage denial does not prevent an eligible ad', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Storage denied', 'SecurityError'); } });
  });
  await open(page, fixture(config([campaign({ frequency: 'session' })])));
  await shown(page);
});

test('ad copy is rendered as text rather than executable HTML', async ({ page }) => {
  await open(page, fixture(config([campaign({ headline: '<img src=x onerror="window.__injected=1">', description: '<script>window.__injected=2</script>', imageAlt: 'Plain alt' })])));
  await shown(page);
  assert.match(await root(page).textContent(), /<img src=x/);
  assert.match(await root(page).textContent(), /<script>/);
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.equal(await root(page).locator('script, img[onerror]').count(), 0);
});

async function main() {
  if (!fs.existsSync(path.join(assets, 'frontend.js'))) throw new Error('Missing referral-ads/assets/frontend.js; run tests after frontend implementation.');
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/assets/frontend.js' || url.pathname === '/assets/frontend.css') {
      const file = path.join(assets, path.basename(url.pathname));
      response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/css');
      response.end(fs.readFileSync(file));
      return;
    }
    const item = cases.get(url.searchParams.get('__case'));
    if (!item) { response.writeHead(404); response.end('Missing fixture'); return; }
    const json = JSON.stringify(item.config).replace(/</g, '\\u003c');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/frontend.css"><style>body{margin:0;padding:8px;font-family:Arial,sans-serif}main,section{min-height:24px}${item.style}</style></head><body>${item.body}<script>window.RFA_CONFIG=${json}; window.__assetStart=performance.now();${item.script}</script><script src="/assets/frontend.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const selected = process.argv[2] ? tests.filter(item => item.name.toLowerCase().includes(process.argv[2].toLowerCase())) : tests;
  let failed = 0;
  try {
    for (const item of selected) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await item.run({ page, context });
        assert.deepEqual(errors, [], 'Uncaught browser errors');
        process.stdout.write(`PASS ${item.name}\n`);
      } catch (error) {
        failed++;
        process.stderr.write(`FAIL ${item.name}\n${error.stack}\n`);
        if (errors.length) process.stderr.write(`Browser errors: ${errors.join('; ')}\n`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  process.stdout.write(`\n${selected.length - failed}/${selected.length} browser tests passed.\n`);
  if (!selected.length || failed) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
