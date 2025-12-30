#!/bin/bash
set -e

PROJECT_ID="insturix-457914"
REGION="us-central1"
REPO_NAME="remotion-repo"

echo "Setting up Artifact Registry for production..."

# Set the project
gcloud config set project $PROJECT_ID

# Create the repository if it doesn't exist
echo "Creating Artifact Registry repository..."
gcloud artifacts repositories create $REPO_NAME \
  --repository-format=docker \
  --location=$REGION \
  --description="Remotion renderer Docker images for production" \
  2>/dev/null || echo "Repository already exists, continuing..."

# Configure Docker authentication
echo "Configuring Docker authentication..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev

echo "✅ Artifact Registry setup complete!"
echo "Repository: ${REGION}-docker.pkg.dev/$PROJECT_ID/$REPO_NAME"
