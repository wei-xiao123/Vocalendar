from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app


def test_create_guest_session_persists_guest_user(monkeypatch) -> None:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr("app.routes.auth.SessionLocal", TestingSessionLocal)

    client = TestClient(app)

    response = client.post("/auth/guest")

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "is_guest": True,
        "username": None,
        "display_name": "Guest User",
    }
