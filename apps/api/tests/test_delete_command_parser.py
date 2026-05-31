from datetime import datetime

from app.assistant import parse_assistant_command


def test_parse_delete_command_with_title() -> None:
    result = parse_assistant_command("删除提醒 产品评审")

    assert result.action == "delete_event"
    assert result.confidence == 0.85
    assert result.text == "删除提醒 产品评审"
    assert result.parameters == {"title": "产品评审"}


def test_parse_cancel_command_with_title() -> None:
    result = parse_assistant_command("取消日程 客户电话")

    assert result.action == "delete_event"
    assert result.parameters == {"title": "客户电话"}


def test_parse_delete_command_with_relative_date_words() -> None:
    result = parse_assistant_command("删除明天的产品评审提醒")

    assert result.action == "delete_event"
    assert result.parameters == {
        "range": "tomorrow",
        "title": "产品评审",
    }


def test_parse_delete_command_with_next_week_weekday() -> None:
    result = parse_assistant_command(
        "删除下周三的产品评审提醒",
        now=datetime(2026, 5, 30, 10),
    )

    assert result.action == "delete_event"
    assert result.parameters == {
        "target_date": "2026-06-03",
        "title": "产品评审",
    }


def test_parse_delete_command_without_title() -> None:
    result = parse_assistant_command("删除提醒")

    assert result.action == "delete_event"
    assert result.confidence == 0.6
    assert result.parameters == {}


def test_parse_non_delete_command_stays_unknown() -> None:
    result = parse_assistant_command("播放音乐")

    assert result.action == "unknown"
    assert result.parameters == {}
