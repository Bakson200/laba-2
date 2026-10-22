"""Модуль 4. Напоминания и Хранение (Notification & Storage Module)."""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from datetime import date, time
from typing import List, Optional, Tuple

from .checkins import CheckInEntry, HabitLog
from .habits import Habit, HabitService

SCHEMA_VERSION = 1


@dataclass
class ReminderConfig:
    """Напоминание на сегодня для одной привычки."""

    habit: Habit
    at: Optional[time]

    def text(self) -> str:
        when = self.at.strftime("%H:%M") if self.at else "в любое время"
        return f"[{when}] {self.habit.name}"

    @staticmethod
    def for_today(service: HabitService, log: HabitLog,
                  today: Optional[date] = None) -> List["ReminderConfig"]:
        """Активные напоминания: привычка не в архиве, сегодня по графику, ещё не отмечена.
        Отсортированы по времени; без времени — в конце."""
        today = today or date.today()
        result = [
            ReminderConfig(h, h.reminder_time)
            for h in service.list()
            if h.is_scheduled(today) and log.status(h.id, today) is None
        ]
        return sorted(result, key=lambda r: (r.at is None, r.at or time.min, r.habit.name.lower()))


class HabitStorage:
    """Сохранение/загрузка привычек и всей истории отметок в JSON-файл."""

    def __init__(self, path: str = "habits.json") -> None:
        self.path = path

    def save(self, service: HabitService, log: HabitLog) -> None:
        data = {
            "version": SCHEMA_VERSION,
            "habits": [h.to_dict() for h in service.all()],
            "entries": [e.to_dict() for e in log.all()],
        }
        directory = os.path.dirname(os.path.abspath(self.path))
        # атомарная запись: пишем во временный файл, затем заменяем
        fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise

    def load(self) -> Tuple[HabitService, HabitLog]:
        if not os.path.exists(self.path):
            return HabitService(), HabitLog()
        with open(self.path, encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Файл данных повреждён: {self.path} ({exc})") from exc
        habits = [Habit.from_dict(d) for d in data.get("habits", [])]
        entries = [CheckInEntry.from_dict(d) for d in data.get("entries", [])]
        return HabitService(habits), HabitLog(entries)
