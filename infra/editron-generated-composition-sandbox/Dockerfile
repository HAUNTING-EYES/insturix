FROM node:22.22.0-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-noto-color-emoji \
    fonts-noto-core \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /vercel/sandbox

COPY infra/editron-generated-composition-sandbox/package.json ./package.json
COPY infra/editron-generated-composition-sandbox/pnpm-lock.yaml ./pnpm-lock.yaml

RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && node -e "const fs=require('node:fs'); const path=require('node:path'); const pkg=JSON.parse(fs.readFileSync(path.join(process.cwd(),'node_modules/mediabunny/package.json'),'utf8')); if(pkg.version!=='1.27.2') process.exit(1); import('mediabunny').then(() => console.log('MEDIABUNNY_OK')).catch((error) => { console.error(error); process.exit(1); })" \
  && node -e "require('@remotion/renderer').ensureBrowser().then(() => console.log('BROWSER_BAKED')).catch((error) => { console.error(error); process.exit(1); })" \
  && version="$(getconf GNU_LIBC_VERSION | awk '{print $2}')" \
  && test "$(printf '%s\n' 2.35 "$version" | sort -V | head -1)" = 2.35 \
  && binary="$(find node_modules -type f -path '*/@remotion/compositor-linux-x64-gnu/remotion' -print -quit)" \
  && test -n "$binary" \
  && ! ldd "$binary" | grep -q 'not found' \
  && node -e "require('@remotion/renderer').openBrowser('chrome').then(async (browser) => { console.log('BROWSER_OK'); await browser.close({silent:true}); }).catch((error) => { console.error(error); process.exit(1); })" \
  && node -e "require('sharp'); console.log('SHARP_OK')" \
  && node -e "const fs=require('node:fs'); const ffmpeg=require('@ffmpeg-installer/ffmpeg').path; if(!ffmpeg || !fs.existsSync(ffmpeg)) process.exit(1); console.log('FFMPEG_OK')" \
  && test -x node_modules/.bin/tsx \
  && chmod -R a+rX /vercel/sandbox
