import re
from datetime import datetime, timedelta

from pydantic import BaseModel, Field

ADD_COMMAND_PREFIXES = (
    "添加提醒",
    "新增提醒",
    "创建提醒",
    "提醒我",
    "帮我添加提醒",
)
ADD_COMMAND_KEYWORDS = ("添加", "新增", "创建", "提醒我", "加个", "加一个")
LIST_COMMAND_KEYWORDS = ("查看", "列出", "有哪些", "有什么", "查一下", "看看")
LIST_COMMAND_OBJECTS = ("提醒", "日程", "安排")
LIST_RANGE_KEYWORDS = {
    "今天": "today",
    "明天": "tomorrow",
    "后天": "day_after_tomorrow",
    "全部": "all",
}
RELATIVE_DATE_OFFSETS = {
    "今天": 0,
    "明天": 1,
    "后天": 2,
}
CHINESE_DIGITS = {
    "零": 0,
    "〇": 0,
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}
DELETE_COMMAND_PREFIXES = (
    "删除提醒",
    "删除日程",
    "取消提醒",
    "取消日程",
    "帮我删除提醒",
)
DATETIME_PATTERN = re.compile(
    r"(?P<datetime>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)"
)
RELATIVE_DATETIME_PATTERN = re.compile(
    r"(?P<date>今天|明天|后天)"
    r"(?:的)?"
    r"(?:(?P<period>凌晨|早上|上午|中午|下午|晚上|今晚)?"
    r"(?P<hour>\d{1,2}|[零〇一二两三四五六七八九十]{1,3})"
    r"(?:(?:点|时)(?P<minute>半|\d{1,2}分?|"
    r"[零〇一二两三四五六七八九十]{1,3}分?)?|[:：](?P<colon_minute>\d{1,2})))?"
)
TODAY_TIME_PATTERN = re.compile(
    r"(?:大概)?(?:在)?"
    r"(?P<period>凌晨|早上|上午|中午|下午|晚上|今晚)?"
    r"(?P<hour>\d{1,2}|[零〇一二两三四五六七八九十]{1,3})"
    r"(?:(?:点钟|点|时)(?P<minute>半|\d{1,2}分?|"
    r"[零〇一二两三四五六七八九十]{1,3}分?)?|[:：](?P<colon_minute>\d{1,2}))"
)
REMINDER_OFFSET_PATTERN = re.compile(
    r"提前(?P<amount>\d+|[零〇一二两三四五六七八九十]{1,3})"
    r"(?P<unit>分钟|分|小时|个小时)"
)
TITLE_EDGE_PATTERN = re.compile(r"^[\s，,：:的。\.]+|[\s，,：:的。\.]+$")


class AssistantCommandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class AssistantCommandResponse(BaseModel):
    action: str
    confidence: float = Field(ge=0, le=1)
    text: str
    parameters: dict[str, str] = Field(default_factory=dict)
    message: str | None = None
    event: "AssistantEventResult | None" = None
    events: list["AssistantEventResult"] | None = None


class AssistantEventResult(BaseModel):
    id: int
    title: str
    starts_at: datetime
    ends_at: datetime | None
    reminder_at: datetime | None
    status: str
    source_text: str | None


def parse_assistant_command(
    text: str,
    now: datetime | None = None,
) -> AssistantCommandResponse:
    normalized_text = text.strip()
    reference_time = now or datetime.now()
    add_payload = _extract_add_command_payload(normalized_text)
    if add_payload is not None:
        return _parse_add_command(normalized_text, add_payload, reference_time)

    list_command = _parse_list_command(normalized_text)
    if list_command is not None:
        return list_command

    delete_payload = _strip_delete_command_prefix(normalized_text)
    if delete_payload is not None:
        return _parse_delete_command(normalized_text, delete_payload)

    return AssistantCommandResponse(
        action="unknown",
        confidence=0,
        text=normalized_text,
    )


def _strip_add_command_prefix(text: str) -> str | None:
    for prefix in ADD_COMMAND_PREFIXES:
        if text.startswith(prefix):
            return text.removeprefix(prefix).strip(" ：:")
    return None


