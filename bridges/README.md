# Shared bridges

| Bridge | Canonical source | Distribution |
| --- | --- | --- |
| Typesetter | [`typesetter/1/`](typesetter/1/README.md) | Published as `ghcr.io/texlyre/chelys-typeset-bridge:1`; recipes use `COPY --from=bridge` in Dockerfiles. |
| ACP | [`acp/1/`](acp/1/README.md) | Copied into ACP recipe versions via `npm run sync:bridges`. |
| Storage | [`storage/1/`](storage/1/README.md) | Copied into storage recipe versions via `npm run sync:bridges`; backend stays recipe-specific. |

The validator checks ACP and storage bridge copies against their canonical sources.
Typesetter bridge source is built as a shared Docker image instead, so it does
not need recipe-level copies.
