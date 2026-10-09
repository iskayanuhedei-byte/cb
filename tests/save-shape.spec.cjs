'use strict';

// Targeted regression against the actual isolated WordPress AJAX endpoint.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const php = process.env.RFA_PHP || '/workspace/.rfa-runtime/php-cli';
const wpRoot = process.env.RFA_WP_ROOT || '/workspace/.rfa-runtime/wordpress';
const base = process.env.RFA_WP_URL || 'http://127.0.0.1:8090';
const quote = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function wp(code, input = '') {
  return execFileSync(php, ['-r', `require ${quote(wpRoot + '/wp-load.php')};${code}`], { input, encoding: 'utf8' }).trim();
}
function restore(value) {
  wp("$value=json_decode(stream_get_contents(STDIN),true); if($value===null){delete_option('rfa_config');}else{update_option('rfa_config',$value,false);}", value);
}

async function main() {
  const original = wp("echo json_encode(get_option('rfa_config', null));");
  let browser;
  let count = 0;
  try {
    wp("update_option('rfa_config', RFA_Config::sanitize(array('enabled'=>true,'referrers'=>array('google.com'),'campaigns'=>array(array('id'=>'preserved','directUrl'=>'https://advertiser.example/offer')))), false);");
    const baseline = JSON.parse(wp("echo json_encode(get_option('rfa_config'));"));
    const adminId = Number(wp("$user=get_user_by('login','rfa_developer'); echo $user->ID;"));
    assert.ok(adminId > 0, 'The isolated WordPress developer account must exist.');
    const rawCookies = JSON.parse(wp(`echo json_encode(array(AUTH_COOKIE=>wp_generate_auth_cookie(${adminId},time()+3600,'auth'),LOGGED_IN_COOKIE=>wp_generate_auth_cookie(${adminId},time()+3600,'logged_in')));`));
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext();
    await context.addCookies(Object.entries(rawCookies).map(([name, value]) => ({ name, value, url: base, httpOnly: true, sameSite: 'Lax' })));
    const page = await context.newPage();
    await page.goto(base + '/wp-admin/admin.php?page=referral-ads');
    await page.waitForFunction(() => window.RFA_ADMIN && window.RFA_ADMIN.nonce);
    const nonce = await page.evaluate(() => window.RFA_ADMIN.nonce);
    const malformed = [
      ['empty top-level list', '[]'],
      ['top-level list containing an object', '[{"enabled":true}]'],
      ['scalar JSON', 'true'],
      ['campaign object map', '{"campaigns":{"one":{"id":"one"}}}'],
      ['empty campaign object', '{"campaigns":{}}'],
      ['scalar campaign entry', '{"campaigns":[1]}'],
      ['null campaign entry', '{"campaigns":[null]}'],
      ['more than 50 campaigns', JSON.stringify({ campaigns: Array.from({ length: 51 }, (_, index) => ({ id: `too-many-${index}` })) })],
    ];
    for (const [name, value] of malformed) {
      const response = await context.request.post(base + '/wp-admin/admin-ajax.php', { form: { action: 'rfa_save', nonce, config: value } });
      assert.equal(response.status(), 400, `Malformed ${name} must be rejected.`);
      assert.equal((await response.json()).success, false);
      assert.deepEqual(JSON.parse(wp("echo json_encode(get_option('rfa_config'));")), baseline, `Malformed ${name} must preserve saved campaigns.`);
      count++;
      console.log(`PASS: ${name} is rejected without changing configuration`);
    }
    const valid = await context.request.post(base + '/wp-admin/admin-ajax.php', { form: { action: 'rfa_save', nonce, config: JSON.stringify(baseline) } });
    assert.equal(valid.status(), 200);
    assert.equal((await valid.json()).success, true);
    assert.deepEqual(JSON.parse(wp("echo json_encode(get_option('rfa_config'));")), baseline);
    count++;
    console.log('PASS: a valid object and campaign list remains accepted');
    const literals = JSON.parse(JSON.stringify(baseline));
    literals.campaigns = [
      { ...baseline.campaigns[0], id: 'literal-css', placement: {
        ...baseline.campaigns[0].placement, type: 'css',
        value: 'a[href="/offer?key=%20foo"]', tags: 'a[href*="%20"]',
      }, pages: ['/offers/%20sale*'] },
      { ...baseline.campaigns[0], id: 'literal-xpath', placement: {
        ...baseline.campaigns[0].placement, type: 'xpath', value: '//section[@data-count < 4]',
      } },
    ];
    const literalSave = await context.request.post(base + '/wp-admin/admin-ajax.php', { form: { action: 'rfa_save', nonce, config: JSON.stringify(literals) } });
    assert.equal(literalSave.status(), 200);
    assert.equal((await literalSave.json()).success, true);
    const roundtrip = JSON.parse(wp("echo json_encode(get_option('rfa_config'));"));
    assert.equal(roundtrip.campaigns[0].placement.value, literals.campaigns[0].placement.value);
    assert.equal(roundtrip.campaigns[0].placement.tags, literals.campaigns[0].placement.tags);
    assert.deepEqual(roundtrip.campaigns[0].pages, literals.campaigns[0].pages);
    assert.equal(roundtrip.campaigns[1].placement.value, literals.campaigns[1].placement.value);
    count++;
    console.log('PASS: encoded selectors/paths and XPath comparison syntax survive a real AJAX roundtrip');
    await context.close();
    console.log(`${count} save-shape integration checks passed.`);
  } finally {
    if (browser) await browser.close();
    restore(original);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
