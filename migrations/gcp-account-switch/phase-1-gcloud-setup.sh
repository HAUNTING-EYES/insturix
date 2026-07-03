#!/bin/bash
#
# PHASE 1: GCP New Account Setup
# =============================================================================
# Run this script AFTER authenticating to the NEW GCP account.
#
# Prerequisites:
#   1. gcloud CLI installed on Windows
#   2. You've run: gcloud auth login   (authenticate to new account)
#   3. You've run: gcloud config set project insturix-493414
#   4. Billing is linked to the new project in the GCP Console
#
# This script will:
#   - Enable all required APIs
#   - Create a service account with proper IAM roles
#   - Create 4 GCS buckets with correct CORS
#   - Output the service account email for key download
#
# Run from Git Bash or WSL on Windows (NOT cmd/PowerShell — uses bash syntax)
# =============================================================================

set -e  # Exit on any error

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
PROJECT_ID="insturix-493414"
PROJECT_NUMBER="687396053572"
REGION="us-central1"
SERVICE_ACCOUNT_NAME="insturix-frontend"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# New bucket names (with -v2 suffix)
BUCKET_MAIN="insturix-v2"
BUCKET_PREVIEW="insturix-prev-gcs-v2"
BUCKET_ALYZITRON="alyzitron-uploads-v2"
BUCKET_MUSITRON="musitron-v2"

# -----------------------------------------------------------------------------
# Safety check
# -----------------------------------------------------------------------------
echo "🔍 Verifying you're on the correct GCP account..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)

if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
  echo "❌ ERROR: gcloud is set to project '$CURRENT_PROJECT', expected '$PROJECT_ID'"
  echo "Run: gcloud config set project $PROJECT_ID"
  exit 1
fi

echo "✅ Confirmed project: $PROJECT_ID"
echo ""
echo "⚠️  This script will modify the GCP project. Press Ctrl+C to cancel."
echo "Starting in 5 seconds..."
sleep 5

# -----------------------------------------------------------------------------
# STEP 1: Enable required APIs
# -----------------------------------------------------------------------------
echo ""
echo "📡 [1/6] Enabling required GCP APIs..."
gcloud services enable \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  generativelanguage.googleapis.com \
  youtube.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  --project="$PROJECT_ID"
echo "✅ APIs enabled"

# -----------------------------------------------------------------------------
# STEP 2: Create service account
# -----------------------------------------------------------------------------
echo ""
echo "👤 [2/6] Creating service account..."
if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "ℹ️  Service account already exists: $SERVICE_ACCOUNT_EMAIL"
else
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="Insturix Frontend Service Account" \
    --description="Used by Next.js app for GCS and Vertex AI" \
    --project="$PROJECT_ID"
  echo "✅ Service account created: $SERVICE_ACCOUNT_EMAIL"
fi

# -----------------------------------------------------------------------------
# STEP 3: Grant IAM roles to service account
# -----------------------------------------------------------------------------
echo ""
echo "🔐 [3/6] Granting IAM roles to service account..."

# Storage roles (for GCS operations + signed URL generation)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/storage.admin" \
  --condition=None \
  --quiet

# CRITICAL: Token creator role is required for signed URL generation
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --condition=None \
  --quiet

# Vertex AI user role (for video analysis)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/aiplatform.user" \
  --condition=None \
  --quiet

echo "✅ IAM roles granted"

# -----------------------------------------------------------------------------
# STEP 4: Create GCS buckets
# -----------------------------------------------------------------------------
echo ""
echo "🪣 [4/6] Creating GCS buckets in region $REGION..."

create_bucket() {
  local bucket_name="$1"
  if gcloud storage buckets describe "gs://${bucket_name}" --project="$PROJECT_ID" &>/dev/null; then
    echo "ℹ️  Bucket already exists: gs://${bucket_name}"
  else
    gcloud storage buckets create "gs://${bucket_name}" \
      --project="$PROJECT_ID" \
      --location="$REGION" \
      --uniform-bucket-level-access
    echo "✅ Created bucket: gs://${bucket_name}"
  fi
}

