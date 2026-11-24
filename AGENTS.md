<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Standalone Mac packaging

- Keep the DMG helper and its safety tests in `tools/macos-dmg`; actual disk-image creation uses macOS `hdiutil` on the user's Mac because this Linux sandbox cannot generate or validate a native DMG.
- Export only the executable helper and its instructions in a ZIP, never relabel an archive as a DMG; keep automated command simulations distinct from verification on macOS.
- Vault data is encrypted client-side (AES-GCM, PBKDF2 key from master password) in src/lib/vault and stored only on-device (a private IndexedDB folder by default, or a user-picked Mac folder): one encrypted file per account plus an encrypted folder index; never store or send it unencrypted or off-device — privacy is the core promise.
- UI text lives only in src/lib/i18n (es is the source Dict; every other language must satisfy the same type) so all 7 languages stay complete.
- Deleting accounts/folders sets deletedAt (trash) instead of removing; only the Trash view purges — prevents accidental data loss.
- Main list rows are render functions, not inline components: inline components remount on every state change and break drag-and-drop.
