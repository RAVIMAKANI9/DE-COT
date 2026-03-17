#!/usr/bin/env python3
"""
Phase 0: Environment setup, dependency validation, secrets check, and DB notification.
Run this first before any other phase.
"""
import os
import sys
import subprocess
import json
import time
import logging
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/phase0_setup.log"),
    ],
)
log = logging.getLogger(__name__)


def check_secret(name: str, required: bool = True) -> bool:
    val = os.environ.get(name)
    if val:
        log.info(f"✓ {name} is set ({len(val)} chars)")
        return True
    elif required:
        log.error(f"✗ {name} is MISSING (required)")
        return False
    else:
        log.warning(f"⚠ {name} is not set (optional)")
        return True


def check_package(pkg: str) -> bool:
    try:
        __import__(pkg.replace("-", "_").split("[")[0])
        log.info(f"✓ {pkg} importable")
        return True
    except ImportError:
        log.warning(f"⚠ {pkg} not importable — will attempt install")
        return False


def install_packages():
    packages = [
        "datasets",
        "openai>=1.0.0",
        "tiktoken",
        "tqdm",
        "pandas",
        "pyarrow",
        "requests",
        "psycopg2-binary",
    ]
    log.info("Installing core Python packages...")
    for pkg in packages:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", pkg],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            log.info(f"  ✓ {pkg}")
        else:
            log.error(f"  ✗ {pkg}: {result.stderr[:200]}")

    # Heavy ML packages — may take time
    ml_packages = [
        "torch",
        "transformers>=4.40.0",
        "peft>=0.10.0",
        "trl>=0.8.0",
        "accelerate>=0.30.0",
        "bitsandbytes>=0.43.0",
        "scipy",
        "einops",
    ]
    log.info("Installing ML packages (this may take several minutes)...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q"] + ml_packages,
        capture_output=True, text=True, timeout=600
    )
    if result.returncode == 0:
        log.info("✓ ML packages installed")
    else:
        log.error(f"ML package install warning: {result.stderr[:500]}")


def create_directories():
    dirs = [
        "data/raw",
        "data/processed",
        "outputs/cot_data",
        "outputs/cot_filtered",
        "outputs/checkpoints",
        "outputs/evals",
        "outputs/final_adapter",
        "logs",
    ]
    for d in dirs:
        Path(d).mkdir(parents=True, exist_ok=True)
    log.info(f"✓ Created {len(dirs)} directories")


def notify_api(phase: int, status: str, message: str):
    """Notify the dashboard API about phase updates."""
    import urllib.request
    import urllib.error

    api_base = os.environ.get("PIPELINE_API_URL", "http://localhost:80/api")
    payload = json.dumps({
        "phase": phase,
        "status": status,
        "message": message,
        "timestamp": datetime.utcnow().isoformat()
    }).encode()

    try:
        req = urllib.request.Request(
            f"{api_base}/pipeline/internal/phase-update",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log.info(f"API notified: phase {phase} -> {status}")
    except Exception as e:
        log.debug(f"API notification skipped: {e}")


def write_state_file(state: dict):
    """Write pipeline state to a local JSON file for cross-script communication."""
    state_path = Path("outputs/pipeline_state.json")
    if state_path.exists():
        existing = json.loads(state_path.read_text())
        existing.update(state)
        state = existing
    state["updated_at"] = datetime.utcnow().isoformat()
    state_path.write_text(json.dumps(state, indent=2))
    log.info(f"State written to {state_path}")


def main():
    log.info("=" * 60)
    log.info("DE-COT Pipeline — Phase 0: Environment Setup")
    log.info("=" * 60)

    errors = []

    # 1. Check secrets
    log.info("\n--- Checking API Keys ---")
    if not check_secret("OPENAI_API_KEY", required=True):
        errors.append("OPENAI_API_KEY missing")
    check_secret("HF_TOKEN", required=False)

    # 2. Create directories
    log.info("\n--- Creating Directories ---")
    create_directories()

    # 3. Check Python version
    log.info(f"\n--- Python {sys.version} ---")
    assert sys.version_info >= (3, 9), "Python 3.9+ required"

    # 4. Install packages
    log.info("\n--- Installing Packages ---")
    install_packages()

    # 5. Validate imports
    log.info("\n--- Validating Imports ---")
    core_imports = ["datasets", "openai", "tqdm", "pandas", "psycopg2"]
    ml_imports = ["torch", "transformers", "peft", "trl", "accelerate"]
    all_ok = True
    for pkg in core_imports + ml_imports:
        if not check_package(pkg):
            all_ok = False

    # 6. Check GPU
    log.info("\n--- GPU Check ---")
    try:
        import torch
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                vram_gb = props.total_memory / 1e9
                log.info(f"✓ GPU {i}: {props.name} — {vram_gb:.1f} GB VRAM")
        else:
            log.warning("⚠ No CUDA GPU detected — training will be very slow on CPU")
    except ImportError:
        log.warning("⚠ torch not available for GPU check")

    # 7. Write state
    write_state_file({
        "phase0_completed": True,
        "phase0_errors": errors,
        "setup_time": datetime.utcnow().isoformat(),
    })

    notify_api(0, "completed", "Environment setup complete")

    if errors:
        log.error(f"\n✗ Phase 0 completed with {len(errors)} error(s): {errors}")
        sys.exit(1)
    else:
        log.info("\n✓ Phase 0 completed successfully — environment ready")
        log.info("Next step: python pipeline/01_download.py")


if __name__ == "__main__":
    main()
