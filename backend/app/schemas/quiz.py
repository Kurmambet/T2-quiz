import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class QuizAnswerOptionCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    is_correct: bool = False


class QuizQuestionCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    time_limit_seconds: int = Field(default=30, ge=5, le=600)
    points: int = Field(default=100, ge=1, le=10000)
    options: list[QuizAnswerOptionCreate] = Field(
        min_length=2,
        max_length=8,
    )

    @model_validator(mode="after")
    def validate_correct_option(self) -> "QuizQuestionCreate":
        correct_options = sum(option.is_correct for option in self.options)

        if correct_options != 1:
            raise ValueError(
                "Each question must have exactly one correct option",
            )

        return self


class QuizTemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    questions: list[QuizQuestionCreate] = Field(
        min_length=1,
        max_length=100,
    )

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = " ".join(value.split())

        if not normalized:
            raise ValueError("Title must not be empty")

        return normalized


class QuizTemplateRead(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    is_published: bool
    created_at: datetime


class QuizTemplateDetails(QuizTemplateRead):
    questions_count: int
