FROM rust:1.68.2-bullseye AS proxy-builder

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse

RUN cargo install lsp-ws-proxy --locked --root /out


FROM debian:stable-slim

ARG TEXLAB_VERSION=v5.26.0
ENV WS_PORT=7031

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates tar gzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fL -o /tmp/texlab.tar.gz \
        "https://github.com/latex-lsp/texlab/releases/download/${TEXLAB_VERSION}/texlab-x86_64-linux.tar.gz" \
    && tar -xzf /tmp/texlab.tar.gz -C /usr/local/bin texlab \
    && rm /tmp/texlab.tar.gz

COPY --from=proxy-builder /out/bin/lsp-ws-proxy /usr/local/bin/lsp-ws-proxy

RUN chmod +x /usr/local/bin/lsp-ws-proxy \
    && chmod +x /usr/local/bin/texlab \
    && mkdir -p /workspace

WORKDIR /workspace

EXPOSE 7031

ENTRYPOINT ["sh", "-c", "exec env RUST_LOG=error lsp-ws-proxy -l 0.0.0.0:$WS_PORT -- texlab"]
