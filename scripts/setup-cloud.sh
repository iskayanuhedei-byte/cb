#!/bin/bash
# Isolated Debian 13 cloud development runtime. Never changes plugin sources.
set -euo pipefail
RFA_RUNTIME=/workspace/.rfa-runtime
RFA_REPO=/workspace/cb
mkdir -p "$RFA_RUNTIME"

if [ ! -x "$RFA_RUNTIME/php/usr/bin/php8.4" ]; then
  mkdir -p "$RFA_RUNTIME/debs" "$RFA_RUNTIME/php" \
    "$RFA_RUNTIME/apt/etc/sources.list.d" "$RFA_RUNTIME/apt/etc/apt.conf.d" \
    "$RFA_RUNTIME/apt/etc/preferences.d" "$RFA_RUNTIME/apt/state/lists/partial" \
    "$RFA_RUNTIME/apt/cache/archives/partial"
  printf '%s\n' 'deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main' > "$RFA_RUNTIME/apt/etc/sources.list"
  RFA_APT=(-o "Dir::Etc=$RFA_RUNTIME/apt/etc" -o "Dir::State=$RFA_RUNTIME/apt/state" -o "Dir::Cache=$RFA_RUNTIME/apt/cache" -o APT::Sandbox::User=agent)
  /usr/bin/apt-get "${RFA_APT[@]}" update
  (
    cd "$RFA_RUNTIME/debs"
    /usr/bin/apt-get "${RFA_APT[@]}" download php8.4-cli php8.4-common php8.4-sqlite3 php8.4-xml php8.4-curl php8.4-mbstring libxml2 libonig5 libsodium23 libargon2-1
  )
  for RFA_PACKAGE in "$RFA_RUNTIME/debs/"*.deb; do
    dpkg-deb -x "$RFA_PACKAGE" "$RFA_RUNTIME/php"
  done
fi
if [ ! -f "$RFA_RUNTIME/php-cli" ]; then
  cat > "$RFA_RUNTIME/php-cli" <<'SH'
#!/bin/sh
RFA_RUNTIME=/workspace/.rfa-runtime
export LD_LIBRARY_PATH="$RFA_RUNTIME/php/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
RFA_EXT="$RFA_RUNTIME/php/usr/lib/php/20240924"
exec "$RFA_RUNTIME/php/usr/bin/php8.4" -n -d "extension_dir=$RFA_EXT" \
 -d extension=ctype -d extension=iconv -d extension=tokenizer -d extension=mbstring \
 -d extension=pdo -d extension=pdo_sqlite -d extension=sqlite3 -d extension=dom \
 -d extension=simplexml -d extension=xml -d extension=xmlreader -d extension=xmlwriter \
 -d extension=fileinfo -d extension=curl -d extension=phar -d memory_limit=256M "$@"
SH
  chmod +x "$RFA_RUNTIME/php-cli"
fi
"$RFA_RUNTIME/php-cli" -r 'if(!extension_loaded("pdo_sqlite")){exit(1);} echo "PHP runtime ready: ".PHP_VERSION."\n";'

# Pin the official test fixture sources. Reuse existing checkouts without reset.
if [ ! -d "$RFA_RUNTIME/wordpress" ]; then
  git clone --depth 1 --branch 6.8.3 https://github.com/WordPress/WordPress.git "$RFA_RUNTIME/wordpress"
fi
test "$(git -C "$RFA_RUNTIME/wordpress" rev-parse HEAD)" = ba9e7f97f08a7fbb88fbfa35641bcc230500b37a
if [ ! -d "$RFA_RUNTIME/sqlite-database-integration" ]; then
  git init "$RFA_RUNTIME/sqlite-database-integration"
  git -C "$RFA_RUNTIME/sqlite-database-integration" remote add origin https://github.com/WordPress/sqlite-database-integration.git
  git -C "$RFA_RUNTIME/sqlite-database-integration" fetch --depth 1 origin 6546e4538b708a1d8a565a1d31688bd63b610fa3
  git -C "$RFA_RUNTIME/sqlite-database-integration" checkout --detach FETCH_HEAD
