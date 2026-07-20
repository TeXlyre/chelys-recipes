ARG NODE_VERSION=22

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM node:${NODE_VERSION}-bookworm-slim AS node

FROM texlive/texlive:latest-full

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 python3-pygments \
    inkscape \
    gnuplot-nox \
    ghostscript \
    imagemagick \
    default-jre-headless \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version && npm --version

COPY --from=bridge /opt/chelys /opt/chelys

ADD https://texlyre.github.io/chelys-recipes/recipes/typesetter/texlive/2026.0.0/engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7045
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=300000
ENV LATEXMK_BIN=latexmk

WORKDIR /workspace

EXPOSE 7045

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
