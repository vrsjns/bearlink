import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import urlparse

import aio_pika
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from config import RABBITMQ_URL
from models.preview import PreviewResponse
from services.scraper import fetch_preview

logger = logging.getLogger("preview-service")

PREVIEW_JOBS_QUEUE = "preview_jobs"
PREVIEW_RESULTS_QUEUE = "preview_results"


async def consume_preview_jobs():
    retry_interval = 2.0
    while True:
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            async with connection:
                channel = await connection.channel()
                jobs_queue = await channel.declare_queue(PREVIEW_JOBS_QUEUE, durable=True)
                await channel.declare_queue(PREVIEW_RESULTS_QUEUE, durable=True)

                logger.info("Connected to RabbitMQ, consuming preview jobs")

                async with jobs_queue.iterator() as queue_iter:
                    async for message in queue_iter:
                        async with message.process():
                            data = json.loads(message.body)
                            url_id = data["urlId"]
                            original_url = data["originalUrl"]

                            # fetch_preview uses requests (blocking) — run in thread pool
                            loop = asyncio.get_event_loop()
                            meta = await loop.run_in_executor(None, fetch_preview, original_url)

                            result = {
                                "urlId": url_id,
                                "title": meta["title"],
                                "description": meta["description"],
                                "image": meta["image"],
                                "favicon": meta["favicon"],
                                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                            }

                            await channel.default_exchange.publish(
                                aio_pika.Message(
                                    body=json.dumps(result).encode(),
                                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                                ),
                                routing_key=PREVIEW_RESULTS_QUEUE,
                            )
                            logger.info("Preview result published", extra={"urlId": url_id})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(f"RabbitMQ consumer error, retrying in {retry_interval}s: {exc}")
            await asyncio.sleep(retry_interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(consume_preview_jobs())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="BearLink Preview Service", version="1.0.0", lifespan=lifespan)

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
