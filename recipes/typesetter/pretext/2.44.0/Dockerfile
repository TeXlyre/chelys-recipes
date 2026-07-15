ARG PRETEXT_VERSION=2.44.0
ARG NODE_VERSION=22

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM node:${NODE_VERSION}-bookworm-slim AS node

FROM texlive/texlive:latest-full

ARG PRETEXT_VERSION

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv pdf2svg \
    liblouis-bin liblouisutdml-bin liblouisutdml-data python3-louis xsltproc \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version && npm --version

RUN python3 -m venv --system-site-packages /opt/pretext \
    && /opt/pretext/bin/pip install --no-cache-dir "pretext==${PRETEXT_VERSION}"

COPY --from=bridge /opt/chelys /opt/chelys

ADD https://texlyre.github.io/chelys-recipes/recipes/typesetter/pretext/2.44.0/engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7041
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=900000
ENV PRETEXT_BIN=/opt/pretext/bin/pretext
ENV PYTHON_BIN=/usr/bin/python3

WORKDIR /workspace

EXPOSE 7041

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]