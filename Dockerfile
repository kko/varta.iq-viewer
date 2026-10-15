FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/app/data \
    CONFIG_DIR=/app/config

WORKDIR /app
COPY --chown=node:node package.json server.mjs history.mjs settings.mjs ./
COPY --chown=node:node public/ ./public/
RUN mkdir -p /app/data /app/config && chown node:node /app/data /app/config

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "--input-type=module", "-e", "const r = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/settings', {signal: AbortSignal.timeout(4000)}); if (!r.ok) process.exit(1)"]
CMD ["node", "server.mjs"]
