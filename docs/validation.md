# Validation evidence

Validated in the current isolated cloud instance on 9 October 2026 using WordPress 6.8.3, PHP 8.4.24, the official WordPress SQLite development adapter, and Chromium with Playwright.

| Check | Result |
| --- | --- |
| `node tests/frontend.spec.cjs` | 33/33 browser checks passed |
| `/workspace/.rfa-runtime/php-cli tests/config-test.php` | 18/18 PHP/WordPress checks passed |
| `node tests/wp-browser.spec.cjs` | 14/14 actual WordPress/admin integration checks passed |
| `node tests/save-shape.spec.cjs` | 10/10 actual AJAX persistence/validation checks passed |
| PHP/JS syntax and shell parsing | Passed |
| `scripts/setup-cloud.sh` repeat execution | Passed; reused retained dependencies and database |
| `scripts/start-cloud.sh` after stopping our test server, then repeat execution | Passed; representative WordPress login request verified |
| ZIP integrity | Passed; one `referral-ads/` plugin directory at archive root |

Browser checks cover mandatory incoming referrer, hostname boundaries, all five formats, flexible placement, visible labels including compact sizes, delay/observer cleanup, safe URL parameters and forwarding, frequency, storage denial, popup user interaction/opener isolation, dialog focus/dismissal, and no code injection from creative text. WordPress tests use the actual database and secured AJAX endpoint and restore existing settings after execution.

No uncaught JavaScript errors were observed in these suites. Optional WordPress.org background update checks encounter the cloud network restrictions; they are independent of plugin behavior. Other browsers, other WordPress/PHP versions, arbitrary third-party themes, production traffic, email delivery, and third-party ad network tags were not validated.

Reusable `install_script` and `start_skill` were saved to the cloud configuration draft. The environment has not been published and restoration in a fresh task has not been verified. User review/save and publication are separate product actions.
