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


def test_parse_add_command_without_datetime() -> None:
    result = parse_assistant_command("新增提醒 提交周报")

    assert result.action == "add_event"
    assert result.confidence == 0.85
    assert result.parameters == {"title": "提交周报"}


def test_parse_non_add_command_stays_unknown() -> None:
    result = parse_assistant_command("播放音乐")

    assert result.action == "unknown"
    assert result.parameters == {}
