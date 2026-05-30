from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class GuestUserResponse(BaseModel):
    id: int
    is_guest: bool
    username: str | None = None
    display_name: str | None = None


def _create_guest_user(session: Session) -> User:
    user = User(
        username=None,
        display_name="Guest User",
        avatar_url=None,
        email=None,
        is_guest=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/guest", response_model=GuestUserResponse)
def create_guest_session() -> GuestUserResponse:
    session = SessionLocal()
    try:
        user = _create_guest_user(session)
        return GuestUserResponse(
            id=user.id,
            is_guest=user.is_guest,
            username=user.username,
            display_name=user.display_name,
        )
    finally:
        session.close()
