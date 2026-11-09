# HR intake service (career form). Build from the hr-api/ directory:
#   docker build -t stanford-hr-api hr-api/
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8787

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY assets ./assets
COPY validation.mjs photo.mjs pdf.mjs telegram.mjs server.mjs ./

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
