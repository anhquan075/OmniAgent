from fastapi import APIRouter, Header, Response

from app.core.security import create_session


router = APIRouter()


@router.get("/session")
async def api_session(
    response: Response,
    operator_token: str | None = Header(default=None, alias="X-Operator-Token"),
) -> dict[str, int | str | bool]:
    return create_session(response, operator_token)
