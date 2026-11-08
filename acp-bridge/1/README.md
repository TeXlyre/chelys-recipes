# TeXlyre ACP bridge

Canonical source of `texlyre-acp-bridge.cjs`, the stdio bridge that ACP agent
recipes run between `websocat` and the agent. Recipes cannot reference files
outside their own version directory, so each agent recipe ships a copy in its
`extraFiles`; `npm run validate` fails when a copy differs from this one, and
`npm run sync:acp-bridge` refreshes every copy.

```
TeXlyre ⇄ WebSocket ⇄ websocat ⇄ stdio ⇄ texlyre-acp-bridge ⇄ stdio ⇄ agent
                                                 ⇅ HTTP (loopback MCP)
```

The bridge:

- starts the agent command it is given, in `./workspace` (or
  `TEXLYRE_ACP_WORKSPACE`), one process per connection;
- serves MCP over HTTP on a random loopback port, protected by a per-process
  bearer token, and refuses requests with a browser `Origin` or a non-loopback
  `Host`;
- tunnels each MCP request to TeXlyre over the ACP connection as a
  `_texlyre/mcp` request and returns TeXlyre's answer;
- rewrites `session/new` to use that MCP server and the real working directory,
  and reports the directory on the result as `_meta.texlyre.cwd`.

The bridge, not the client, decides how sessions are set up, since anything
that reaches the WebSocket is a client:

- `session/new` gets only TeXlyre's MCP server, whatever servers the client
  lists. An ACP client can otherwise ask the agent to start any command as a
  `stdio` MCP server.
- `session/new` gets the `_meta` from `--session-meta <file>` (a JSON object,
  such as the agent's tool restrictions), or none. The client's `_meta` is
  dropped.
- The client may only send what TeXlyre sends: the `initialize`,
  `session/new` and `session/prompt` requests, the `session/cancel`
  notification, and replies to the agent's requests. Other requests get a
  `-32601` error and other notifications are dropped. The agent accepts more,
  such as loading, resuming or forking sessions (with their own options and MCP
  servers), `providers/set` and gateway `authenticate` (which redirect its API
  traffic).

Messages from the agent pass through unchanged. It needs Node.js 18 or later and
has no dependencies.

## Usage in a recipe

```json
{
  "extraFiles": ["texlyre-acp-bridge.cjs", "session-meta.json"],
  "modes": [
    {
      "kind": "system",
      "runCommand": {
        "command": "websocat",
        "args": [
          "--text", "--exit-on-eof", "ws-l:127.0.0.1:${wsPort}",
          "exec:node", "--exec-args", "texlyre-acp-bridge.cjs",
          "--session-meta", "session-meta.json", "<agent-command>"
        ]
      }
    }
  ]
}
```

`--exec-args` must stay last; everything after it is passed to `node`.
`--session-meta` is optional and must come before the agent command. The bridge
exits if the file isn't a JSON object.
