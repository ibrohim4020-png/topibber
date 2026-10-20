# Railway: sayt + API bitta Node serverda (baza — SQLite, /data papkasi Railway Volume'da)
FROM node:24-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
CMD ["node", "--no-warnings", "server/index.js"]
