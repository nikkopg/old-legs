import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response

from dependencies import get_current_user

router = APIRouter(tags=["share"])

_store: dict[str, tuple[bytes, float]] = {}
_TTL = 86400  # 24 hours


def _cleanup() -> None:
    now = time.time()
    expired = [k for k, (_, exp) in _store.items() if exp < now]
    for k in expired:
        del _store[k]


@router.post("")
async def upload_share_image(
    file: UploadFile = File(...),
    _current_user=Depends(get_current_user),
) -> dict:
    _cleanup()
    data = await file.read()
    if len(data) > 5_000_000:
        raise HTTPException(status_code=400, detail="Image too large")
    token = str(uuid.uuid4())
    _store[token] = (data, time.time() + _TTL)
    return {"token": token}


@router.get("/{token}")
async def get_share_image(token: str) -> Response:
    _cleanup()
    entry = _store.get(token)
    if not entry:
        raise HTTPException(status_code=404, detail="Not found or expired")
    data, _ = entry
    return Response(
        content=data,
        media_type="image/png",
        headers={"Access-Control-Allow-Origin": "*"},
    )
