from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.preview import PreviewResponse
from services.scraper import fetch_preview

app = FastAPI(title="BearLink Preview Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _is_valid_url(url: str) -> bool:
    try:
        result = urlparse(url)
        return result.scheme in ("http", "https") and bool(result.netloc)
    except Exception:
        return False


@app.get("/preview", response_model=PreviewResponse)
def get_preview(url: str = Query(..., description="The URL to fetch metadata for")):
    if not _is_valid_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL. Must be a valid HTTP or HTTPS URL.")

    meta = fetch_preview(url)
    return PreviewResponse(
        url=url,
        fetched_at=datetime.now(timezone.utc),
        **meta,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"status": "ready"}
