ARG SLIDEV_VERSION=52.18.0
ARG PLAYWRIGHT_VERSION=1.61.1

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

ARG SLIDEV_VERSION

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
    @slidev/cli@${SLIDEV_VERSION} \
    @slidev/types@${SLIDEV_VERSION} \
    @slidev/theme-default@latest \
    @slidev/theme-seriph@latest \
    @slidev/theme-apple-basic@latest \
    @slidev/theme-bricks@latest \
    @slidev/theme-shibainu@latest \
    playwright-chromium@${PLAYWRIGHT_VERSION}

RUN mkdir -p /workspace/node_modules/@slidev \
    && ln -s "$(npm root -g)/@slidev/types" /workspace/node_modules/@slidev/types \
    && ln -s "$(npm root -g)/@slidev/theme-default" /workspace/node_modules/@slidev/theme-default \
    && ln -s "$(npm root -g)/@slidev/theme-seriph" /workspace/node_modules/@slidev/theme-seriph \
    && ln -s "$(npm root -g)/@slidev/theme-apple-basic" /workspace/node_modules/@slidev/theme-apple-basic \
    && ln -s "$(npm root -g)/@slidev/theme-bricks" /workspace/node_modules/@slidev/theme-bricks \
    && ln -s "$(npm root -g)/@slidev/theme-shibainu" /workspace/node_modules/@slidev/theme-shibainu

COPY --from=bridge /opt/chelys /opt/chelys

ADD https://texlyre.github.io/chelys-recipes/recipes/typesetter/slidev/52.18.0/engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7044
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=180000
ENV SLIDEV_BIN=slidev
ENV PYTHON_BIN=python3

WORKDIR /workspace

EXPOSE 7044

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
