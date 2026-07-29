"""
Authenticated Modal deployment for Editron's semantic SFX retrieval worker.

Deploy only after staging the receipt-bound bundle at repo-root
`.semantic-artifacts/`. The current bundle is an infrastructure canary and is
not a substitute for a genuinely human-approved production catalog.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess

import modal

APP_NAME = "editron-sfx-semantic-canary"
SECRET_NAME = "editron-sfx-semantic-canary"
WORKER_PORT = 8080
WORKER_CONCURRENCY = 4
BUNDLE_RECEIPT_SHA256 = (
    "298f8b164afc63a2ca58234a04da7a7d886e9e4289dcffc070989dee8a068981"
)

REPO_ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = REPO_ROOT / "Dockerfile.sfx-semantic-worker"
DOCKERIGNORE = REPO_ROOT / "Dockerfile.sfx-semantic-worker.dockerignore"

app = modal.App(APP_NAME)
worker_secret = modal.Secret.from_name(
    SECRET_NAME,
    required_keys=["SFX_SEMANTIC_RETRIEVAL_TOKEN"],
)
worker_image = modal.Image.from_dockerfile(
    DOCKERFILE,
    context_dir=REPO_ROOT,
    add_python="3.11",
    build_args={
        "SFX_SEMANTIC_BUNDLE_RECEIPT_SHA256": BUNDLE_RECEIPT_SHA256,
    },
    ignore=modal.FilePatternMatcher.from_file(DOCKERIGNORE),
)


@app.function(
    image=worker_image,
    secrets=[worker_secret],
    cpu=2.0,
    memory=2048,
    min_containers=0,
    max_containers=3,
    scaledown_window=300,
    startup_timeout=120,
    timeout=300,
)
@modal.concurrent(max_inputs=WORKER_CONCURRENCY, target_inputs=2)
@modal.web_server(
    WORKER_PORT,
    startup_timeout=120,
    requires_proxy_auth=True,
)
def serve() -> None:
    subprocess.Popen(
        [
            "/app/node_modules/.bin/tsx",
            "scripts/run-sfx-semantic-worker.ts",
        ],
        cwd="/app",
        env=os.environ.copy(),
    )
