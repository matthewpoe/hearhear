import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from helpers import LESSON, settings_with

from hearhear import app as app_module
from hearhear import tutor
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
    monkeypatch.setattr(app_module, "streams", asyncio.Semaphore(settings.max_concurrent))
    app_module.limiter.reset()
    return TestClient(app_module.app)


@pytest.fixture
def recorded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A recorded-lessons dir holding `ode-ending`, with a JSON file beside it
    that no lesson id may reach."""
    lessons = tmp_path / "lessons" / "recorded"
    lessons.mkdir(parents=True)
    (lessons / "ode-ending.json").write_text(json.dumps(LESSON))
    (lessons.parent / "secret.json").write_text(json.dumps(LESSON))
    monkeypatch.setattr(tutor, "LESSONS_DIR", lessons)
    return lessons
