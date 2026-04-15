#!/bin/bash
#
# 2️⃣ DATA MIGRATION — Old account buckets → New account buckets
# ============================================================================
# Total data to migrate: ~11.5 GB across 6 buckets
#
# IMPORTANT: This script reads from OLD account and writes to NEW account.
# You must have gcloud authenticated with a user that has READ access to old
# buckets AND WRITE access to new buckets.
#
# Since you're on different Gmail accounts, the script detects this and
# either (a) uses a single account with cross-project permissions, or
# (b) does a local-cache 2-pass migration.
#
# Prerequisites:
#   - gcloud auth list shows BOTH accounts:
#     - admin@insturance.org (for reads from old)
#     - jnimit865@gmail.com (for writes to new)
#   - Phase 1 complete (new buckets exist on new account)
#
# Time: 30 min – 3 hours depending on bandwidth
# Cost: Cross-region egress from old bucket → tiny, one-time
# ============================================================================

set -e

# ─── Account + Project Config ───────────────────────────────────────────────
OLD_ACCOUNT="admin@insturance.org"
NEW_ACCOUNT="jnimit865@gmail.com"
OLD_PROD_PROJECT="insturix-457914"
OLD_PREVIEW_PROJECT="insturix-preview"
NEW_PROD_PROJECT="insturix-493414"
NEW_PREVIEW_PROJECT="insturix-preview-v2"

# ─── Bucket Mapping (6 total) ───────────────────────────────────────────────
# Format: OLD_BUCKET:OLD_PROJECT:NEW_BUCKET:NEW_PROJECT

BUCKET_MAP=(
  "insturix:${OLD_PROD_PROJECT}:insturix-v2:${NEW_PROD_PROJECT}"
  "alyzitron-uploads:${OLD_PROD_PROJECT}:alyzitron-uploads-v2:${NEW_PROD_PROJECT}"
  "musitron:${OLD_PROD_PROJECT}:musitron-v2:${NEW_PROD_PROJECT}"
  "clickatron:${OLD_PROD_PROJECT}:clickatron-v2:${NEW_PROD_PROJECT}"
  "socialize:${OLD_PROD_PROJECT}:socialize-v2:${NEW_PROD_PROJECT}"
  "insturix-prev-gcs:${OLD_PREVIEW_PROJECT}:insturix-prev-gcs-v2:${NEW_PREVIEW_PROJECT}"
)

# ─── Logs directory ─────────────────────────────────────────────────────────
LOG_DIR="migration-logs-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

echo "═══════════════════════════════════════════════════════════════════════"
echo "DATA MIGRATION — Old GCP Account → New GCP Account"
echo "═══════════════════════════════════════════════════════════════════════"
echo "Log directory: $LOG_DIR"
echo ""
echo "Buckets to migrate:"
for mapping in "${BUCKET_MAP[@]}"; do
  IFS=':' read -r OLD_BUCKET OLD_PROJ NEW_BUCKET NEW_PROJ <<< "$mapping"
  echo "  gs://$OLD_BUCKET  →  gs://$NEW_BUCKET"
done
echo ""
echo "This will NOT delete data from old buckets. Safe to re-run."
echo ""
read -p "Continue? Press Enter to proceed, Ctrl+C to abort... "

# ─── Verify authentication ──────────────────────────────────────────────────
echo ""
echo "=== Verifying gcloud authentication ==="
gcloud auth list 2>&1

HAS_OLD=$(gcloud auth list --format="value(account)" 2>&1 | grep -c "$OLD_ACCOUNT" || true)
HAS_NEW=$(gcloud auth list --format="value(account)" 2>&1 | grep -c "$NEW_ACCOUNT" || true)

if [ "$HAS_OLD" -lt 1 ]; then
  echo "❌ OLD account ($OLD_ACCOUNT) not authenticated. Run: gcloud auth login"
  exit 1
fi
if [ "$HAS_NEW" -lt 1 ]; then
  echo "❌ NEW account ($NEW_ACCOUNT) not authenticated. Run: gcloud auth login"
  exit 1
fi

# ─── Pre-flight: list source buckets to verify readability ──────────────────
echo ""
echo "=== Pre-flight: verify READ access to source buckets ==="
gcloud config set account "$OLD_ACCOUNT" 2>&1 | tail -1

for mapping in "${BUCKET_MAP[@]}"; do
  IFS=':' read -r OLD_BUCKET OLD_PROJ NEW_BUCKET NEW_PROJ <<< "$mapping"
  if gcloud storage ls "gs://${OLD_BUCKET}/" --project="$OLD_PROJ" &>/dev/null; then
    echo "  ✅ gs://$OLD_BUCKET — readable"
  else
    echo "  ❌ gs://$OLD_BUCKET — CANNOT READ (check permissions)"
  fi
done

# ─── Pre-flight: verify destination buckets exist ──────────────────────────
echo ""
echo "=== Pre-flight: verify WRITE access to destination buckets ==="
gcloud config set account "$NEW_ACCOUNT" 2>&1 | tail -1

