from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.settings import get_settings

metadata = MetaData()


class Base(DeclarativeBase):
    metadata = metadata


settings = get_settings()
database_url = settings.sqlalchemy_database_url
connect_args: dict[str, object] = {}
if database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    database_url,
    pool_pre_ping=not database_url.startswith("sqlite"),
    connect_args=connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
