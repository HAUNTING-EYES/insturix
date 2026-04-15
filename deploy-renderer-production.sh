#!/bin/bash
set -e

# PRODUCTION Configuration
PROJECT_ID="insturix-493414"
REGION="us-central1"
SERVICE_NAME="remotion-renderer"
# Use Artifact Registry
IMAGE_NAME="us-central1-docker.pkg.dev/$PROJECT_ID/remotion-repo/$SERVICE_NAME"

echo "🚀 PRODUCTION DEPLOYMENT - ARE YOU SURE? (Ctrl+C to cancel)"
sleep 3

echo "Preparing build context..."

# Ensure we are in the root
cd "$(dirname "$0")"
echo "Current directory: $(pwd)"

# Copy necessary files to renderer directory
echo "Copying project files..."
mkdir -p cloud-run-renderer

# Copy Next.js project structure
cp -r app cloud-run-renderer/
cp -r components cloud-run-renderer/
cp -r lib cloud-run-renderer/
cp -r public cloud-run-renderer/
cp tailwind.config.ts cloud-run-renderer/ 2>/dev/null || true
cp postcss.config.mjs cloud-run-renderer/ 2>/dev/null || true
cp remotion.config.ts cloud-run-renderer/ 2>/dev/null || true
cp postcss.config.js cloud-run-renderer/ 2>/dev/null || true

cd cloud-run-renderer

echo "Building Docker image for PRODUCTION..."
gcloud builds submit --tag $IMAGE_NAME --project $PROJECT_ID

echo "Deploying to Cloud Run (PRODUCTION)..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600 \
  --max-instances 10 \
  --allow-unauthenticated

echo "✅ PRODUCTION Deployment complete!"
echo "Service URL:"
gcloud run services describe $SERVICE_NAME --region $REGION --project $PROJECT_ID --format='value(status.url)'
