<?php
/**
 * Plugin Name: Referral Ads
 * Description: Iklan berbasis referrer wajib dengan target fleksibel, banner, sticky, native, interstitial, dan popunder berbasis klik.
 * Version: 1.0.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: Referral Ads
 * License: GPL-2.0-or-later
 * Text Domain: referral-ads
 */

if (!defined('ABSPATH')) {
    exit;
}

define('RFA_VERSION', '1.0.0');
define('RFA_DIR', plugin_dir_path(__FILE__));
define('RFA_URL', plugin_dir_url(__FILE__));
require_once RFA_DIR . 'includes/config.php';

final class RFA_Plugin {
    const OPTION = 'rfa_config';
    private static $admin_hook = '';

    public static function init() {
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('admin_enqueue_scripts', array(__CLASS__, 'admin_assets'));
        add_action('wp_enqueue_scripts', array(__CLASS__, 'frontend_assets'));
        add_action('wp_ajax_rfa_save', array(__CLASS__, 'save'));
        add_shortcode('referral_ads_slot', array(__CLASS__, 'slot'));
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), array(__CLASS__, 'action_links'));
    }

    public static function config() {
        return RFA_Config::sanitize(get_option(self::OPTION, RFA_Config::defaults()));
    }

    public static function admin_menu() {
        self::$admin_hook = add_menu_page(
            'Referral Ads', 'Referral Ads', 'manage_options', 'referral-ads',
            array(__CLASS__, 'admin_page'), 'dashicons-megaphone', 58
        );
    }

    public static function admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        echo '<div class="wrap"><div id="rfa-admin"><p>' . esc_html__('Memuat pengaturan Referral Ads…', 'referral-ads') . '</p></div></div>';
        echo '<noscript><p>' . esc_html__('Aktifkan JavaScript untuk mengelola kampanye.', 'referral-ads') . '</p></noscript>';
    }

    public static function admin_assets($hook) {
        if ($hook !== self::$admin_hook || !current_user_can('manage_options')) {
            return;
        }
        wp_enqueue_media();
        wp_enqueue_style('rfa-admin', RFA_URL . 'assets/admin.css', array(), RFA_VERSION);
        wp_enqueue_script('rfa-admin', RFA_URL . 'assets/admin.js', array(), RFA_VERSION, true);
        $boot = array(
            'config' => self::config(),
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('rfa_save'),
            'version' => RFA_VERSION,
        );
        wp_add_inline_script('rfa-admin', 'window.RFA_ADMIN = ' . wp_json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    }

    public static function frontend_assets() {
        if (is_admin() || is_feed() || is_preview()) {
            return;
        }
        $config = self::config();
        if (!$config['enabled'] || empty($config['referrers'])) {
            return;
        }
        $config['campaigns'] = array_values(array_filter($config['campaigns'], function ($campaign) {
            return $campaign['enabled'];
        }));
        if (!$config['campaigns']) {
            return;
        }
        wp_enqueue_style('rfa-frontend', RFA_URL . 'assets/frontend.css', array(), RFA_VERSION);
        wp_enqueue_script('rfa-frontend', RFA_URL . 'assets/frontend.js', array(), RFA_VERSION, true);
        wp_add_inline_script('rfa-frontend', 'window.RFA_CONFIG = ' . wp_json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    }

    public static function save() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Anda tidak berwenang mengubah pengaturan.'), 403);
        }
        check_ajax_referer('rfa_save', 'nonce');
        if (!isset($_POST['config']) || !is_string($_POST['config'])) {
            wp_send_json_error(array('message' => 'Pengaturan tidak valid.'), 400);
        }
        $raw = wp_unslash($_POST['config']);
        if (strlen($raw) > 200000) {
            wp_send_json_error(array('message' => 'Pengaturan terlalu besar. Maksimum 200 KB.'), 413);
        }
        $shape = json_decode($raw);
        if (json_last_error() !== JSON_ERROR_NONE || !is_object($shape)) {
            wp_send_json_error(array('message' => 'Format JSON pengaturan tidak valid.'), 400);
        }
        if (property_exists($shape, 'campaigns') && (!is_array($shape->campaigns) || count($shape->campaigns) > 50)) {
            wp_send_json_error(array('message' => 'Maksimum 50 kampanye per konfigurasi.'), 400);
        }
        if (property_exists($shape, 'campaigns')) {
            foreach ($shape->campaigns as $campaign) {
                if (!is_object($campaign)) {
                    wp_send_json_error(array('message' => 'Setiap kampanye harus berupa objek pengaturan.'), 400);
                }
            }
        }
        $decoded = json_decode($raw, true);
        $config = RFA_Config::sanitize($decoded);
        update_option(self::OPTION, $config, false);
        if (get_option(self::OPTION) !== $config) {
            wp_send_json_error(array('message' => 'Pengaturan belum tersimpan. Periksa koneksi database.'), 500);
        }
        wp_send_json_success(array('config' => $config));
    }

    public static function action_links($links) {
        array_unshift($links, '<a href="' . esc_url(admin_url('admin.php?page=referral-ads')) . '">' . esc_html__('Pengaturan', 'referral-ads') . '</a>');
        return $links;
    }

    public static function slot($atts) {
        $atts = shortcode_atts(array('id' => 'promo-slot'), $atts, 'referral_ads_slot');
        $id = sanitize_html_class($atts['id'], 'promo-slot');
        // Empty placement marker only. Referrer rules still gate every creative.
        return '<div id="' . esc_attr($id) . '" class="rfa-slot"></div>';
    }
}

RFA_Plugin::init();
