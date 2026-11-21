"""Dev-only server: the real FastAPI app wired to the fake provider (no paid API calls).
Used for browser E2E checks:  python -m tests.e2e_server
"""
import tempfile
import uvicorn
from app.main import create_app
from tests.conftest import KEY_1, KEY_2, MODEL, make_settings
from pathlib import Path

if __name__ == "__main__":
    tmp = Path(tempfile.mkdtemp())
    app = create_app(make_settings(tmp, llm_api_keys=[KEY_1, KEY_2], llm_model=MODEL))
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
