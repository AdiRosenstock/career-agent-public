# Security and private data

Career Agent is a single-user loopback application. It has no authentication layer suitable for public hosting. Do not expose its API via a public tunnel, bind it to a public interface, or deploy it as a shared web service.

The server keeps Supabase service credentials out of React. Private data belongs in ignored `.data/` and `.env.local`. The optional extension stores an imported basic profile locally. Full helper exports include additional sensitive answers even though local paths and service credentials are excluded.

`.gitignore` prevents accidental additions, not disclosure from already tracked files or old commits. `npm run check:public` is a lightweight tracked-file gate, not a comprehensive secret scanner. Review screenshots and all reachable Git history before publishing.

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository if available. If unavailable, contact the maintainer through their public GitHub profile to arrange a private channel. Do not put exploit details, candidate data or credentials in a public issue. Include affected version, minimal fictional reproduction, impact and suggested mitigation.

## Backups

Exported state and local artifacts are private. A JSON backup does not include PDF bytes. Verify a restore before deleting source files. Rotate any exposed credentials; removing a file from Git does not revoke a secret.
