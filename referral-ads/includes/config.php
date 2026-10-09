<?php
if (!defined('ABSPATH')) {
    exit;
}

final class RFA_Config {
    public static function defaults() {
        return array('enabled' => false, 'referrers' => array(), 'debug' => false, 'campaigns' => array());
    }

    public static function campaign_defaults() {
        return array(
            'id' => '', 'name' => 'Kampanye baru', 'enabled' => true, 'format' => 'banner',
            'headline' => 'Temukan penawaran pilihan', 'description' => '', 'label' => 'Iklan',
            'buttonText' => 'Lihat penawaran', 'imageUrl' => '', 'imageAlt' => '',
            'linkMode' => 'direct', 'directUrl' => '', 'parameterName' => 'ad_url',
            'allowedLinkHosts' => array(), 'forwardPage' => false, 'sourceParameter' => 'source_page',
            'width' => 728, 'height' => 90, 'responsive' => true, 'stickyPosition' => 'bottom',
            'placement' => array('type' => 'css', 'value' => 'main, article, .site-content',
                'attribute' => 'data-testid', 'textExact' => false,
                'tags' => 'button, a, div, section', 'insert' => 'prepend'),
            'pageMode' => 'all', 'pages' => array(), 'devices' => 'all',
            'delay' => 500, 'timeout' => 15000, 'closeDelay' => 0,
            'frequency' => 'page', 'requireVisible' => true,
        );
    }

    private static function text($value, $max = 250) {
        return is_scalar($value) ? self::cut(sanitize_text_field((string) $value), $max) : '';
    }

    private static function cut($value, $max) {
        return function_exists('mb_substr') ? mb_substr($value, 0, $max) : substr($value, 0, $max);
    }

    private static function literal($value, $max) {
        if (!is_scalar($value)) {
            return '';
        }
        // Selector and path syntax must preserve percent escapes and XPath '<'.
        // These values are only used by selector APIs and encoded JSON, never HTML.
        $value = wp_check_invalid_utf8((string) $value, true);
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
        return self::cut(trim($value), $max);
    }

