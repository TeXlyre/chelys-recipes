FROM rust:1.68.2-bullseye AS proxy-builder

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse

RUN cargo install lsp-ws-proxy --locked --root /out


FROM rust:1-slim AS harper-builder

RUN cargo install harper-ls@2.5.0 --locked --root /out


FROM debian:stable-slim

ENV WS_PORT=7000

COPY --from=harper-builder /out/bin/harper-ls /usr/local/bin/harper-ls
COPY --from=proxy-builder /out/bin/lsp-ws-proxy /usr/local/bin/lsp-ws-proxy

RUN chmod +x /usr/local/bin/harper-ls \
    && chmod +x /usr/local/bin/lsp-ws-proxy

EXPOSE 7000

ENTRYPOINT ["sh", "-c", "exec lsp-ws-proxy -l 0.0.0.0:$WS_PORT -- harper-ls --stdio"]
