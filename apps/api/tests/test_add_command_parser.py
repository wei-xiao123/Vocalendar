from datetime import datetime

from app.assistant import parse_assistant_command


def test_parse_add_command_with_datetime_and_title() -> None:
    result = parse_assistant_command("添加提醒 2026-06-01 09:30 产品评审")

    assert result.action == "add_event"
    assert result.confidence == 0.85
    assert result.text == "添加提醒 2026-06-01 09:30 产品评审"
    assert result.parameters == {
        "starts_at": "2026-06-01T09:30:00",
        "title": "产品评审",
    }


def test_parse_add_command_with_remind_me_prefix() -> None:
    result = parse_assistant_command("提醒我 2026-06-01T09:30:00 开会")

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-06-01T09:30:00",
        "title": "开会",
    }


def test_parse_add_command_with_relative_chinese_datetime() -> None:
    result = parse_assistant_command(
        "明天下午三点提醒我开会",
        now=datetime(2026, 5, 30, 10),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-05-31T15:00:00",
        "title": "开会",
    }


def test_parse_add_command_with_colloquial_add_phrase() -> None:
    result = parse_assistant_command(
        "帮我明天九点加个会",
        now=datetime(2026, 5, 30, 10),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-05-31T09:00:00",
        "title": "会",
    }


def test_parse_add_command_with_chinese_half_hour() -> None:
    result = parse_assistant_command(
        "后天晚上八点半提醒我客户电话",
        now=datetime(2026, 5, 30, 10),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-06-01T20:30:00",
        "title": "客户电话",
    }


def test_parse_add_command_with_next_week_weekday() -> None:
    result = parse_assistant_command(
        "下周三下午三点提醒我开会",
        now=datetime(2026, 5, 30, 10),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-06-03T15:00:00",
        "title": "开会",
    }


def test_parse_add_command_with_reminder_offset() -> None:
    result = parse_assistant_command(
        "明天下午三点提前十五分钟提醒我开会",
        now=datetime(2026, 5, 30, 10),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-05-31T15:00:00",
        "reminder_at": "2026-05-31T14:45:00",
        "title": "开会",
    }


def test_parse_add_command_with_hour_reminder_offset() -> None:
    result = parse_assistant_command(
        "明天九点提前一小时提醒我产品评审",
        now=datetime(2026, 5, 30, 10),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-05-31T09:00:00",
        "reminder_at": "2026-05-31T08:00:00",
        "title": "产品评审",
    }


def test_parse_add_command_with_today_time_without_date() -> None:
    result = parse_assistant_command(
        "我现在。有一个会议大概在四点钟要开你给我。加一个日志提醒。",
        now=datetime(2026, 5, 31, 13),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-05-31T16:00:00",
        "title": "会议",
    }


def test_parse_add_command_with_today_afternoon_time_without_date() -> None:
    result = parse_assistant_command(
        "下午四点加个会议提醒",
        now=datetime(2026, 5, 31, 13),
    )

    assert result.action == "add_event"
    assert result.parameters == {
        "starts_at": "2026-05-31T16:00:00",
        "title": "会议",
    }


def test_parse_add_command_without_datetime() -> None:
    result = parse_assistant_command("新增提醒 提交周报")

    assert result.action == "add_event"
    assert result.confidence == 0.85
    assert result.parameters == {"title": "提交周报"}


def test_parse_non_add_command_stays_unknown() -> None:
    result = parse_assistant_command("播放音乐")

    assert result.action == "unknown"
    assert result.parameters == {}