def _extract_add_command_payload(text: str) -> str | None:
    prefix_payload = _strip_add_command_prefix(text)
    if prefix_payload is not None:
        return prefix_payload

    if any(keyword in text for keyword in ADD_COMMAND_KEYWORDS):
        return text
    return None


def _parse_add_command(
    original_text: str,
    payload: str,
    now: datetime,
) -> AssistantCommandResponse:
    parameters: dict[str, str] = {}
    remaining_title = payload
    reminder_offset = _extract_reminder_offset(payload)
    if reminder_offset is not None:
        remaining_title = (
            payload[: reminder_offset.start]
            + payload[reminder_offset.end :]
        ).strip(" ，,：:")

    datetime_match = DATETIME_PATTERN.search(remaining_title)
    if datetime_match is not None:
        starts_at = _normalize_datetime(datetime_match.group("datetime"))
        if starts_at is not None:
            parameters["starts_at"] = starts_at
            remaining_title = (
                remaining_title[: datetime_match.start()]
                + remaining_title[datetime_match.end() :]
            ).strip(" ，,：:")
    else:
        relative_datetime_match = RELATIVE_DATETIME_PATTERN.search(remaining_title)
        if relative_datetime_match is not None:
            starts_at = _normalize_relative_datetime(relative_datetime_match, now)
            if starts_at is not None:
                parameters["starts_at"] = starts_at
                remaining_title = (
                    remaining_title[: relative_datetime_match.start()]
                    + remaining_title[relative_datetime_match.end() :]
                ).strip(" ，,：:")
        else:
            today_time_match = TODAY_TIME_PATTERN.search(remaining_title)
            if today_time_match is not None:
                starts_at = _normalize_today_time(today_time_match, now)
                if starts_at is not None:
                    parameters["starts_at"] = starts_at
                    remaining_title = (
                        remaining_title[: today_time_match.start()]
                        + remaining_title[today_time_match.end() :]
                    ).strip(" ，,：:")

    starts_at = _parse_datetime_parameter(parameters.get("starts_at"))
    if starts_at is not None and reminder_offset is not None:
        parameters["reminder_at"] = (
            starts_at - reminder_offset.duration
        ).isoformat()

    remaining_title = _clean_add_title(remaining_title)
    if remaining_title:
        parameters["title"] = remaining_title

    return AssistantCommandResponse(
        action="add_event",
        confidence=0.85 if parameters else 0.6,
        text=original_text,
        parameters=parameters,
    )


def _parse_list_command(text: str) -> AssistantCommandResponse | None:
    has_list_intent = any(keyword in text for keyword in LIST_COMMAND_KEYWORDS)
    has_list_object = any(keyword in text for keyword in LIST_COMMAND_OBJECTS)
    if not has_list_intent or not has_list_object:
        return None

    parameters = _extract_range_parameters(text)

    return AssistantCommandResponse(
        action="list_events",
        confidence=0.8,
        text=text,
        parameters=parameters,
    )


def _strip_delete_command_prefix(text: str) -> str | None:
    for prefix in DELETE_COMMAND_PREFIXES:
        if text.startswith(prefix):
            return text.removeprefix(prefix).strip(" ：:")
    for prefix in ("删除", "取消"):
        if text.startswith(prefix):
            return text.removeprefix(prefix).strip(" ：:")
    return None


def _parse_delete_command(original_text: str, payload: str) -> AssistantCommandResponse:
    parameters = _extract_range_parameters(payload)
    title = _clean_delete_title(payload)
    if title:
        parameters["title"] = title

    return AssistantCommandResponse(
        action="delete_event",
        confidence=0.85 if parameters else 0.6,
        text=original_text,
        parameters=parameters,
    )


def _normalize_datetime(value: str) -> str | None:
    parsed = _parse_datetime_parameter(value.replace(" ", "T"))
    if parsed is None:
        return None
    return parsed.isoformat()


