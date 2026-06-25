FROM rust:1.68.2-bullseye AS proxy-builder

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse

RUN cargo install lsp-ws-proxy --locked --root /out


FROM eclipse-temurin:21-jre

ARG LTEX_VERSION=18.7.0
ENV WS_PORT=7020

WORKDIR /opt

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates tar gzip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fL -o /tmp/ltex-ls-plus.tar.gz \
        "https://github.com/ltex-plus/ltex-ls-plus/releases/download/${LTEX_VERSION}/ltex-ls-plus-${LTEX_VERSION}-linux-x64.tar.gz" \
    && tar -xzf /tmp/ltex-ls-plus.tar.gz -C /opt \
    && rm /tmp/ltex-ls-plus.tar.gz

COPY --from=proxy-builder /out/bin/lsp-ws-proxy /usr/local/bin/lsp-ws-proxy

RUN chmod +x /usr/local/bin/lsp-ws-proxy \
    && chmod +x /opt/ltex-ls-plus-18.7.0/bin/ltex-ls-plus

EXPOSE 7020

ENTRYPOINT ["sh", "-c", "exec lsp-ws-proxy -l 0.0.0.0:$WS_PORT -- /opt/ltex-ls-plus-18.7.0/bin/ltex-ls-plus"]
