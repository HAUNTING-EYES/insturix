#!/bin/bash
# Deploy Remotion site bundle to AWS S3
# Usage: bash scripts/deploy-remotion-site.sh [env]
# Examples:
#   bash scripts/deploy-remotion-site.sh dev
#   bash scripts/deploy-remotion-site.sh prod

set -e

ENV=${1:-dev}
ENTRY_POINT="components/editron/editor/version-7.0.0/remotion/index.ts"
BUNDLE_SHA=$(pnpm exec tsx -e "import { computeRemotionSiteFingerprint } from './lib/editron/services/remotion-site-fingerprint'; process.stdout.write(computeRemotionSiteFingerprint().sha256)")
SITE_NAME="editron-${ENV}-${BUNDLE_SHA:0:12}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Deploying Remotion site bundle: ${SITE_NAME}${NC}"

# Check for required env vars
if [ -z "$REMOTION_AWS_ACCESS_KEY_ID" ]; then
  # Try to load from .env file based on environment
  if [ "$ENV" = "prod" ] && [ -f "production.env" ]; then
    source production.env
  elif [ -f "development.env" ]; then
    source development.env
  fi
fi

if [ -z "$REMOTION_AWS_ACCESS_KEY_ID" ]; then
  echo -e "${RED}❌ Error: REMOTION_AWS_ACCESS_KEY_ID not set${NC}"
  echo "Please set AWS credentials in your environment or .env file"
  exit 1
fi

# Set AWS credentials for Remotion CLI
export AWS_ACCESS_KEY_ID=$REMOTION_AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$REMOTION_AWS_SECRET_ACCESS_KEY
export AWS_REGION=${REMOTION_AWS_REGION:-us-east-1}

echo -e "  Region: ${AWS_REGION}"
echo -e "  Entry Point: ${ENTRY_POINT}"
echo -e "  Bundle SHA: ${BUNDLE_SHA}"
echo ""

# Deploy site
npx remotion lambda sites create \
  --site-name=$SITE_NAME \
  $ENTRY_POINT

echo ""
echo -e "${GREEN}✅ Site deployed successfully!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Copy the Serve URL from above"
echo "2. Update REMOTION_LAMBDA_SERVE_URL in your ${ENV}.env file"
echo "3. Set REMOTION_LAMBDA_SERVE_BUNDLE_SHA=${BUNDLE_SHA}"
echo ""
