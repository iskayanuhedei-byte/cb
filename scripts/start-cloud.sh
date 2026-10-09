#!/bin/bash
set -euo pipefail
RFA_RUNTIME=/workspace/.rfa-runtime
RFA_LOGIN=http://127.0.0.1:8090/wp-login.php
if ! curl -fsS "$RFA_LOGIN" -o "$RFA_RUNTIME/login-health.html"; then
  nohup "$RFA_RUNTIME/php-cli" -S 127.0.0.1:8090 -t "$RFA_RUNTIME/wordpress" > "$RFA_RUNTIME/wordpress-server.log" 2>&1 < /dev/null &
  for RFA_ATTEMPT in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$RFA_LOGIN" -o "$RFA_RUNTIME/login-health.html"; then break; fi
    sleep 1
  done
fi
if ! rg -q 'id="user_login"' "$RFA_RUNTIME/login-health.html"; then
  printf '%s\n' 'WordPress readiness failed; inspect /workspace/.rfa-runtime/wordpress-server.log' >&2
  exit 1
fi
printf '%s\n' 'WordPress local login request passed; development server available internally.'
