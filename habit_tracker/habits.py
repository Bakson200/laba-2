"""Модуль 1. Менеджер привычек (Habit Manager Module)."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, time
from typing import Dict, List, Optional

WEEKDAY_NAMES = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]


@dataclass
class Habit:
    """Привычка.

    weekdays — дни недели, в которые привычку нужно выполнять
    (0 = понедельник ... 6 = воскресенье). Для «ежедневно» — все 7 дней.
    """

    name: str
    description: str = ""
    weekdays: List[int] = field(default_factory=lambda: list(range(7)))
    reminder_time: Optional[time] = None  # желаемое время выполнения
    created: date = field(default_factory=date.today)
    archived: bool = False
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("Название привычки не может быть пустым")
        self.weekdays = sorted(set(self.weekdays))
        if not self.weekdays or any(d not in range(7) for d in self.weekdays):
            raise ValueError("Дни недели должны быть числами 0..6 (пн..вс)")

    @property
    def is_daily(self) -> bool:
        return len(self.weekdays) == 7

    def is_scheduled(self, day: date) -> bool:
        """Нужно ли выполнять привычку в этот день."""
        return day >= self.created and day.weekday() in self.weekdays

    def schedule_text(self) -> str:
        if self.is_daily:
            return "ежедневно"
        return ", ".join(WEEKDAY_NAMES[d] for d in self.weekdays)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "weekdays": self.weekdays,
            "reminder_time": self.reminder_time.strftime("%H:%M") if self.reminder_time else None,
            "created": self.created.isoformat(),
            "archived": self.archived,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Habit":
        rt = d.get("reminder_time")
        return cls(
            id=d["id"],
            name=d["name"],
            description=d.get("description", ""),
            weekdays=d.get("weekdays", list(range(7))),
            reminder_time=time.fromisoformat(rt) if rt else None,
            created=date.fromisoformat(d["created"]),
            archived=d.get("archived", False),
        )


class HabitService:
    """Создание, поиск, архивирование и удаление привычек."""

    def __init__(self, habits: Optional[List[Habit]] = None) -> None:
        self._habits: Dict[str, Habit] = {h.id: h for h in (habits or [])}

    def create(
        self,
        name: str,
        description: str = "",
        weekdays: Optional[List[int]] = None,
        reminder_time: Optional[time] = None,
        created: Optional[date] = None,
    ) -> Habit:
        habit = Habit(
            name=name.strip(),
            description=description.strip(),
            weekdays=weekdays if weekdays is not None else list(range(7)),
            reminder_time=reminder_time,
            created=created or date.today(),
        )
        self._habits[habit.id] = habit
        return habit

    def get(self, habit_id: str) -> Habit:
        try:
            return self._habits[habit_id]
        except KeyError:
            raise KeyError(f"Привычка с id '{habit_id}' не найдена") from None

    def list(self, include_archived: bool = False) -> List[Habit]:
        items = list(self._habits.values())
        if not include_archived:
            items = [h for h in items if not h.archived]
        return sorted(items, key=lambda h: (h.reminder_time is None, h.reminder_time, h.name.lower()))

    def archive(self, habit_id: str) -> Habit:
        habit = self.get(habit_id)
        habit.archived = True
        return habit

    def unarchive(self, habit_id: str) -> Habit:
        habit = self.get(habit_id)
        habit.archived = False
        return habit

    def delete(self, habit_id: str) -> None:
        self.get(habit_id)
        del self._habits[habit_id]

    def all(self) -> List[Habit]:
        return list(self._habits.values())
