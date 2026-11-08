FROM node:22-bookworm-slim

ARG TARGETARCH
ARG WEBSOCAT_VERSION=1.14.1
ARG CLAUDE_AGENT_ACP_VERSION=0.89.1

ENV WS_PORT=7060
ENV TEXLYRE_ACP_WORKSPACE=/home/node/workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    case "$TARGETARCH" in \
        amd64) target=x86_64-unknown-linux-musl; sha=66f8dd3a0394761556339117f8bb5123bddefd44e087af2a72ec22b0bd08d514 ;; \
        arm64) target=aarch64-unknown-linux-musl; sha=711a69576a2ff473fb01a90ffafb571c2ed019e55479d7ae71b12c2eadeb7011 ;; \
        *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/websocat \
        "https://github.com/vi/websocat/releases/download/v${WEBSOCAT_VERSION}/websocat.${target}"; \
    echo "$sha  /usr/local/bin/websocat" | sha256sum -c -; \
    chmod 755 /usr/local/bin/websocat

RUN npm install --global "@agentclientprotocol/claude-agent-acp@${CLAUDE_AGENT_ACP_VERSION}" \
    && npm cache clean --force

COPY texlyre-acp-bridge.cjs session-meta.json /opt/texlyre-acp/

USER node
WORKDIR /home/node

EXPOSE 7060

ENTRYPOINT ["sh", "-c", "exec websocat --text --exit-on-eof ws-l:0.0.0.0:$WS_PORT exec:node --exec-args /opt/texlyre-acp/texlyre-acp-bridge.cjs --session-meta /opt/texlyre-acp/session-meta.json claude-agent-acp"]
