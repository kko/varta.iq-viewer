FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8788 CONFIG_DIR=/app/config DATA_DIR=/app/data
COPY --chown=node:node collector/ ./collector/
COPY --chown=node:node shared/ ./shared/
COPY --chown=node:node gateway-https.mjs settings.mjs ./
COPY --chown=node:node certificates/ ./certificates/
COPY --chown=node:node public/style.css ./public/style.css
RUN mkdir -p /app/config /app/data && chown -R node:node /app/config /app/data
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node","--input-type=module","-e","import https from 'node:https'; const r=https.get('https://127.0.0.1:8788/healthz',{rejectUnauthorized:false,timeout:4000},s=>process.exit(s.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.on('timeout',()=>process.exit(1));"]
CMD ["node", "collector/server.mjs"]
