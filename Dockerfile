# Railway uchun: statik saytni Caddy veb-serveri orqali beradi (admin panel login bilan)
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY start.sh /start.sh
COPY . /srv
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh
CMD ["/start.sh"]
