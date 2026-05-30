from app.assistant import parse_assistant_command


def test_parse_list_command_for_today() -> None:
    result = parse_assistant_command("查看今天提醒")

    assert result.action == "list_events"
    assert result.confidence == 0.8
    assert result.text == "查看今天提醒"
    assert result.parameters == {"range": "today"}


def test_parse_list_command_for_tomorrow() -> None:
    result = parse_assistant_command("明天有哪些日程")

    assert result.action == "list_events"
    assert result.parameters == {"range": "tomorrow"}


def test_parse_list_command_without_range() -> None:
    result = parse_assistant_command("列出提醒")

    assert result.action == "list_events"
    assert result.parameters == {}


def test_parse_non_list_command_stays_unknown() -> None:
    result = parse_assistant_command("播放音乐")

    assert result.action == "unknown"
    assert result.parameters == {}
