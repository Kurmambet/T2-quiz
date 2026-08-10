from fastapi import APIRouter, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory
from app.realtime.redis import redis_client

router = APIRouter(tags=["system"])


@router.get("/health")
async def liveness_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness_check() -> dict[str, str]:
    try:
        async with async_session_factory() as session:
            await _check_database(session)

        await _check_redis(redis_client)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dependencies are unavailable",
        ) from error

    return {
        "status": "ready",
        "database": "ok",
        "redis": "ok",
    }


async def _check_database(session: AsyncSession) -> None:
    await session.execute(text("SELECT 1"))


async def _check_redis(redis: Redis) -> None:
    await redis.ping()
