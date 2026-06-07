from fastapi import APIRouter, Response

from app.core.security import create_session


router = APIRouter()


@router.get("/session")
async def api_session(response: Response) -> dict[str, int | str]:
    return create_session(response)
