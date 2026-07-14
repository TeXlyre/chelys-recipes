ARG SILE_VERSION=0.15.7

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM ghcr.io/sile-typesetter/sile:v${SILE_VERSION}

USER root

COPY --from=bridge /opt/chelys /opt/chelys

ENV WS_PORT=7040
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_CMD=sile
ENV ENGINE_ARGS='-o ${output} ${mainFile}'
ENV ENGINE_OUTPUT=output.pdf
ENV ENGINE_MIME=application/pdf

WORKDIR /workspace

EXPOSE 7040

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]