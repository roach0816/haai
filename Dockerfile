# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json tsconfig.server.json tsconfig.client.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ARG VERSION=0.0.0
ARG REVISION=unknown
ARG SOURCE=https://github.com/roach0816/haai

LABEL org.opencontainers.image.title="Home Assistant AI" \
  org.opencontainers.image.description="Read-only Home Assistant automation advisor" \
  org.opencontainers.image.source="${SOURCE}" \
  org.opencontainers.image.version="${VERSION}" \
  org.opencontainers.image.revision="${REVISION}" \
  org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
  HAAI_HOST=0.0.0.0 \
  HAAI_PORT=8787 \
  HAAI_DATA_DIR=/data \
  HAAI_RESTART_MODE=direct \
  HAAI_DEPLOYMENT_MODE=container

WORKDIR /app

RUN groupadd --system --gid 10001 haai \
  && useradd --system --uid 10001 --gid haai --home-dir /data --shell /usr/sbin/nologin haai \
  && mkdir -p /data \
  && chown -R haai:haai /app /data

COPY --from=build --chown=haai:haai /app/package.json /app/package-lock.json ./
COPY --from=build --chown=haai:haai /app/node_modules ./node_modules
COPY --from=build --chown=haai:haai /app/dist ./dist

USER haai

EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port=process.env.HAAI_PORT||'8787'; fetch('http://127.0.0.1:'+port+'/api/system/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
