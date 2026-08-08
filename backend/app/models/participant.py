import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (
        UniqueConstraint(
            "room_id",
            "username_normalized",
            name="participant_room_username_unique",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    username: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
    )

    username_normalized: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
    )

    participant_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
