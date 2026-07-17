ARG NODE_VERSION=22

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM node:${NODE_VERSION}-bookworm-slim AS node

FROM texlive/texlive:latest-full

ENV DEBIAN_FRONTEND=noninteractive

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version \
    && npm --version

ENV TEXMFCACHE=/var/cache/context

RUN mkdir -p "${TEXMFCACHE}" \
    && chmod 1777 "${TEXMFCACHE}" \
    && mtxrun --generate \
    && context --make \
    && context --version \
    && luametatex --version

COPY --from=bridge /opt/chelys /opt/chelys

ADD https://texlyre.github.io/chelys-recipes/recipes/typesetter/context/2026.0.0/engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7042
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=300000
ENV CONTEXT_BIN=context

WORKDIR /workspace

EXPOSE 7042

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
