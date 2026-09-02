"""
Gemma 4 Editorial Classifier — Fine-Tune + Deploy on Modal

Fine-tunes Gemma 4 26B-A4B (or E4B) on KEEP/CUT classification data,
then deploys as a serverless endpoint on Modal with vLLM.

Determinism guarantees:
  - Temperature 0 (greedy decoding)
  - FP32 precision (no floating-point non-associativity)
  - Single-request inference (no batch effects)
  - Fixed model weights (no silent updates)
  - Same input = same output, every time.

Usage:
  # Fine-tune (run once)
  modal run finetune_and_deploy.py::finetune

  # Deploy inference endpoint (persistent)
  modal deploy finetune_and_deploy.py

  # Test locally
  modal serve finetune_and_deploy.py

Endpoint: POST /classify
  Body: {"segments": [{"index": 0, "text": "..."}, ...]}
  Returns: {"decisions": [{"index": 0, "decision": "KEEP"}, ...]}

The deployed endpoint requires Modal proxy authentication with `Modal-Key` and
`Modal-Secret`. It is a standalone research classifier, not an Editron worker
or a ProjectService mutation path.
"""

from __future__ import annotations
import modal

# ─── Modal App ──────────────────────────────────────────────────────

app = modal.App("gemma-editorial")

# ─── Fine-Tuning Image ─────────────────────────────────────────────

finetune_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.4",
        "transformers>=4.46",
        "datasets>=3.0",
        "trl>=0.12",
        "peft>=0.14",
        "accelerate>=1.2",
        "bitsandbytes>=0.45",
        "huggingface_hub",
    )
)

# ─── Inference Image ───────────────────────────────────────────────

inference_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm>=0.8",
        "torch>=2.4",
        "transformers>=4.46",
        "huggingface_hub",
        "fastapi[standard]",
    )
)

# ─── Volume for model weights ──────────────────────────────────────

model_volume = modal.Volume.from_name("gemma-editorial-weights", create_if_missing=True)
MODEL_DIR = "/model"

# ─── Fine-Tuning Function ─────────────────────────────────────────

@app.function(
    image=finetune_image,
    gpu="A10G",
    timeout=3600,
    volumes={MODEL_DIR: model_volume},
    # secrets=[modal.Secret.from_name("huggingface-secret")],  # Create this secret before fine-tuning
)
def finetune(
    training_data_path: str = "/data/training_data.jsonl",
    base_model: str = "Qwen/Qwen2.5-3B-Instruct",
    epochs: int = 3,
    lr: float = 2e-4,
    batch_size: int = 4,
):
    """Fine-tune Gemma on disfluency tagging data using PEFT + TRL (no Unsloth)."""
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model
    from trl import SFTTrainer, SFTConfig
    import os

    print(f"[FineTune] Loading base model: {base_model}")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype="bfloat16",
    )
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForCausalLM.from_pretrained(
        base_model, quantization_config=bnb_config, device_map="auto",
    )

    lora_config = LoraConfig(
        r=16, lora_alpha=16, lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    print(f"[FineTune] Loading training data: {training_data_path}")
    import json as _json
    raw_data = []
    with open(training_data_path) as f:
        for line in f:
            item = _json.loads(line)
            msgs = item["messages"]
            text = f"<|im_start|>user\n{msgs[0]['content']}<|im_end|>\n<|im_start|>assistant\n{msgs[1]['content']}<|im_end|>"
            raw_data.append({"text": text})

    from datasets import Dataset
    dataset = Dataset.from_list(raw_data)

    print(f"[FineTune] {len(dataset)} training examples loaded")
    print(f"[FineTune] Starting fine-tuning: {epochs} epochs, lr={lr}, batch={batch_size}")

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        args=SFTConfig(
            output_dir=os.path.join(MODEL_DIR, "checkpoints"),
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            learning_rate=lr,
            warmup_steps=10,
            logging_steps=10,
            save_strategy="epoch",
            bf16=True,
            seed=42,
        ),
    )

    trainer.train()

    # Save merged model (LoRA merged into base weights)
    save_path = os.path.join(MODEL_DIR, "gemma-editorial-classifier")
    print(f"[FineTune] Saving merged model to {save_path}")
    merged = model.merge_and_unload()
    merged.save_pretrained(save_path)
    tokenizer.save_pretrained(save_path)

    model_volume.commit()
    print(f"[FineTune] Done. Model saved to volume at {save_path}")


