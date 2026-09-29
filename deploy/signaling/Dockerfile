FROM node:24-alpine
WORKDIR /app
COPY deploy/signaling/package.json deploy/signaling/package-lock.json ./
RUN npm ci --omit=dev && mkdir /app/data && chown node:node /app/data
COPY server/signaling.mjs ./signaling.mjs
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8788 DATA_DIR=/app/data
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","signaling.mjs"]
