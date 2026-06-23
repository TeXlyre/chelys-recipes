FROM rust:1.68.2-bullseye AS proxy-builder

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse

RUN cargo install lsp-ws-proxy --locked --root /out


FROM debian:stable-slim

ARG TINYMIST_VERSION=v0.15.2
ENV WS_PORT=7030

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates tar gzip fonts-dejavu fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fL -o /tmp/tinymist.tar.gz \
        "https://github.com/Myriad-Dreamin/tinymist/releases/download/${TINYMIST_VERSION}/tinymist-x86_64-unknown-linux-gnu.tar.gz" \
    && tar -xzf /tmp/tinymist.tar.gz -C /usr/local/bin --strip-components=1 \
    && rm /tmp/tinymist.tar.gz

COPY --from=proxy-builder /out/bin/lsp-ws-proxy /usr/local/bin/lsp-ws-proxy

RUN chmod +x /usr/local/bin/lsp-ws-proxy \
    && chmod +x /usr/local/bin/tinymist \
    && mkdir -p /workspace

WORKDIR /workspace

EXPOSE 7030

ENTRYPOINT ["sh", "-c", "exec env RUST_LOG=error lsp-ws-proxy -l 0.0.0.0:$WS_PORT -- tinymist lsp"]
