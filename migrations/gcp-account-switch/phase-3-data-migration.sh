#!/bin/bash
#
# PHASE 3: Data Migration — Old GCP Account → New GCP Account
# =============================================================================
# Copies all files from OLD buckets to NEW buckets.
#
# Prerequisites:
#   1. Phase 1 complete (new buckets exist)
#   2. gcloud CLI authenticated to BOTH accounts (you'll switch during script)
#   3. Old account (insturix-457914) still active with data intact
#
# Time estimate: Depends on data size
#   - <10 GB:   ~10 minutes
#   - 10-100 GB: 30-90 minutes
#   - >100 GB:   Several hours (run in tmux/screen or overnight)
#
# Run from Git Bash or WSL on Windows.
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration — Old → New bucket mapping
# -----------------------------------------------------------------------------
OLD_PROJECT="insturix-457914"
NEW_PROJECT="insturix-493414"

declare -A BUCKET_MAP
BUCKET_MAP["insturix"]="insturix-v2"
BUCKET_MAP["insturix-prev-gcs"]="insturix-prev-gcs-v2"
BUCKET_MAP["alyzitron-uploads"]="alyzitron-uploads-v2"
BUCKET_MAP["musitron"]="musitron-v2"

# -----------------------------------------------------------------------------
# Authentication check
# -----------------------------------------------------------------------------
echo "🔍 Checking gcloud auth..."
echo ""
echo "You need to be authenticated with credentials that have read access to"
echo "the OLD project ($OLD_PROJECT) AND write access to the NEW project ($NEW_PROJECT)."
echo ""
echo "Easiest approach: use your personal Google account (gcloud auth login)"
echo "  — if you're an owner on both projects, it works."
echo ""
echo "Alternative: run this twice —"
echo "  1st pass: export files from old bucket to a local folder"
echo "  2nd pass: upload local folder to new bucket"
echo ""
read -p "Press Enter to continue once gcloud is authenticated with cross-account access, or Ctrl+C to cancel..."

# -----------------------------------------------------------------------------
# Sanity check — ensure source buckets exist and are accessible
# -----------------------------------------------------------------------------
echo ""
echo "📋 Verifying access to source buckets..."
for old_bucket in "${!BUCKET_MAP[@]}"; do
  if ! gcloud storage ls "gs://${old_bucket}/" --project="$OLD_PROJECT" &>/dev/null; then
    echo "⚠️  Cannot access gs://${old_bucket} — skipping"
    echo "   Check that: (a) bucket exists, (b) you have read access, (c) old account is still active"
    unset BUCKET_MAP["$old_bucket"]
  else
    # Count files and size
    FILE_COUNT=$(gcloud storage ls -r "gs://${old_bucket}/**" --project="$OLD_PROJECT" 2>/dev/null | wc -l)
    echo "✅ gs://${old_bucket} — ~${FILE_COUNT} files"
  fi
done

if [ ${#BUCKET_MAP[@]} -eq 0 ]; then
  echo "❌ No source buckets accessible. Aborting."
  exit 1
fi

echo ""
read -p "Proceed with migration? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# -----------------------------------------------------------------------------
# Run migrations — gcloud storage cp (parallelized, resumable)
# -----------------------------------------------------------------------------
LOG_DIR="migration-logs-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"
echo ""
echo "📁 Logs will be written to: $LOG_DIR/"
echo ""

for old_bucket in "${!BUCKET_MAP[@]}"; do
  new_bucket="${BUCKET_MAP[$old_bucket]}"
  LOG_FILE="$LOG_DIR/${old_bucket}-to-${new_bucket}.log"

  echo "═══════════════════════════════════════════════════════════════════════"
  echo "🚚 Migrating: gs://${old_bucket}  →  gs://${new_bucket}"
  echo "═══════════════════════════════════════════════════════════════════════"
  echo "Log: $LOG_FILE"
  echo ""

  # Use gcloud storage cp with --recursive for parallel copy
  # Unlike gsutil rsync, gcloud storage cp is faster and uses parallel composite uploads by default
  gcloud storage cp \
    --recursive \
    --project="$NEW_PROJECT" \
    "gs://${old_bucket}/*" \
    "gs://${new_bucket}/" \
    2>&1 | tee "$LOG_FILE"

  echo ""
  echo "✅ Completed: gs://${old_bucket} → gs://${new_bucket}"
  echo ""
done

# -----------------------------------------------------------------------------
# Verify — count objects in source vs destination
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "🔍 Verification — object counts"
echo "═══════════════════════════════════════════════════════════════════════"

for old_bucket in "${!BUCKET_MAP[@]}"; do
  new_bucket="${BUCKET_MAP[$old_bucket]}"

  OLD_COUNT=$(gcloud storage ls -r "gs://${old_bucket}/**" --project="$OLD_PROJECT" 2>/dev/null | grep -v "^$" | wc -l)
  NEW_COUNT=$(gcloud storage ls -r "gs://${new_bucket}/**" --project="$NEW_PROJECT" 2>/dev/null | grep -v "^$" | wc -l)

  if [ "$OLD_COUNT" = "$NEW_COUNT" ]; then
    echo "✅ ${old_bucket}: ${OLD_COUNT} = ${new_bucket}: ${NEW_COUNT}"
  else
    echo "⚠️  ${old_bucket}: ${OLD_COUNT} ≠ ${new_bucket}: ${NEW_COUNT} (DIFFERENCE!)"
    echo "   Consider re-running migration for this bucket"
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "✅ PHASE 3 COMPLETE — Data migrated"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "NEXT STEPS:"
echo "  1. Update Vercel env vars (see vercel-env-checklist.md)"
echo "  2. Apply code changes (see code-changes.md)"
echo "  3. Deploy to preview, test"
echo "  4. Run phase-6-mongodb-url-rewrite.mjs to fix stored URLs"
echo "  5. Deploy to production"
echo ""
echo "DO NOT delete old buckets until verification is complete (Phase 7)."
echo ""