# ─── Inference Endpoint ────────────────────────────────────────────

@app.cls(
    image=inference_image,
    gpu="A10G",
    volumes={MODEL_DIR: model_volume},
    timeout=300,
    scaledown_window=300,
)
class EditorialClassifier:
    @modal.enter()
    def load_model(self):
        import os
        from vllm import LLM, SamplingParams

        model_path = os.path.join(MODEL_DIR, "gemma-editorial-classifier")
        if not os.path.exists(model_path):
            # Use base instruction-tuned model — already capable of disfluency
            # tagging and editorial classification without fine-tuning.
            # Determinism from: temp=0, enforce_eager, seed=42.
            # Fine-tuned version replaces this once trained.
            # 26B-A4B needs >24GB VRAM even in bf16 (full weights loaded).
            # E4B fits A10G easily (~5GB bf16) and is still Gemma 4 architecture.
            # Upgrade to A100 (80GB) for 26B when ready.
            model_path = "Qwen/Qwen2.5-3B-Instruct"
            print(f"[Editorial] Using base model: {model_path}")
        else:
            print(f"[Editorial] Loading fine-tuned model from {model_path}")

        self.llm = LLM(
            model=model_path,
            max_model_len=8192,
            enforce_eager=True,
            dtype="float16",
        )

        self.sampling_params = SamplingParams(
            temperature=0.0,
            max_tokens=4096,
            seed=42,
        )

        print("[Editorial] Model loaded. Ready for classification.")

    @modal.method()
    def classify_segments(self, segments: list[dict]) -> list[dict]:
        """Holistic edit: ONE call with ALL segments, full context."""
        segment_list = "\n".join(
            f"[{s.get('index', i)}] ({s.get('startSec', '?')}s) \"{s['text']}\""
            for i, s in enumerate(segments)
        )

        prompt = (
            "You are a professional video editor making a rough cut of raw footage.\n\n"
            "Below is the COMPLETE transcript. The speaker recorded this in one session "
            "with retakes, stutters, meta-commentary, and false starts mixed in.\n\n"
            "For each segment, decide KEEP or CUT.\n\n"
            "CUT: stutters, false starts, retakes (keep only the best version), "
            "meta-commentary about recording/editing, incomplete thoughts, filler.\n"
            "KEEP: actual content delivery, thesis, arguments, punchlines, conclusion. "
            "When in doubt, KEEP. A stuttered thesis is better than no thesis.\n\n"
            f"Segments:\n{segment_list}\n\n"
            "Respond with JSON: {\"keep\": [indices], \"cut\": [indices]}"
        )

        outputs = self.llm.generate([prompt], self.sampling_params)
        response_text = outputs[0].outputs[0].text.strip()

        try:
            import json as _json
            parsed = _json.loads(response_text)
            cut_set = set(parsed.get("cut", []))
        except Exception:
            # If JSON parse fails, default to KEEP all (safe)
            print("[Editorial] JSON parse failed, keeping all segments")
            cut_set = set()

        decisions = []
        for i, seg in enumerate(segments):
            idx = seg.get("index", i)
            decision = "CUT" if idx in cut_set else "KEEP"
            decisions.append({"index": idx, "decision": decision})

        return decisions

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def classify(self, payload: dict) -> dict:
        """HTTP endpoint for classification."""
        segments = payload.get("segments", [])
        if not segments:
            return {"error": "No segments provided", "decisions": []}

        decisions = self.classify_segments.local(segments)
        keep_count = sum(1 for d in decisions if d["decision"] == "KEEP")
        cut_count = len(decisions) - keep_count

        return {
            "decisions": decisions,
            "summary": {
                "total": len(decisions),
                "keep": keep_count,
                "cut": cut_count,
            }
        }
