"""Tests del registro de modelos A16 (sin red, con artefactos sintéticos)."""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
sys.path.insert(0, PIPELINE)

import registry  # noqa: E402


def fake_football_artifact(version: str = "1.0.0") -> dict:
    return {
        "type": "multinomial_logistic",
        "version": version,
        "created_at": "2026-11-09T00:00:00+00:00",
        "features": ["a", "b", "c", "div_X"],
        "n_features_base": 3,
        "div_levels": ["X"],
        "imputer": {"strategy": "median", "statistics": [0, 0, 0, 0]},
        "scaler": {"mean": [0, 0, 0, 0], "scale": [1, 1, 1, 1]},
        "coef": [[0.1, 0.2, 0.3, 0.0], [0.0, 0.0, 0.0, 0.0], [-0.1, -0.2, -0.3, 0.0]],
        "intercept": [0.0, 0.0, 0.0],
        "classes": [0, 1, 2],
    }


class RegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.registry_path = os.path.join(self.tmp, "models.json")
        self.artifact = os.path.join(self.tmp, "model.json")
        with open(self.artifact, "w") as f:
            json.dump(fake_football_artifact(), f)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _register(self, *extra: str, version: str = "1.0.0") -> int:
        argv = [
            "--registry", self.registry_path, "register",
            "--model-id", "m1", "--sport", "football", "--version", version,
            "--artifact", self.artifact, *extra,
        ]
        return registry.main(argv)

    def test_register_creates_entry_with_sha_and_metrics(self) -> None:
        self.assertEqual(self._register("--val-log-loss", "1.01", "--test-log-loss", "1.02"), 0)
        with open(self.registry_path) as f:
            data = json.load(f)
        entry = data["models"][0]
        self.assertEqual(entry["model_id"], "m1")
        self.assertEqual(entry["versions"][0]["version"], "1.0.0")
        self.assertEqual(len(entry["versions"][0]["artifact_sha256"]), 64)
        self.assertAlmostEqual(entry["versions"][0]["metrics"]["val_log_loss"], 1.01)

    def test_duplicate_same_hash_is_noop(self) -> None:
        self._register("--val-log-loss", "1.0", "--test-log-loss", "1.0")
        self.assertEqual(self._register("--val-log-loss", "1.0", "--test-log-loss", "1.0"), 0)
        with open(self.registry_path) as f:
            data = json.load(f)
        self.assertEqual(len(data["models"][0]["versions"]), 1)

    def test_duplicate_version_with_other_hash_fails(self) -> None:
        self._register("--val-log-loss", "1.0", "--test-log-loss", "1.0")
        with open(self.artifact, "w") as f:
            json.dump({**fake_football_artifact(), "intercept": [0.1, 0.0, 0.0]}, f)
        with self.assertRaises(SystemExit):
            self._register("--val-log-loss", "1.0", "--test-log-loss", "1.0")

    def test_verify_detects_tampering(self) -> None:
        self._register("--val-log-loss", "1.0", "--test-log-loss", "1.0")
        self.assertEqual(registry.main(["--registry", self.registry_path, "verify", "--model-id", "m1"]), 0)
        with open(self.artifact, "a") as f:
            f.write("\n")
        self.assertEqual(registry.main(["--registry", self.registry_path, "verify", "--model-id", "m1"]), 1)

    def test_promote_requires_metrics(self) -> None:
        self._register()
        code = registry.main(["--registry", self.registry_path, "promote",
                              "--model-id", "m1", "--version", "1.0.0"])
        self.assertEqual(code, 1)

    def test_promote_with_metrics_sets_status(self) -> None:
        self._register("--val-log-loss", "1.0", "--test-log-loss", "1.0")
        code = registry.main(["--registry", self.registry_path, "promote",
                              "--model-id", "m1", "--version", "1.0.0", "--to", "deployed"])
        self.assertEqual(code, 0)
        with open(self.registry_path) as f:
            data = json.load(f)
        self.assertEqual(data["models"][0]["status"], "deployed")
        self.assertEqual(data["models"][0]["deployed_version"], "1.0.0")

    def test_list_json_is_valid(self) -> None:
        self._register("--val-log-loss", "1.0", "--test-log-loss", "1.0")
        argv = ["--registry", self.registry_path, "list", "--json"]
        self.assertEqual(registry.main(argv), 0)


if __name__ == "__main__":
    unittest.main()
