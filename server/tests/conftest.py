from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from helpers import settings_with

from hearhear import app as app_module
from hearhear.access import AccessLockout
from hearhear.budget import TokenBudget


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """The app in fixture mode, with a built frontend in tmp_path, a fresh
    budget and access lockout, and empty rate-limit counters."""
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('hi')")
    (tmp_path / "index.html").write_text("<!doctype html><title>Hear Hear</title>")
    settings = settings_with(dist_dir=tmp_path, tutor_mode="fixture")
    monkeypatch.setattr(app_module, "settings", settings)
    monkeypatch.setattr(app_module, "budget", TokenBudget(settings.daily_token_budget))
    monkeypatch.setattr(app_module, "lockout", AccessLockout())
    app_module.limiter.reset()
    return TestClient(app_module.app)
