from fastapi import APIRouter

from app.api.routes.game_sessions import router as game_sessions_router
from app.api.routes.health import router as health_router
from app.api.routes.quiz_templates import router as quiz_templates_router
from app.api.routes.rooms import router as rooms_router
from app.core.config import get_settings

settings = get_settings()

api_router = APIRouter()

api_router.include_router(health_router)

api_router.include_router(
    quiz_templates_router,
    prefix=settings.api_v1_prefix,
)

api_router.include_router(
    rooms_router,
    prefix=settings.api_v1_prefix,
)

api_router.include_router(
    game_sessions_router,
    prefix=settings.api_v1_prefix,
)
