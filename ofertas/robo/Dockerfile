FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY *.js ./
ENV PASTA_SESSOES=/app/dados/sessoes NODE_ENV=production
VOLUME /app/dados
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3010/saude || exit 1
CMD ["node", "index.js"]
