from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.quiz import (
    QuizTemplateCreate,
    QuizTemplateDetails,
)
from app.services.quiz_templates import (
    QuizTemplateAlreadyExistsError,
    create_quiz_template,
    list_quiz_templates,
)

router = APIRouter(
    prefix="/quiz-templates",
    tags=["quiz templates"],
)

DbSession = Annotated[
    AsyncSession,
    Depends(get_db_session),
]


@router.get(
    "",
    response_model=list[QuizTemplateDetails],
)
async def get_quiz_templates(
    session: DbSession,
) -> list[QuizTemplateDetails]:
    templates = await list_quiz_templates(session)

    return [
        QuizTemplateDetails(
            id=template.id,
            title=template.title,
            description=template.description,
            is_published=template.is_published,
            created_at=template.created_at,
            questions_count=await _get_questions_count(
                session=session,
                template_id=template.id,
            ),
        )
        for template in templates
    ]


@router.post(
    "",
    response_model=QuizTemplateDetails,
    status_code=status.HTTP_201_CREATED,
)
async def create_quiz_template_endpoint(
    payload: QuizTemplateCreate,
    session: DbSession,
) -> QuizTemplateDetails:
    try:
        template = await create_quiz_template(
            session=session,
            payload=payload,
        )
    except QuizTemplateAlreadyExistsError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Quiz template with this title already exists",
        ) from error

    return QuizTemplateDetails(
        id=template.id,
        title=template.title,
        description=template.description,
        is_published=template.is_published,
        created_at=template.created_at,
        questions_count=len(payload.questions),
    )


async def _get_questions_count(
    session: AsyncSession,
    template_id: object,
) -> int:
    from sqlalchemy import func, select

    from app.models.quiz import QuizQuestion

    return int(
        await session.scalar(
            select(func.count())
            .select_from(QuizQuestion)
            .where(QuizQuestion.quiz_template_id == template_id)
        )
        or 0
    )
