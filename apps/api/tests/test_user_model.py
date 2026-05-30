from app.db import Base
from app.models import User


def test_user_model_maps_to_users_table() -> None:
    assert User.__tablename__ == "users"
    assert "users" in Base.metadata.tables


def test_user_model_has_identity_and_profile_columns() -> None:
    columns = User.__table__.columns

    assert columns["id"].primary_key is True
    assert columns["github_id"].unique is True
    assert columns["github_id"].index is True
    assert columns["github_id"].type.length == 64
    assert columns["username"].type.length == 255
    assert columns["display_name"].type.length == 255
    assert columns["avatar_url"].type.length == 2048
    assert columns["email"].type.length == 320


def test_user_model_defaults_to_non_guest_user() -> None:
    user = User()

    assert user.is_guest is None
    assert User.__table__.columns["is_guest"].default.arg is False
