# Claude Agent (ACP)

[`@agentclientprotocol/claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)
adapts the Claude coding agent to the Agent Client Protocol. ACP is
newline-delimited JSON-RPC over stdio, so Chelys exposes it through
`websocat` in line mode, which starts `texlyre-acp-bridge` for each
connection:

```
TeXlyre ⇄ WebSocket ⇄ websocat ⇄ stdio ⇄ texlyre-acp-bridge ⇄ stdio ⇄ claude-agent-acp
                                                 ⇅ HTTP (loopback MCP)
```

TeXlyre keeps project files in the browser, and this agent only works on files
on disk or through MCP tools. The bridge therefore serves an MCP endpoint on a
random loopback port, protected by a per-connection bearer token, and tunnels
each MCP request back to TeXlyre over the ACP connection as a `_texlyre/mcp`
request. TeXlyre answers with its project tools (`list_files`, `read_file`,
`edit_file`, `write_file`), which read and write the live Yjs documents, so
agent edits merge with collaborators' typing.

The bridge rewrites `session/new` to use only that MCP server, the options in
`session-meta.json`, and `./workspace` (an empty directory in the recipe
folder) as the agent's working directory, and reports the directory back on the
result as `_meta.texlyre.cwd`. It refuses ACP methods TeXlyre doesn't use; the
agent's messages pass through unchanged.

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `wsPort` | Port the WebSocket proxy listens on | `7060` |
| `anthropicApiKey` | Anthropic API key, passed to the agent as `ANTHROPIC_API_KEY` (secret) | empty: use the environment or a Claude login |

Editable from the Chelys GUI after installing and re-applied on every run.

## Modes

- **System**: installs `websocat` with `cargo` (requires the Rust toolchain)
  and the adapter with `npm` (requires Node.js 22 or later), then runs the
  proxy with the bridge. Uninstalling removes the npm package.
- **Docker**: runs `ghcr.io/texlyre/chelys-recipe-claude-agent`, which bundles
  `websocat`, the bridge and the adapter, so nothing needs to be installed on
  the host (e.g. on Windows). The port is published on `127.0.0.1` only. A volume
  keeps the agent's sessions, so saved chats can
  be resumed after the container restarts. A Claude login on the host isn't
  visible inside the container, so this mode needs an API key (from the
  recipe's settings or `ANTHROPIC_API_KEY`).
- **Connect**: attach to a proxy already listening on `${wsPort}`.

## Notes

- The agent signs in with the **Anthropic API key** set in the recipe's
  settings (next to the port). Left empty, it uses an `ANTHROPIC_API_KEY` from
  the environment Chelys was started from, or (in System mode) an existing
  Claude login. Chelys
  keeps the key on this machine: it is masked, passed to the agent only as
  `ANTHROPIC_API_KEY`, and left out of downloaded recipes. A collaborator using
  a shared agent never sees it.
- `session-meta.json` disables the agent's built-in tools (file, shell, web)
  and stops it loading the user's Claude settings, skills, and memory
  (`settingSources: []`), and keeps out every MCP server except TeXlyre's,
  including claude.ai account connectors (`strictMcpConfig`,
  `settings.disableClaudeAiConnectors`), so a TeXlyre session only sees
  TeXlyre's tools. The bridge applies it to every session (`--session-meta`),
  whatever the client sends, and accepts only the ACP methods TeXlyre uses.
- The read-only tools (`list_files`, `read_file`, `compile`) are pre-approved
  through `allowedTools`; `edit_file` and `write_file` always ask, and TeXlyre
  shows the proposed change as a diff before you allow it.
- The MCP endpoint refuses requests without the token, with a browser
  `Origin`, or with a `Host` other than the loopback address.