for mapping in "${BUCKET_MAP[@]}"; do
  IFS=':' read -r OLD_BUCKET OLD_PROJ NEW_BUCKET NEW_PROJ <<< "$mapping"
  if gcloud storage buckets describe "gs://${NEW_BUCKET}" --project="$NEW_PROJ" &>/dev/null; then
    echo "  ✅ gs://$NEW_BUCKET — exists"
  else
    echo "  ❌ gs://$NEW_BUCKET — DOES NOT EXIST on new account"
    exit 1
  fi
done

echo ""
read -p "Pre-flight passed. Proceed with migration? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# ─── Migration approach: single-account if Gmail has cross-access ──────────
# Cross-account migration works if:
# - Same Gmail owns both accounts (same user)
# - OR user has IAM role on both projects
# Otherwise, do 2-pass via local folder
echo ""
echo "=== Attempting direct cross-account migration ==="
echo "   (If this fails, we'll fall back to 2-pass local cache)"
echo ""

TOTAL_FAILED=0

for mapping in "${BUCKET_MAP[@]}"; do
  IFS=':' read -r OLD_BUCKET OLD_PROJ NEW_BUCKET NEW_PROJ <<< "$mapping"
  LOG_FILE="$LOG_DIR/${OLD_BUCKET}-to-${NEW_BUCKET}.log"

  echo "═══════════════════════════════════════════════════════════════════════"
  echo "Migrating: gs://$OLD_BUCKET  →  gs://$NEW_BUCKET"
  echo "Log: $LOG_FILE"
  echo "═══════════════════════════════════════════════════════════════════════"

  # Try direct cross-account first (user must be auth'd on both)
  gcloud config set account "$NEW_ACCOUNT" 2>&1 | tail -1

  if gcloud storage cp \
    --recursive \
    --project="$NEW_PROJ" \
    "gs://${OLD_BUCKET}/*" \
    "gs://${NEW_BUCKET}/" \
    2>&1 | tee "$LOG_FILE"
  then
    echo "  ✅ Direct migration succeeded"
  else
    echo "  ⚠️  Direct migration failed. Trying 2-pass via local cache..."

    LOCAL_CACHE="$LOG_DIR/cache-${OLD_BUCKET}"
    mkdir -p "$LOCAL_CACHE"

    # Pass 1: Download from old
    echo "     Pass 1: download gs://$OLD_BUCKET → $LOCAL_CACHE"
    gcloud config set account "$OLD_ACCOUNT" 2>&1 | tail -1
    gcloud storage cp --recursive "gs://${OLD_BUCKET}/*" "$LOCAL_CACHE/" --project="$OLD_PROJ" 2>&1 | tee -a "$LOG_FILE"

    # Pass 2: Upload to new
    echo "     Pass 2: upload $LOCAL_CACHE → gs://$NEW_BUCKET"
    gcloud config set account "$NEW_ACCOUNT" 2>&1 | tail -1
    gcloud storage cp --recursive "$LOCAL_CACHE/*" "gs://${NEW_BUCKET}/" --project="$NEW_PROJ" 2>&1 | tee -a "$LOG_FILE"

    # Cleanup cache
    rm -rf "$LOCAL_CACHE"
    echo "  ✅ 2-pass migration complete"
  fi

  echo ""
done

# ─── Verification: object counts ────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════════════"
echo "VERIFICATION — object count per bucket"
echo "═══════════════════════════════════════════════════════════════════════"

for mapping in "${BUCKET_MAP[@]}"; do
  IFS=':' read -r OLD_BUCKET OLD_PROJ NEW_BUCKET NEW_PROJ <<< "$mapping"

  gcloud config set account "$OLD_ACCOUNT" &>/dev/null
  OLD_COUNT=$(gcloud storage ls -r "gs://${OLD_BUCKET}/**" --project="$OLD_PROJ" 2>/dev/null | grep -v "^$" | wc -l)

  gcloud config set account "$NEW_ACCOUNT" &>/dev/null
  NEW_COUNT=$(gcloud storage ls -r "gs://${NEW_BUCKET}/**" --project="$NEW_PROJ" 2>/dev/null | grep -v "^$" | wc -l)

  if [ "$OLD_COUNT" = "$NEW_COUNT" ]; then
    echo "  ✅ $OLD_BUCKET: $OLD_COUNT = $NEW_BUCKET: $NEW_COUNT"
  else
    echo "  ⚠️  $OLD_BUCKET: $OLD_COUNT ≠ $NEW_BUCKET: $NEW_COUNT (DIFF: $((OLD_COUNT - NEW_COUNT)))"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
if [ "$TOTAL_FAILED" -gt 0 ]; then
  echo "⚠️  MIGRATION COMPLETED WITH $TOTAL_FAILED DISCREPANCIES"
  echo "    Review logs in $LOG_DIR and re-run script (it's idempotent)"
else
  echo "✅ MIGRATION 100% SUCCESSFUL"
  echo "    All object counts match. Data ready for use."
fi
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "NEXT STEPS:"
echo "  1. Do NOT delete old buckets yet (they're your rollback)"
echo "  2. Update Vercel env vars (when ready to cut over)"
echo "  3. Apply code changes (prepared in 03-CODE-CHANGES.md)"
echo "  4. Run tests per 04-TESTING-PLAN.md"
echo ""
