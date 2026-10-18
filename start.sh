#!/bin/sh
# Admin panel paroli Railway "Variables" bo'limidagi ADMIN_PASSWORD dan olinadi (kodda saqlanmaydi).
# Parol berilmagan bo'lsa, tasodifiy parol o'rnatiladi — admin panel hech kimga ochilmaydi.
if [ -z "$ADMIN_PASSWORD" ]; then
  echo "ADMIN_PASSWORD berilmagan: admin panel yopiq"
  ADMIN_PASSWORD=$(head -c 32 /dev/urandom | base64)
fi
export ADMIN_HASH=$(caddy hash-password --plaintext "$ADMIN_PASSWORD")
unset ADMIN_PASSWORD
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
