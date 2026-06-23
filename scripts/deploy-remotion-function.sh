#!/bin/bash
# Deploy / upgrade the Remotion Lambda RENDER FUNCTION (memory, disk, timeout).
#
# SEPARATE from deploy-remotion-site.sh (which uploads the composition bundle to S3). The function
# carries the CPU/RAM/timeout budget. Remotion encodes those into the function NAME
# (remotion-render-<version>-mem<MB>mb-disk<MB>mb-<sec>sec), so changing memory/disk/timeout creates a
# BRAND-NEW function and leaves the existing one (and any in-flight renders) untouched — zero downtime.
#
# After it runs:
#   1. Copy the printed function name into REMOTION_LAMBDA_FUNCTION_NAME (Vercel env + local env file).
#   2. Redeploy the app so renders use the new, bigger function.
#   3. (Optional) delete the old function later: npx remotion lambda functions ls / rm.
#
# Usage:
#   npm run deploy:remotion:function
#   REMOTION_FUNCTION_MEMORY=4096 npm run deploy:remotion:function   # override a default
#
# Defaults: 8192MB RAM (~4.6 vCPU, ~4x the old 2GB → ~4x faster frames), 4096MB disk, 900s timeout (AWS max).

set -e

MEMORY=${REMOTION_FUNCTION_MEMORY:-8192}
DISK=${REMOTION_FUNCTION_DISK:-4096}
TIMEOUT=${REMOTION_FUNCTION_TIMEOUT:-900}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Deploying Remotion render function: mem=${MEMORY}MB disk=${DISK}MB timeout=${TIMEOUT}s${NC}"

# Load AWS credentials. .env.local is the canonical local env file (Next.js); it can hold complex JSON
# values that break `source`, so pull only the three AWS keys we need. Honors .env.local.prod /
# production.env / development.env too, and strips surrounding quotes + trailing CR (Windows CRLF files).
load_env_key() {
  local key="$1" file line val
  for file in .env.local .env.local.prod production.env development.env; do
    [ -f "$file" ] || continue
    line=$(grep -E "^[[:space:]]*${key}=" "$file" | head -1)
    [ -n "$line" ] || continue
    val=${line#*=}
    val=${val%$'\r'}
    val=${val%\"}; val=${val#\"}
    val=${val%\'}; val=${val#\'}
    if [ -n "$val" ]; then printf '%s' "$val"; return 0; fi
  done
}

if [ -z "$REMOTION_AWS_ACCESS_KEY_ID" ]; then
  export REMOTION_AWS_ACCESS_KEY_ID="$(load_env_key REMOTION_AWS_ACCESS_KEY_ID)"
  export REMOTION_AWS_SECRET_ACCESS_KEY="$(load_env_key REMOTION_AWS_SECRET_ACCESS_KEY)"
  [ -z "$REMOTION_AWS_REGION" ] && export REMOTION_AWS_REGION="$(load_env_key REMOTION_AWS_REGION)"
fi

if [ -z "$REMOTION_AWS_ACCESS_KEY_ID" ]; then
  echo -e "${RED}❌ Error: REMOTION_AWS_ACCESS_KEY_ID not found${NC}"
  echo "Set it in your shell, or in .env.local / .env.local.prod / production.env"
  exit 1
fi

export AWS_ACCESS_KEY_ID=$REMOTION_AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$REMOTION_AWS_SECRET_ACCESS_KEY
export AWS_REGION=${REMOTION_AWS_REGION:-us-east-1}

echo -e "  Region: ${AWS_REGION}"
echo ""

npx remotion lambda functions deploy \
  --memory=$MEMORY \
  --disk=$DISK \
  --timeout=$TIMEOUT

echo ""
echo -e "${GREEN}✅ Function deployed.${NC} It coexists with the old one — nothing else is disrupted."
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Copy the function name printed above (remotion-render-...-mem${MEMORY}mb-disk${DISK}mb-${TIMEOUT}sec)"
echo "2. Set REMOTION_LAMBDA_FUNCTION_NAME to it in Vercel env + your local env file"
echo "3. Redeploy the app so renders pick up the new function"
echo "4. (Optional) remove the old 2GB function later: npx remotion lambda functions ls / rm"
echo ""