def _parse_datetime_parameter(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _normalize_relative_datetime(
    match: re.Match[str],
    now: datetime,
) -> str | None:
    hour_text = match.group("hour")
    if hour_text is None:
        return None

    hour = _parse_zh_number(hour_text)
    if hour is None:
        return None

    minute = _parse_minute(match.group("minute"), match.group("colon_minute"))
    if minute is None:
        return None

    hour = _apply_period(hour, match.group("period"))
    if hour > 23 or minute > 59:
        return None

    target_date = now.date() + timedelta(
        days=RELATIVE_DATE_OFFSETS[match.group("date")]
    )
    return datetime.combine(target_date, datetime.min.time()).replace(
        hour=hour,
        minute=minute,
    ).isoformat()


def _normalize_today_time(
    match: re.Match[str],
    now: datetime,
) -> str | None:
    hour = _parse_zh_number(match.group("hour"))
    if hour is None:
        return None

    minute = _parse_minute(match.group("minute"), match.group("colon_minute"))
    if minute is None:
        return None

    hour = _apply_period(hour, match.group("period"))
    if hour > 23 or minute > 59:
        return None

    parsed = datetime.combine(now.date(), datetime.min.time()).replace(
        hour=hour,
        minute=minute,
    )
    if match.group("period") is None and parsed <= now and hour < 12:
        parsed = parsed.replace(hour=hour + 12)
    return parsed.isoformat()


def _parse_minute(minute_text: str | None, colon_minute_text: str | None) -> int | None:
    if colon_minute_text is not None:
        return int(colon_minute_text)
    if minute_text is None:
        return 0
    if minute_text == "半":
        return 30

    normalized_minute = minute_text.removesuffix("分")
    return _parse_zh_number(normalized_minute)


class ReminderOffset(BaseModel):
    start: int
    end: int
    duration: timedelta


def _extract_reminder_offset(value: str) -> ReminderOffset | None:
    match = REMINDER_OFFSET_PATTERN.search(value)
    if match is None:
        return None

    amount = _parse_zh_number(match.group("amount"))
    if amount is None:
        return None

    unit = match.group("unit")
    duration = timedelta(hours=amount) if "小时" in unit else timedelta(minutes=amount)
    reminder_word_match = re.match(r"(?:提醒我|提醒)", value[match.end() :])
    end = (
        match.end() + reminder_word_match.end()
        if reminder_word_match is not None
        else match.end()
    )
    return ReminderOffset(
        start=match.start(),
        end=end,
        duration=duration,
    )


def _apply_period(hour: int, period: str | None) -> int:
    if period in {"下午", "晚上", "今晚"} and hour < 12:
        return hour + 12
    if period == "中午" and hour < 11:
        return hour + 12
    return hour


def _parse_zh_number(value: str) -> int | None:
    if value.isdigit():
        return int(value)
    if value in CHINESE_DIGITS:
        return CHINESE_DIGITS[value]
    if "十" not in value:
        return None

    left, _, right = value.partition("十")
    tens = CHINESE_DIGITS.get(left, 1) if left else 1
    ones = CHINESE_DIGITS.get(right, 0) if right else 0
    return tens * 10 + ones


def _extract_range_parameters(text: str) -> dict[str, str]:
    parameters: dict[str, str] = {}
    for keyword, value in LIST_RANGE_KEYWORDS.items():
        if keyword in text:
            parameters["range"] = value
            break
    return parameters


def _clean_add_title(value: str) -> str:
    title = value
    for phrase in (
        "帮我添加提醒",
        "添加提醒",
        "新增提醒",
        "创建提醒",
        "日志提醒",
        "日程提醒",
        "我现在",
        "有一个",
        "有个",
        "要开",
        "你给我",
        "帮我",
        "提醒我",
        "提醒",
        "加一个",
        "加个",
        "添加",
        "新增",
        "创建",
    ):
        title = title.replace(phrase, " ")
    return _normalize_title_text(title)


def _clean_delete_title(value: str) -> str:
    title = _remove_relative_date_words(value)
    for phrase in ("帮我",):
        title = title.replace(phrase, " ")
    title = _normalize_title_text(title)
    for suffix in ("提醒", "日程"):
        title = _strip_title_edges(title.removesuffix(suffix))
    return title


def _remove_relative_date_words(value: str) -> str:
    title = value
    for keyword in RELATIVE_DATE_OFFSETS:
        title = title.replace(keyword, " ")
    return title


def _normalize_title_text(value: str) -> str:
    return _strip_title_edges(re.sub(r"\s+", " ", value))


def _strip_title_edges(value: str) -> str:
    return TITLE_EDGE_PATTERN.sub("", value)
