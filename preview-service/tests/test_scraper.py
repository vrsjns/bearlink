import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from main import app
from services.scraper import fetch_preview, _get_title, _get_description, _get_image, _get_favicon
from bs4 import BeautifulSoup

client = TestClient(app)


# --- Unit tests for scraper helpers ---

def make_soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def test_get_title_og():
    soup = make_soup('<meta property="og:title" content="OG Title">')
    assert _get_title(soup) == "OG Title"


def test_get_title_twitter_fallback():
    soup = make_soup('<meta name="twitter:title" content="Twitter Title">')
    assert _get_title(soup) == "Twitter Title"


def test_get_title_html_fallback():
    soup = make_soup("<title>HTML Title</title>")
    assert _get_title(soup) == "HTML Title"


def test_get_title_none():
    soup = make_soup("<html></html>")
    assert _get_title(soup) is None


def test_get_description_og():
    soup = make_soup('<meta property="og:description" content="OG Desc">')
    assert _get_description(soup) == "OG Desc"


def test_get_description_meta_fallback():
    soup = make_soup('<meta name="description" content="Meta Desc">')
    assert _get_description(soup) == "Meta Desc"


def test_get_image_og():
    soup = make_soup('<meta property="og:image" content="https://example.com/img.png">')
    assert _get_image(soup) == "https://example.com/img.png"


def test_get_image_none():
    soup = make_soup("<html></html>")
    assert _get_image(soup) is None


def test_get_favicon_absolute():
    soup = make_soup('<link rel="icon" href="https://example.com/favicon.ico">')
    assert _get_favicon(soup, "https://example.com") == "https://example.com/favicon.ico"


def test_get_favicon_relative():
    soup = make_soup('<link rel="icon" href="/favicon.ico">')
    assert _get_favicon(soup, "https://example.com/page") == "https://example.com/favicon.ico"


def test_get_favicon_default_fallback():
    soup = make_soup("<html></html>")
    assert _get_favicon(soup, "https://example.com/page") == "https://example.com/favicon.ico"


# --- fetch_preview integration ---

def test_fetch_preview_returns_nulls_on_request_error():
    with patch("services.scraper.requests.get", side_effect=Exception("timeout")):
        result = fetch_preview("https://example.com")
    assert result == {"title": None, "description": None, "image": None, "favicon": None}


def test_fetch_preview_parses_metadata():
    html = """
    <html>
      <head>
        <meta property="og:title" content="Example Domain">
        <meta property="og:description" content="An example site">
        <meta property="og:image" content="https://example.com/img.jpg">
        <link rel="icon" href="/favicon.ico">
      </head>
    </html>
    """
    mock_response = MagicMock()
    mock_response.text = html
    mock_response.raise_for_status = MagicMock()

    with patch("services.scraper.requests.get", return_value=mock_response):
        result = fetch_preview("https://example.com")

    assert result["title"] == "Example Domain"
    assert result["description"] == "An example site"
    assert result["image"] == "https://example.com/img.jpg"
    assert result["favicon"] == "https://example.com/favicon.ico"


# --- API endpoint tests ---

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready():
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_preview_invalid_url():
    response = client.get("/preview?url=not-a-url")
    assert response.status_code == 400
    assert "Invalid URL" in response.json()["detail"]


def test_preview_missing_url():
    response = client.get("/preview")
    assert response.status_code == 422  # FastAPI validation error


def test_preview_success():
    html = """
    <html>
      <head>
        <title>Test Page</title>
        <meta name="description" content="Test description">
      </head>
    </html>
    """
    mock_response = MagicMock()
    mock_response.text = html
    mock_response.raise_for_status = MagicMock()

    with patch("services.scraper.requests.get", return_value=mock_response):
        response = client.get("/preview?url=https://example.com")

    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://example.com"
    assert data["title"] == "Test Page"
    assert data["description"] == "Test description"
    assert "fetched_at" in data


def test_preview_graceful_degradation():
    with patch("services.scraper.requests.get", side_effect=Exception("unreachable")):
        response = client.get("/preview?url=https://example.com")

    assert response.status_code == 200
    data = response.json()
    assert data["title"] is None
    assert data["description"] is None
    assert data["image"] is None
    assert data["favicon"] is None
