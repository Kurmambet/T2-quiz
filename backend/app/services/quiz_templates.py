from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quiz import (
    QuizAnswerOption,
    QuizQuestion,
    QuizTemplate,
)
from app.schemas.quiz import QuizTemplateCreate


class QuizTemplateAlreadyExistsError(Exception):
    pass


async def list_quiz_templates(
    session: AsyncSession,
) -> list[QuizTemplate]:
    return list(
        await session.scalars(
            select(QuizTemplate)
            .where(QuizTemplate.is_published.is_(True))
            .order_by(QuizTemplate.created_at.desc())
        )
    )


async def create_quiz_template(
    session: AsyncSession,
    payload: QuizTemplateCreate,
) -> QuizTemplate:
    template = QuizTemplate(
        title=payload.title,
        description=payload.description,
        is_published=True,
    )

    session.add(template)
    await session.flush()

    for question_position, question_data in enumerate(
        payload.questions,
        start=1,
    ):
        question = QuizQuestion(
            quiz_template_id=template.id,
            position=question_position,
            content=question_data.content,
            time_limit_seconds=question_data.time_limit_seconds,
            points=question_data.points,
        )

        session.add(question)
        await session.flush()

        for option_position, option_data in enumerate(
            question_data.options,
            start=1,
        ):
            session.add(
                QuizAnswerOption(
                    quiz_question_id=question.id,
                    position=option_position,
                    content=option_data.content,
                    is_correct=option_data.is_correct,
                )
            )

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise QuizTemplateAlreadyExistsError from error

    await session.refresh(template)

    return template
