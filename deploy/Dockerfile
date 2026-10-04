FROM node:24-alpine
WORKDIR /app
COPY server.ts ./
COPY src/web/production-server.ts src/web/web-game-upload.ts ./src/web/
COPY dist/ ./dist/
ENV NODE_ENV=production PORT=8080 SANGUOCE_TRACE_DIR=/app/traces
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.ts"]
