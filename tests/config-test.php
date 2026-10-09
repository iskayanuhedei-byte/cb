<?php
// Run against a real, isolated WordPress installation.
$root = getenv('RFA_WP_ROOT') ?: '/workspace/.rfa-runtime/wordpress';
require rtrim($root, '/') . '/wp-load.php';
if (!class_exists('RFA_Config')) {
    fwrite(STDERR, "Activate Referral Ads in the test WordPress installation first.\n");
    exit(1);
}
$count = 0;
function check($condition, $message) {
    global $count;
    ++$count;
    if (!$condition) {
        fwrite(STDERR, "FAIL: $message\n");
        exit(1);
    }
    echo "PASS: $message\n";
}
$c = RFA_Config::sanitize(array('enabled' => true, 'referrers' => array('https://WWW.Google.com/search', 'facebook.com', 'google.com.evil.test', '<script>', '*.detik.com'), 'campaigns' => array(array('id' => 'test', 'headline' => '<img src=x onerror=alert(1)>Hello', 'directUrl' => 'javascript:alert(1)', 'imageUrl' => 'https://user:password@evil.test/image.png', 'width' => 99999, 'height' => -20, 'label' => '', 'placement' => array('type' => 'attribute', 'attribute' => 'data-testid', 'value' => 'slot')), array('id' => 'test'))));
check($c['enabled'] === true, 'Explicit enable survives sanitization');
check($c['referrers'] === array('www.google.com', 'facebook.com', 'google.com.evil.test'), 'Host normalization rejects malformed domains and wildcard input');
check($c['campaigns'][0]['directUrl'] === '', 'Executable URL rejected');
check($c['campaigns'][0]['imageUrl'] === '', 'Credential-bearing image URL rejected');
check($c['campaigns'][0]['headline'] === 'Hello', 'Stored headline strips injected HTML');
check($c['campaigns'][0]['label'] === 'Iklan', 'Advertising label cannot be emptied');
check($c['campaigns'][0]['width'] === 1600 && $c['campaigns'][0]['height'] === 50, 'Out-of-range dimensions bounded');
check($c['campaigns'][0]['placement']['attribute'] === 'data-testid' && $c['campaigns'][0]['name'] !== 'data-testid', 'Target attribute name is independent of campaign name');
check($c['campaigns'][0]['id'] !== $c['campaigns'][1]['id'], 'Duplicate campaign IDs replaced');
check(RFA_Config::sanitize(array('enabled' => 'false'))['enabled'] === false, 'String false does not enable plugin');
$normal = RFA_Config::sanitize(array('enabled' => true, 'referrers' => array('detik.com'), 'campaigns' => array(array('id' => 'unit', 'directUrl' => '/offer/', 'parameterName' => 'bad key', 'sourceParameter' => 'source_page', 'pages' => array('/news/*', '/exact', 'https://evil.test', '/bad?query=1', '/bad*middle')))));
check($normal['campaigns'][0]['directUrl'] === home_url('/offer/'), 'Root-relative direct URL resolves to current site');
check($normal['campaigns'][0]['parameterName'] === 'ad_url', 'Invalid parameter names use safe default');
check($normal['campaigns'][0]['pages'] === array('/news/*', '/exact'), 'Page patterns accept exact path and trailing wildcard only');
check(RFA_Config::sanitize($normal) === $normal, 'Saved configuration is stable on repeated reads');
$original = get_option(RFA_Plugin::OPTION, null);
try {
    update_option(RFA_Plugin::OPTION, $normal, false);
    check(RFA_Plugin::config() === $normal, 'WordPress database stores and reloads sanitized configuration');
    check(strpos(do_shortcode('[referral_ads_slot id="promo"]'), 'id="promo"') !== false, 'Shortcode creates usable placement marker');
    check(strpos(do_shortcode('[referral_ads_slot id="x\" onclick=alert(1)"]'), 'onclick=') === false, 'Shortcode attributes cannot inject event handlers');
    check(has_action('wp_ajax_rfa_save', array('RFA_Plugin', 'save')) !== false && !has_action('wp_ajax_nopriv_rfa_save'), 'Settings endpoint registered only for authenticated users');
} finally {
    if ($original === null) {
        delete_option(RFA_Plugin::OPTION);
    } else {
        update_option(RFA_Plugin::OPTION, $original, false);
    }
}
echo "$count checks passed.\n";
