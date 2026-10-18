# Railway uchun: statik saytni Caddy veb-serveri orqali beradi
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv
