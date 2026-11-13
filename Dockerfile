FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /app
COPY --chown=node:node server/ ./server/
COPY --chown=node:node h5/ ./h5/
ENV NODE_ENV=production PORT=8787 STATIC_DIR=/app/h5
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1:8787/lobby/ || exit 1
CMD ["node", "server/server.js"]
