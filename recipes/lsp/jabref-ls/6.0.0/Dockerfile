FROM rust:1.68.2-bullseye AS proxy-builder

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse

RUN cargo install lsp-ws-proxy --locked --root /out


FROM eclipse-temurin:21-jdk

ENV WS_PORT=7021
ENV JABLS_PORT=2087
ENV PATH="/root/.jbang/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates socat \
    && rm -rf /var/lib/apt/lists/*

RUN curl -Ls https://sh.jbang.dev | bash -s - app setup

RUN jbang trust add https://raw.githubusercontent.com/JabRef/jabref/main/.jbang/

RUN jbang https://raw.githubusercontent.com/JabRef/jabref/main/.jbang/JabLsLauncher.java --help

COPY --from=proxy-builder /out/bin/lsp-ws-proxy /usr/local/bin/lsp-ws-proxy

RUN chmod +x /usr/local/bin/lsp-ws-proxy \
    && cat > /usr/local/bin/entrypoint.sh <<'SCRIPT' \
    && chmod +x /usr/local/bin/entrypoint.sh
#!/bin/sh
set -e

jbang https://raw.githubusercontent.com/JabRef/jabref/main/.jbang/JabLsLauncher.java -p "$JABLS_PORT" &

while ! socat -T1 - TCP:127.0.0.1:"$JABLS_PORT" </dev/null >/dev/null 2>&1; do
  sleep 0.5
done

exec lsp-ws-proxy -l "0.0.0.0:$WS_PORT" -- socat STDIO "TCP:127.0.0.1:$JABLS_PORT"
SCRIPT

EXPOSE 7021

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
