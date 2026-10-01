# Connect your own storage and tools

There are three separate connections. Configuring one does not configure the others.

| Connection | Owner | Where to configure | Required? |
|---|---|---|---|
| Application storage | You | `.env.local`: SQLite or your own Supabase project | One backend |
| Agent account | You | Codex or Claude Code's sign-in/configuration | For assisted work |
| Browser/email tools | You | Your agent's tool/plugin/MCP configuration | For live forms / inbox duplicate checks |

## SQLite: simplest setup

Choose SQLite in `npm run setup`. Your database and document copies live in ignored `.data/`. No database account, server subscription, OpenAI key or Anthropic key is required by the app. The local web server starts on loopback only. Manual tracking works without either agent.

## Your own Supabase

1. Create or choose your own dedicated Supabase project.
2. Apply `supabase/schema.sql` in its SQL editor.
3. Choose Supabase during setup and enter your project URL. Add `SUPABASE_SECRET_KEY` privately to `.env.local`, or supply it through your process environment. Never put it in `VITE_` variables, tracked files or agent prompts.
4. Run `npm run doctor`, then build/start. Doctor checks configuration presence, not remote connectivity. Server startup and an actual state read verify the selected backend.

PDFs and some cover-letter artifacts remain local, even with Supabase state. Keep a private backup of both. Changing an existing backend needs explicit export/import into an empty destination; see [Configuration](CONFIGURATION.md). Setup never performs a migration. Failure never silently redirects writes to SQLite.

Supabase is optional hosted storage, not an agent MCP connection. The helper SQL scaffold is optional and does not add shipped extension sync.

## Your own browser/email MCP servers

Choose a trusted provider that supports your actual agent and accounts. Use the provider's documented URL or executable, authenticate in your own agent, and grant only the access you need. Do not copy someone else's cookies, keys or account configuration. This repository does not endorse or install a particular third-party server.

For a server that supports HTTP MCP, the official CLI configuration shapes are:

```sh
# Replace YOUR_SERVER_URL with your provider's documented endpoint.
codex mcp add career-tools --url YOUR_SERVER_URL
claude mcp add --transport http career-tools YOUR_SERVER_URL
```

For a trusted local stdio server:

```sh
# Replace YOUR_SERVER_EXECUTABLE and arguments with its official instructions.
codex mcp add career-tools -- YOUR_SERVER_EXECUTABLE
claude mcp add --transport stdio career-tools -- YOUR_SERVER_EXECUTABLE
```

These are templates, not commands to execute unchanged. Prefer your agent's personal/local scope for account-specific configuration. Project-shared configuration is suitable only for public non-secret endpoints. `.mcp.json`, `.codex/config.toml`, `.claude/settings.local.json` and `CLAUDE.local.md` are ignored here to prevent accidental account/configuration sharing. Ignoring files is not a complete secret scanner.

Once configured, start a new agent session if needed and ask it to list available browser/email capabilities. Test reading a public employer posting before uploading any document. A web fetch/search tool is not a browser form-control tool. Email availability is not proof that all your application accounts were checked. The browser helper extension is separate and fills only supported blank basic text fields.

Career Agent itself is an Express API and CLI, **not an MCP server**. Your agent runs its CLI for state and preparation; external MCP servers provide browser/email capabilities. No model vendor or server is hardcoded into application storage.

## Remote hosting

The current dashboard is a single-user local app with private files, not an internet-ready multi-user service. Run it locally or on a private machine you control. A shared public deployment needs authentication, access control and document storage work before exposing candidate state. A public GitHub source repository does not publish or host your live database.

## References

[Codex MCP configuration](https://developers.openai.com/learn/docs-mcp) shows the HTTP CLI pattern. [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) covers transports, scopes and authentication. Follow your chosen provider's current instructions for credentials and supported operations.