create_bucket "$BUCKET_MAIN"
create_bucket "$BUCKET_PREVIEW"
create_bucket "$BUCKET_ALYZITRON"
create_bucket "$BUCKET_MUSITRON"

# -----------------------------------------------------------------------------
# STEP 5: Apply CORS configuration
# -----------------------------------------------------------------------------
echo ""
echo "🌐 [5/6] Applying CORS configuration to buckets..."

CORS_FILE=$(mktemp)
cat > "$CORS_FILE" <<'EOF'
[
  {
    "maxAgeSeconds": 3600,
    "method": ["PUT", "GET", "HEAD", "POST", "OPTIONS", "DELETE"],
    "origin": [
      "https://www.insturix.com",
      "https://insturix.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "https://*.vercel.app"
    ],
    "responseHeader": [
      "Content-Type",
      "Content-Length",
      "Accept",
      "Origin",
      "Authorization",
      "Host",
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
      "x-goog-meta-upload-source"
    ]
  }
]
EOF

for bucket in "$BUCKET_MAIN" "$BUCKET_PREVIEW" "$BUCKET_ALYZITRON" "$BUCKET_MUSITRON"; do
  gcloud storage buckets update "gs://${bucket}" --cors-file="$CORS_FILE" --project="$PROJECT_ID"
  echo "✅ CORS applied to: gs://${bucket}"
done

rm "$CORS_FILE"

# -----------------------------------------------------------------------------
# STEP 6: Grant service account access to buckets
# -----------------------------------------------------------------------------
echo ""
echo "🔑 [6/6] Granting service account access to buckets..."
for bucket in "$BUCKET_MAIN" "$BUCKET_PREVIEW" "$BUCKET_ALYZITRON" "$BUCKET_MUSITRON"; do
  gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/storage.objectAdmin" \
    --project="$PROJECT_ID" \
    --quiet
  echo "✅ Access granted on: gs://${bucket}"
done

# -----------------------------------------------------------------------------
# DONE
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "✅ PHASE 1 COMPLETE"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "Project ID:           $PROJECT_ID"
echo "Project Number:       $PROJECT_NUMBER"
echo "Region:               $REGION"
echo "Service Account:      $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "Buckets created:"
echo "  - gs://${BUCKET_MAIN}"
echo "  - gs://${BUCKET_PREVIEW}"
echo "  - gs://${BUCKET_ALYZITRON}"
echo "  - gs://${BUCKET_MUSITRON}"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "1. Generate service account JSON key:"
echo ""
echo "   gcloud iam service-accounts keys create \\"
echo "     insturix-prod-service-account.json \\"
echo "     --iam-account=$SERVICE_ACCOUNT_EMAIL \\"
echo "     --project=$PROJECT_ID"
echo ""
echo "   This creates 'insturix-prod-service-account.json' in the current directory."
echo "   KEEP THIS FILE SECRET. Do NOT commit to git."
echo ""
echo "2. Base64-encode the key for Vercel env var:"
echo ""
echo "   Windows (PowerShell):"
echo "     [Convert]::ToBase64String([IO.File]::ReadAllBytes('insturix-prod-service-account.json'))"
echo ""
echo "   Windows (Git Bash):"
echo "     base64 -w 0 insturix-prod-service-account.json > insturix-prod-service-account.b64"
echo ""
echo "3. Generate Gemini API key:"
echo "   Visit: https://aistudio.google.com/apikey"
echo "   Click 'Create API Key' → select project 'insturix-493414'"
echo ""
echo "4. Generate YouTube Data API key:"
echo "   Visit: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "   Click 'Create Credentials' → 'API Key'"
echo "   Restrict it to YouTube Data API v3"
echo ""
echo "5. Run phase-3-data-migration.sh to copy files from old buckets"
echo ""
