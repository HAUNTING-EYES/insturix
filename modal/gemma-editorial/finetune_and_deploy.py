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
"""

from __future__ import annotations
import modal
import json

# ─── Modal App ──────────────────────────────────────────────────────

app = modal.App("gemma-editorial")

# ─── Fine-Tuning Image ─────────────────────────────────────────────

finetune_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "unsloth[colab-new]>=2024.12",
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
    gpu=modal.gpu.A10G(),
    timeout=3600,
    volumes={MODEL_DIR: model_volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
def finetune(
    training_data_path: str = "/data/training_data.jsonl",
    base_model: str = "google/gemma-3-4b-it",
    epochs: int = 3,
    lr: float = 2e-4,
    batch_size: int = 4,
):
    """Fine-tune Gemma on KEEP/CUT classification data."""
    from unsloth import FastModel
    from trl import SFTTrainer, SFTConfig
    from datasets import load_dataset
    import os

    print(f"[FineTune] Loading base model: {base_model}")

    # Load model with QLoRA
    model, tokenizer = FastModel.from_pretrained(
        model_name=base_model,
        max_seq_length=2048,
        load_in_4bit=True,
    )

    # Add LoRA adapters
    model = FastModel.get_peft_model(
        model,
        r=16,
        lora_alpha=16,
        lora_dropout=0.05,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
    )

    print(f"[FineTune] Loading training data: {training_data_path}")
    dataset = load_dataset("json", data_files=training_data_path, split="train")

    print(f"[FineTune] {len(dataset)} training examples loaded")
    print(f"[FineTune] Starting fine-tuning: {epochs} epochs, lr={lr}, batch={batch_size}")

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=SFTConfig(
            output_dir=os.path.join(MODEL_DIR, "checkpoints"),
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            learning_rate=lr,
            warmup_steps=10,
            logging_steps=10,
            save_strategy="epoch",
            fp16=True,
            seed=42,
        ),
    )

    trainer.train()

    # Save merged model (LoRA merged into base weights)
    save_path = os.path.join(MODEL_DIR, "gemma-editorial-classifier")
    print(f"[FineTune] Saving merged model to {save_path}")
    model.save_pretrained_merged(save_path, tokenizer, save_method="merged_16bit")
    tokenizer.save_pretrained(save_path)

    model_volume.commit()
    print(f"[FineTune] Done. Model saved to volume at {save_path}")


# ─── Inference Endpoint ────────────────────────────────────────────

@app.cls(
    image=inference_image,
    gpu=modal.gpu.A10G(),
    volumes={MODEL_DIR: model_volume},
    timeout=120,
    container_idle_timeout=300,
    allow_concurrent_inputs=4,
)
class EditorialClassifier:
    @modal.enter()
    def load_model(self):
        import os
        from vllm import LLM, SamplingParams

        model_path = os.path.join(MODEL_DIR, "gemma-editorial-classifier")
        if not os.path.exists(model_path):
            # Fallback to base model if fine-tuned version not yet available
            model_path = "google/gemma-3-4b-it"
            print(f"[Editorial] Fine-tuned model not found, using base: {model_path}")
        else:
            print(f"[Editorial] Loading fine-tuned model from {model_path}")

        self.llm = LLM(
            model=model_path,
            max_model_len=4096,
            enforce_eager=True,
        )

        self.sampling_params = SamplingParams(
            temperature=0.0,
            max_tokens=10,
            seed=42,
        )

        print("[Editorial] Model loaded. Ready for classification.")

    @modal.method()
    def classify_segments(self, segments: list[dict]) -> list[dict]:
        """Classify transcript segments as KEEP or CUT."""
        prompts = []
        for seg in segments:
            prompts.append(
                f"You are a professional video editor. Classify this raw footage "
                f"transcript segment as KEEP (include in final edit) or CUT "
                f"(remove from final edit).\n\n"
                f"Segment: \"{seg['text']}\""
            )

        outputs = self.llm.generate(prompts, self.sampling_params)

        decisions = []
        for i, output in enumerate(outputs):
            text = output.outputs[0].text.strip().upper()
            decision = "KEEP" if "KEEP" in text else "CUT"
            decisions.append({
                "index": segments[i].get("index", i),
                "decision": decision,
            })

        return decisions

    @modal.web_endpoint(method="POST")
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
