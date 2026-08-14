FROM node:22-bookworm-slim

ENV CI=1 \
    NODE_ENV=production \
    REMOTION_BROWSER_EXECUTABLE=/vercel/sandbox/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      fontconfig \
      fonts-noto-color-emoji \
      fonts-noto-core \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libnss3 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /vercel/sandbox
COPY infra/editron-generated-composition-sandbox/package.json infra/editron-generated-composition-sandbox/package-lock.json ./
RUN npm ci --include=optional --no-audit --no-fund \
    && npm audit --omit=dev --audit-level=high \
    && node -e "require('@remotion/renderer').ensureBrowser().then(() => console.log('BROWSER_BAKED')).catch((error) => { console.error(error); process.exit(1); })" \
    && compositor="$(find node_modules -type f -path '*/@remotion/compositor-linux-x64-gnu/remotion' -print -quit)" \
    && test -n "$compositor" \
    && getconf GNU_LIBC_VERSION \
    && ldd "$compositor" \
    && ! ldd "$compositor" | grep -q 'not found' \
    && node -e "require('sharp'); console.log('SHARP_OK')" \
    && test -x node_modules/.bin/tsx \
    && npm cache clean --force

COPY tsconfig.json ./
CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
