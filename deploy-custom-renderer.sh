#!/bin/bash
set -e

# Configuration
PROJECT_ID="insturix-dev" # Updated to dev project
REGION="us-central1"
SERVICE_NAME="remotion-renderer"
# Use Artifact Registry
IMAGE_NAME="us-central1-docker.pkg.dev/$PROJECT_ID/remotion-repo/$SERVICE_NAME"

echo "Preparing build context..."

# Ensure we are in the root
cd "$(dirname "$0")"
echo "Current directory: $(pwd)"
ls -la

# Copy necessary files to renderer directory
# We need the app, components, lib folders, and tailwind config if used
# Ensure destination directory exists
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
cp remotion.config.ts cloud-run-renderer/ 2>/dev/null || true

# We also need to merge the main package.json dependencies into the renderer's package.json
# or simply install them. For simplicity, we'll rely on the renderer's package.json 
# but we might need to add specific dependencies used in the video components.
# A better approach for production is to use a workspace or copy the root package.json,
# but let's stick to the isolated approach for now and assume standard dependencies.

cd cloud-run-renderer

echo "Building Docker image..."
gcloud builds submit --tag $IMAGE_NAME --project $PROJECT_ID

echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --memory 2Gi \
  --timeout 300 \
  --allow-unauthenticated # For testing ease, restrict in production

echo "Deployment complete!"
