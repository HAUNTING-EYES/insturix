import importlib.util
from pathlib import Path


def load_vjepa_module():
    module_path = Path(__file__).with_name("vjepa_visual.py")
    spec = importlib.util.spec_from_file_location("editron_vjepa_visual", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_normalize_max_frames_per_segment_clamps_request_values():
    vjepa = load_vjepa_module()

    assert vjepa._normalize_max_frames_per_segment(None) == 64
    assert vjepa._normalize_max_frames_per_segment("bad") == 64
    assert vjepa._normalize_max_frames_per_segment(4) == 8
    assert vjepa._normalize_max_frames_per_segment(32) == 32
    assert vjepa._normalize_max_frames_per_segment(100) == 64