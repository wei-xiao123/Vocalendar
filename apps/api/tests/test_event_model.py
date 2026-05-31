from app.db import Base
from app.models import Event


def test_event_model_maps_to_events_table() -> None:
    assert Event.__tablename__ == "events"
    assert "events" in Base.metadata.tables


def test_event_model_has_owner_and_schedule_columns() -> None:
    columns = Event.__table__.columns

    assert columns["id"].primary_key is True
    assert columns["user_id"].index is True
    assert columns["user_id"].nullable is False
    assert columns["title"].nullable is False
    assert columns["title"].type.length == 255
    assert columns["starts_at"].nullable is False
    assert columns["ends_at"].nullable is True
    assert columns["reminder_at"].nullable is True


def test_event_model_has_status_and_source_text_columns() -> None:
    columns = Event.__table__.columns

    assert columns["status"].nullable is False
    assert columns["status"].type.length == 32
    assert columns["status"].default.arg == "scheduled"
    assert columns["source_text"].nullable is True


def test_event_model_has_external_sync_columns() -> None:
    columns = Event.__table__.columns

    assert columns["external_provider"].nullable is True
    assert columns["external_calendar_id"].nullable is True
    assert columns["external_event_id"].nullable is True
    assert columns["sync_state"].nullable is False
    assert columns["sync_error"].nullable is True


def test_event_user_foreign_key_cascades_on_delete() -> None:
    user_id_foreign_key = next(iter(Event.__table__.columns["user_id"].foreign_keys))

    assert user_id_foreign_key.column.table.name == "users"
    assert user_id_foreign_key.column.name == "id"
    assert user_id_foreign_key.ondelete == "CASCADE"
