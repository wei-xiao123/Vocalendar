from app.settings import Settings


def test_default_cors_origins_include_localhost_and_loopback() -> None:
    settings = Settings()

    assert settings.cors_origins == [
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ]
    assert settings.web_app_url == "http://127.0.0.1:5175/"


def test_cors_origins_ignore_blank_entries() -> None:
    settings = Settings(
        api_cors_origins=" http://localhost:5175, ,http://127.0.0.1:5175, "
    )

    assert settings.cors_origins == [
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ]


def test_database_url_preserves_explicit_sqlalchemy_driver() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://user:pass@localhost:5432/vocalendar"
    )

    assert (
        settings.sqlalchemy_database_url
        == "postgresql+psycopg://user:pass@localhost:5432/vocalendar"
    )


def test_database_url_converts_postgresql_scheme_to_psycopg_driver() -> None:
    settings = Settings(database_url="postgresql://user:pass@localhost:5432/vocalendar")

    assert (
        settings.sqlalchemy_database_url
        == "postgresql+psycopg://user:pass@localhost:5432/vocalendar"
    )


def test_database_url_converts_render_postgres_scheme_to_psycopg_driver() -> None:
    settings = Settings(database_url="postgres://user:pass@host:5432/vocalendar")

    assert settings.sqlalchemy_database_url == (
        "postgresql+psycopg://user:pass@host:5432/vocalendar"
    )


def test_sqlite_database_url_resolves_relative_paths_from_repo_root() -> None:
    settings = Settings(database_url="sqlite:///apps/api/local-dev.db")

    assert settings.sqlalchemy_database_url.endswith("/apps/api/local-dev.db")
    assert settings.sqlalchemy_database_url.startswith("sqlite:///")


def test_sqlite_database_url_preserves_in_memory_database() -> None:
    settings = Settings(database_url="sqlite+pysqlite://")

    assert settings.sqlalchemy_database_url == "sqlite+pysqlite://"


def test_sqlite_database_url_preserves_named_in_memory_database() -> None:
    settings = Settings(database_url="sqlite:///:memory:")

    assert settings.sqlalchemy_database_url == "sqlite:///:memory:"