fi
test "$(git -C "$RFA_RUNTIME/sqlite-database-integration" rev-parse HEAD)" = 6546e4538b708a1d8a565a1d31688bd63b610fa3

mkdir -p "$RFA_RUNTIME/wordpress/wp-content/plugins"
if [ ! -e "$RFA_RUNTIME/wordpress/wp-content/plugins/referral-ads" ]; then
  ln -s "$RFA_REPO/referral-ads" "$RFA_RUNTIME/wordpress/wp-content/plugins/referral-ads"
fi
if [ ! -e "$RFA_RUNTIME/wordpress/wp-content/plugins/sqlite-database-integration" ]; then
  ln -s "$RFA_RUNTIME/sqlite-database-integration/packages/plugin-sqlite-database-integration" "$RFA_RUNTIME/wordpress/wp-content/plugins/sqlite-database-integration"
fi
if [ ! -f "$RFA_RUNTIME/wordpress/wp-content/db.php" ]; then
  cp "$RFA_RUNTIME/sqlite-database-integration/packages/plugin-sqlite-database-integration/db.copy" "$RFA_RUNTIME/wordpress/wp-content/db.php"
fi
if [ ! -f "$RFA_RUNTIME/wp-salts.php" ]; then
  python3 - <<'PY'
import secrets
from pathlib import Path
p = Path('/workspace/.rfa-runtime/wp-salts.php')
p.write_text('<?php\n' + ''.join("define('%s', '%s');\n" % (k, secrets.token_hex(48)) for k in ['AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT']))
p.chmod(0o600)
PY
fi
if [ ! -f "$RFA_RUNTIME/wordpress/wp-config.php" ]; then
  cat > "$RFA_RUNTIME/wordpress/wp-config.php" <<'PHP'
<?php
define('DB_NAME', 'referral_ads_development');
define('DB_USER', ''); define('DB_PASSWORD', ''); define('DB_HOST', 'localhost');
define('DB_CHARSET', 'utf8'); define('DB_COLLATE', '');
define('DB_ENGINE', 'sqlite'); define('DB_PATH', '/workspace/.rfa-runtime/site.sqlite');
define('WP_HOME', 'http://127.0.0.1:8090'); define('WP_SITEURL', 'http://127.0.0.1:8090');
define('WP_DEBUG', true); define('WP_DEBUG_LOG', '/workspace/.rfa-runtime/wordpress-debug.log');
define('WP_DEBUG_DISPLAY', false); define('DISABLE_WP_CRON', true);
define('AUTOMATIC_UPDATER_DISABLED', true); define('DISALLOW_FILE_MODS', true);
require_once '/workspace/.rfa-runtime/wp-salts.php';
$table_prefix = 'rfa_wp_';
if (!defined('ABSPATH')) { define('ABSPATH', __DIR__ . '/'); }
require_once ABSPATH . 'wp-settings.php';
PHP
fi
if [ ! -f "$RFA_RUNTIME/install-wordpress.php" ]; then
  cat > "$RFA_RUNTIME/install-wordpress.php" <<'PHP'
<?php
define('WP_INSTALLING', true);
require __DIR__ . '/wordpress/wp-load.php';
add_filter('pre_wp_mail', '__return_true');
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
if (!is_blog_installed()) {
    wp_install('Referral Ads Development', 'rfa_developer', 'developer@example.test', true, '', wp_generate_password(32, true, true));
}
require_once ABSPATH . 'wp-admin/includes/plugin.php';
$result = activate_plugin('referral-ads/referral-ads.php');
if (is_wp_error($result)) { fwrite(STDERR, $result->get_error_message()); exit(1); }
echo 'Plugin active; WordPress ' . get_bloginfo('version') . '; PHP ' . PHP_VERSION . "\n";
PHP
fi
"$RFA_RUNTIME/php-cli" "$RFA_RUNTIME/install-wordpress.php"
cd "$RFA_REPO"
"$RFA_RUNTIME/php-cli" tests/config-test.php
node --check referral-ads/assets/frontend.js
node --check referral-ads/assets/admin.js
python3 scripts/package.py
