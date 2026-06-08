# JS/TS Video & Audio Libraries

## Status: Researched in editron 26 (2026-05-23)

## The Honest Truth
The JS ecosystem is WEAK for video processing. No production scene detection library exists in npm. Audio is better served.

## Audio Libraries

### Essentia.js (RECOMMENDED)
- **What**: Beat detection, onset, BPM, spectral features, MFCC
- **Runtime**: WASM, runs in Node.js
- **Production-ready**: YES — MTG Barcelona, published in ISMIR
- **Link**: https://mtg.github.io/essentia.js/
- **Use case**: Direct replacement for Python's librosa
- **Status**: NOT in our package.json yet. Need to add.

### Meyda.js
- **What**: Spectral, energy, loudness features
- **Runtime**: Pure JS, runs in Node.js
- **Production-ready**: YES — lighter alternative to Essentia
- **Link**: npm: meyda
- **Use case**: If Essentia.js is too heavy

### audio-decode (IN STACK)
- **What**: Decode MP3/WAV to PCM buffers
- **Status**: Already in package.json
- **Use case**: Input stage for local RMS computation

### node-web-audio-api (IN STACK)
- **What**: Web Audio API for Node.js
- **Status**: Already in package.json

## Video Libraries

### sharp (IN STACK)
- **What**: Image processing (resize, crop, histogram)
- **Production-ready**: YES — battle-tested
- **Use case**: Frame histogram diff for scene detection
- **Status**: Already in package.json

### ffmpeg (IN STACK — partial)
- **What**: Full video/audio processing
- **In stack as**: @ffmpeg-installer/ffmpeg (system binary), @ffmpeg/ffmpeg (WASM)
- **Current use**: Client-side video compression only (video-compressor.ts)
- **silencedetect**: Never used in codebase. Available but 3-10x slower in WASM.
- **Note**: System binary (@ffmpeg-installer) MAY be available in Vercel but needs testing

### Scene Detection
- **JS/TS**: NOTHING production-grade exists
- **Python**: PySceneDetect (ContentDetector, AdaptiveDetector) — gold standard
- **Our alternative**: Frame histogram diff on existing keyframeAnalyses.dominantColors via sharp
- **If production quality needed**: Modal.com for PySceneDetect (Python sidecar)

### Video Understanding
- **JS/TS**: Nothing. This is Python/CUDA territory.
- **Options**: Qwen3-VL on Modal, Twelve Labs API, Gemini Vision API

## Python Bridge Options

### Modal.com (RECOMMENDED)
- Serverless Python functions callable from TypeScript SDK
- GPU support, auto-scaling, no infra management
- Cold start ~2-3s, warm ~100ms
- Pay per compute second (no idle cost)
- Used by: Anthropic, Ramp, Suno
- Docs: https://modal.com/docs/guide

### AWS Lambda Python
- Already have Lambda for Remotion rendering
- Familiar infrastructure
- No GPU support (unless using SageMaker)

### Microservice (Flask/FastAPI)
- Standard approach
- More ops overhead
- Could deploy on Railway/Render

Tags: #research #libraries #js #python #audio #video
