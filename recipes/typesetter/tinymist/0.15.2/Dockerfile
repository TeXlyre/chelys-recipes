ARG TINYMIST_VERSION=v0.15.2
ARG TYPST_TS_VERSION=v0.8.0-rc3

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM debian:stable-slim

ARG TINYMIST_VERSION
ARG TYPST_TS_VERSION

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    curl ca-certificates tar gzip \
    fonts-dejavu fonts-liberation \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fL -o /tmp/tinymist.tar.gz \
        "https://github.com/Myriad-Dreamin/tinymist/releases/download/${TINYMIST_VERSION}/tinymist-x86_64-unknown-linux-gnu.tar.gz" \
    && tar -xzf /tmp/tinymist.tar.gz -C /usr/local/bin --strip-components=1 \
    && rm /tmp/tinymist.tar.gz \
    && chmod +x /usr/local/bin/tinymist \
    && tinymist probe

RUN curl -fL -o /tmp/typst-ts-cli.tar.gz \
        "https://github.com/Myriad-Dreamin/typst.ts/releases/download/${TYPST_TS_VERSION}/typst-ts-x86_64-unknown-linux-gnu.tar.gz" \
    && tar -xzf /tmp/typst-ts-cli.tar.gz -C /usr/local/bin --strip-components=1 \
    && rm /tmp/typst-ts-cli.tar.gz \
    && chmod +x /usr/local/bin/typst-ts-cli \
    && typst-ts-cli --version

COPY --from=bridge /opt/chelys /opt/chelys

RUN mkdir -p /opt/chelys/node_modules/fflate/esm /opt/chelys/node_modules/fflate/lib
ADD https://unpkg.com/fflate@0.8.2/package.json /opt/chelys/node_modules/fflate/package.json
ADD https://unpkg.com/fflate@0.8.2/lib/node.cjs /opt/chelys/node_modules/fflate/lib/node.cjs
ADD https://unpkg.com/fflate@0.8.2/esm/browser.js /opt/chelys/node_modules/fflate/esm/browser.js

ADD https://texlyre.github.io/chelys-recipes/recipes/typesetter/tinymist/0.15.2/engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7046
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=120000
ENV TINYMIST_BIN=tinymist
ENV TYPST_TS_BIN=typst-ts-cli

WORKDIR /workspace

EXPOSE 7046

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