    private static function bool_value($value) {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    private static function choice($value, $choices, $fallback) {
        return is_string($value) && in_array($value, $choices, true) ? $value : $fallback;
    }

    private static function number($value, $min, $max, $fallback) {
        return is_numeric($value) ? max($min, min($max, (int) $value)) : $fallback;
    }

    public static function hosts($raw) {
        if (is_string($raw)) {
            $raw = preg_split('/[\s,]+/', $raw);
        }
        if (!is_array($raw)) {
            return array();
        }
        $hosts = array();
        foreach (array_slice($raw, 0, 100) as $item) {
            if (!is_string($item)) {
                continue;
            }
            $item = strtolower(trim($item));
            if (strpos($item, '://') !== false) {
                $scheme = wp_parse_url($item, PHP_URL_SCHEME);
                if (!in_array($scheme, array('http', 'https'), true)) {
                    continue;
                }
                $item = wp_parse_url($item, PHP_URL_HOST);
            }
            $item = rtrim((string) $item, '.');
            if (strlen($item) > 253 || strpos($item, '.') === false || !preg_match('/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/', $item)) {
                continue;
            }
            $labels = explode('.', $item);
            if (max(array_map('strlen', $labels)) > 63) {
                continue;
            }
            $hosts[] = $item;
        }
        return array_values(array_unique($hosts));
    }

    private static function url($raw) {
        if (!is_string($raw)) {
            return '';
        }
        $raw = trim($raw);
        // A same-site root-relative path is supported; protocol-relative URLs are not.
        if (strpos($raw, '/') === 0 && strpos($raw, '//') !== 0 && strpos($raw, '\\') === false) {
            return self::cut(esc_url_raw(home_url($raw), array('http', 'https')), 2000);
        }
        $parts = wp_parse_url($raw);
        if (!is_array($parts) || empty($parts['host']) || empty($parts['scheme']) || !in_array(strtolower($parts['scheme']), array('http', 'https'), true) || isset($parts['user']) || isset($parts['pass'])) {
            return '';
        }
        return self::cut(esc_url_raw($raw, array('http', 'https')), 2000);
    }

    private static function parameter($raw, $fallback) {
        return is_string($raw) && preg_match('/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/', $raw) ? $raw : $fallback;
    }

    private static function paths($raw) {
        if (is_string($raw)) {
            $raw = preg_split('/\r?\n/', $raw);
        }
        if (!is_array($raw)) {
            return array();
        }
        $paths = array();
        foreach (array_slice($raw, 0, 100) as $item) {
            $path = self::literal($item, 500);
            if (strpos($path, '/') !== 0 || strpos($path, '//') === 0 || strpos($path, '?') !== false || strpos($path, '#') !== false) {
                continue;
            }
            if (substr_count($path, '*') > 1 || (strpos($path, '*') !== false && substr($path, -1) !== '*')) {
                continue;
            }
            $paths[] = $path;
        }
        return array_values(array_unique($paths));
    }

    public static function sanitize($raw) {
        $out = self::defaults();
        if (!is_array($raw)) {
            return $out;
        }
        $out['enabled'] = self::bool_value(isset($raw['enabled']) ? $raw['enabled'] : false);
        $out['debug'] = self::bool_value(isset($raw['debug']) ? $raw['debug'] : false);
        $out['referrers'] = self::hosts(isset($raw['referrers']) ? $raw['referrers'] : array());
        $seen = array();
        $campaigns = isset($raw['campaigns']) && is_array($raw['campaigns']) ? array_slice($raw['campaigns'], 0, 50) : array();
        foreach ($campaigns as $raw_campaign) {
            if (!is_array($raw_campaign)) {
                continue;
            }
            $c = self::campaign($raw_campaign);
            if (!$c['id'] || isset($seen[$c['id']])) {
                $c['id'] = 'rfa-' . wp_generate_uuid4();
            }
            $seen[$c['id']] = true;
            $out['campaigns'][] = $c;
        }
        return $out;
    }

    public static function campaign($raw) {
        $defaults = self::campaign_defaults();
        $r = array_merge($defaults, $raw);
        $c = $defaults;
        $c['id'] = self::cut(sanitize_key(is_scalar($r['id']) ? (string) $r['id'] : ''), 80);
        foreach (array('name', 'headline', 'description', 'label', 'buttonText', 'imageAlt') as $key) {
            $c[$key] = self::text($r[$key], $key === 'description' ? 1000 : 250);
        }
        // A visible advertising label cannot be removed.
        $c['label'] = $c['label'] ?: 'Iklan';
        $c['buttonText'] = $c['buttonText'] ?: 'Lihat penawaran';
        foreach (array('enabled', 'responsive', 'forwardPage', 'requireVisible') as $key) {
            $c[$key] = self::bool_value($r[$key]);
        }
        $c['format'] = self::choice($r['format'], array('banner', 'sticky', 'native', 'interstitial', 'popunder'), 'banner');
        $c['imageUrl'] = self::url($r['imageUrl']);
        $c['directUrl'] = self::url($r['directUrl']);
        $c['linkMode'] = self::choice($r['linkMode'], array('direct', 'parameter'), 'direct');
        $c['parameterName'] = self::parameter($r['parameterName'], 'ad_url');
        $c['sourceParameter'] = self::parameter($r['sourceParameter'], 'source_page');
        $c['allowedLinkHosts'] = self::hosts($r['allowedLinkHosts']);
        $c['width'] = self::number($r['width'], 120, 1600, 728);
        $c['height'] = self::number($r['height'], 50, 1200, 90);
        $c['stickyPosition'] = self::choice($r['stickyPosition'], array('top', 'bottom'), 'bottom');
        $p = array_merge($defaults['placement'], isset($r['placement']) && is_array($r['placement']) ? $r['placement'] : array());
        $c['placement']['type'] = self::choice($p['type'], array('css', 'xpath', 'id', 'name', 'class', 'attribute', 'text'), 'css');
        $c['placement']['value'] = self::literal($p['value'], 2000);
        $c['placement']['attribute'] = is_string($p['attribute']) && preg_match('/^[a-zA-Z_][a-zA-Z0-9_.:-]{0,99}$/', $p['attribute']) ? $p['attribute'] : 'data-testid';
        $c['placement']['textExact'] = self::bool_value($p['textExact']);
        $c['placement']['tags'] = self::literal($p['tags'], 500);
        $c['placement']['insert'] = self::choice($p['insert'], array('before', 'after', 'append', 'prepend'), 'prepend');
        $c['pageMode'] = self::choice($r['pageMode'], array('all', 'include', 'exclude'), 'all');
        $c['pages'] = self::paths($r['pages']);
        $c['devices'] = self::choice($r['devices'], array('all', 'desktop', 'mobile'), 'all');
        $c['delay'] = self::number($r['delay'], 0, 60000, 500);
        $c['timeout'] = self::number($r['timeout'], 1000, 120000, 15000);
        $c['closeDelay'] = self::number($r['closeDelay'], 0, 30, 0);
        $c['frequency'] = self::choice($r['frequency'], array('page', 'session', 'always'), 'page');
        return $c;
    }
}
