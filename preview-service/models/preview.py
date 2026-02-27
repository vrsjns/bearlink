from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PreviewResponse(BaseModel):
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    favicon: Optional[str] = None
    fetched_at: datetime