from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from config import REQUEST_TIMEOUT


def fetch_preview(url: str) -> dict:
    """
    Fetch metadata from a URL. Returns a dict with title, description, image, favicon.
    All fields are None on fetch/parse failure (graceful degradation).
    """
    try:
        response = requests.get(
            url,
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "BearLink-Preview/1.0"},
            allow_redirects=True,
        )
        response.raise_for_status()
    except Exception:
        return {"title": None, "description": None, "image": None, "favicon": None}

    try:
        soup = BeautifulSoup(response.text, "html.parser")
    except Exception:
        return {"title": None, "description": None, "image": None, "favicon": None}

    return {
        "title": _get_title(soup),
        "description": _get_description(soup),
        "image": _get_image(soup),
        "favicon": _get_favicon(soup, url),
    }


def _meta(soup: BeautifulSoup, **attrs) -> str | None:
    tag = soup.find("meta", attrs=attrs)
    if tag:
        return tag.get("content") or None
    return None


def _get_title(soup: BeautifulSoup) -> str | None:
    return (
        _meta(soup, property="og:title")
        or _meta(soup, name="twitter:title")
        or (soup.title.string.strip() if soup.title and soup.title.string else None)
    )


def _get_description(soup: BeautifulSoup) -> str | None:
    return (
        _meta(soup, property="og:description")
        or _meta(soup, name="twitter:description")
        or _meta(soup, name="description")
    )


def _get_image(soup: BeautifulSoup) -> str | None:
    return _meta(soup, property="og:image") or _meta(soup, name="twitter:image")


def _get_favicon(soup: BeautifulSoup, url: str) -> str | None:
    tag = soup.find("link", rel=lambda r: r and "icon" in r)
    if tag and tag.get("href"):
        href = tag["href"]
        if href.startswith("http"):
            return href
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        return base + (href if href.startswith("/") else f"/{href}")

    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/favicon.ico"
