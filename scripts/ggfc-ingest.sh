#!/bin/bash
# GGFC read-only doc ingester (launchd, ~10 min). Runs the self-contained bundle in ~/.ggfo/agent
# so launchd never touches the TCC-protected Desktop. Self-healing: remounts read-only if the share
# is down; exits 0 (never crashes the schedule) if it can't. Reads their files only; writes our Neon.
set -u
AGENT="$HOME/.ggfo/agent/ingest.mjs"; LOG="$HOME/.ggfo/ingest.log"; ENVF="$HOME/.ggfo/env"
NODE="/opt/homebrew/bin/node"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/sbin:$PATH"   # so pdftotext + mount_smbfs are found
mkdir -p "$HOME/.ggfo"
ts(){ date '+%Y-%m-%d %H:%M:%S'; }
ROOT=""
for cand in "/Volumes/Common" "$HOME/GGFC-Common"; do
  /bin/ls "$cand/_Dawn's Active Docs" >/dev/null 2>&1 && { ROOT="$cand"; break; }
done
if [ -z "$ROOT" ]; then
  echo "$(ts) share not mounted; attempting read-only remount" >> "$LOG"
  /bin/mkdir -p "$HOME/GGFC-Common" 2>/dev/null
  if /sbin/mount_smbfs -o rdonly '//GGFC;dimond@192.168.3.3/Common' "$HOME/GGFC-Common" >> "$LOG" 2>&1 \
     && /bin/ls "$HOME/GGFC-Common/_Dawn's Active Docs" >/dev/null 2>&1; then ROOT="$HOME/GGFC-Common"
  else echo "$(ts) remount failed (SMB password not in Keychain); skipping run" >> "$LOG"; exit 0; fi
fi
[ -f "$ENVF" ] || { echo "$(ts) missing $ENVF; skipping" >> "$LOG"; exit 0; }
set -a; . "$ENVF"; set +a
echo "$(ts) run start (root=$ROOT)" >> "$LOG"
GGFC_DOCS_DIR="$ROOT/_Dawn's Active Docs" "$NODE" "$AGENT" --apply >> "$LOG" 2>&1
echo "$(ts) run end (exit $?)" >> "$LOG"
