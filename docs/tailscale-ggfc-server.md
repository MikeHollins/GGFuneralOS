# GGFC Server Connection

This app can inventory the mounted GGFC server share as a read-only source and store file/folder metadata in Neon. It can also store generated GGFuneralOS uploads in a separate folder by setting `UPLOAD_ROOT`.

## Current Tailnet Status

Checked on 2026-05-22:

- Local Mac: `michaels-macbook-air`
- GGFC Windows host: `ggfc107`
- Tailscale reachability: confirmed with `tailscale ping ggfc107`
- SMB share listing: blocked until valid Windows/SMB credentials are provided

Do not place server passwords, Tailscale auth keys, or Windows credentials in this repo.

## Mount The Share On macOS

In Finder:

1. Open **Go > Connect to Server**.
2. Enter `smb://ggfc107` or `smb://100.95.206.73`.
3. Sign in with the GGFC Windows/SMB account.
4. Select the share that corresponds to the funeral-home `S:` drive.

After mounting, macOS should expose it under `/Volumes/...`.

## Point GGFuneralOS At The Mounted Folder

Set this in local `.env`:

```bash
GGFC_COMMON_ROOT=/Volumes/GGFC-SERVER
```

Use the actual mounted volume name from `/Volumes`. Keep `.env` uncommitted.

Then run the read-only inventory worker:

```bash
npm run sync:smb
```

The worker uses directory listing and file metadata only. It does not write to the SMB share, edit files, copy files, or read file contents. Staff notes, statuses, initials, and audit trails stay in Neon/GGFuneralOS.

Generated GGFuneralOS uploads should use a dedicated app-owned folder, not the master production folders:

```bash
UPLOAD_ROOT=/Volumes/GGFC-SERVER/GGFuneralOS/uploads
```

## Production Note

Vercel cannot mount the local funeral-home SMB share. Run the inventory worker on a trusted local or tailnet host that can mount the share, then let the Vercel dashboard read the Neon metadata. Do not give Vercel SMB credentials.
