"""Модуль 2. Журнал отметок и Календарь (Check-in Module)."""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Tuple

DONE = "done"
SKIPPED = "skipped"
STATUSES = (DONE, SKIPPED)


@dataclass
class CheckInEntry:
    habit_id: str
    day: date
    status: str  # DONE | SKIPPED
    note: str = ""

    def __post_init__(self) -> None:
        if self.status not in STATUSES:
            raise ValueError(f"Статус должен быть одним из {STATUSES}")
        if len(self.note) > 200:
            raise ValueError("Заметка должна быть короткой (до 200 символов)")

    def to_dict(self) -> dict:
        return {"habit_id": self.habit_id, "day": self.day.isoformat(),
                "status": self.status, "note": self.note}

    @classmethod
    def from_dict(cls, d: dict) -> "CheckInEntry":
        return cls(d["habit_id"], date.fromisoformat(d["day"]), d["status"], d.get("note", ""))


class HabitLog:
    """Журнал отметок: одна запись на (привычка, день). Повторная отметка перезаписывает."""

    def __init__(self, entries: Optional[List[CheckInEntry]] = None) -> None:
        self._entries: Dict[Tuple[str, date], CheckInEntry] = {
            (e.habit_id, e.day): e for e in (entries or [])
        }

    def mark(self, habit_id: str, day: date, status: str, note: str = "") -> CheckInEntry:
        entry = CheckInEntry(habit_id, day, status, note.strip())
        self._entries[(habit_id, day)] = entry
        return entry

    def mark_done(self, habit_id: str, day: Optional[date] = None, note: str = "") -> CheckInEntry:
        return self.mark(habit_id, day or date.today(), DONE, note)

    def mark_skipped(self, habit_id: str, day: Optional[date] = None, note: str = "") -> CheckInEntry:
        return self.mark(habit_id, day or date.today(), SKIPPED, note)

    def unmark(self, habit_id: str, day: date) -> None:
        self._entries.pop((habit_id, day), None)

    def get(self, habit_id: str, day: date) -> Optional[CheckInEntry]:
        return self._entries.get((habit_id, day))

    def status(self, habit_id: str, day: date) -> Optional[str]:
        e = self.get(habit_id, day)
        return e.status if e else None

    def is_done(self, habit_id: str, day: date) -> bool:
        return self.status(habit_id, day) == DONE

    def entries_for(self, habit_id: str) -> List[CheckInEntry]:
        return sorted((e for (h, _), e in self._entries.items() if h == habit_id), key=lambda e: e.day)

    def delete_habit(self, habit_id: str) -> None:
        for key in [k for k in self._entries if k[0] == habit_id]:
            del self._entries[key]

    def all(self) -> List[CheckInEntry]:
        return sorted(self._entries.values(), key=lambda e: (e.day, e.habit_id))

    def month_calendar(self, habit, year: int, month: int, today: Optional[date] = None) -> str:
        """Текстовый календарь месяца: ✓ выполнено, ✗ пропущено/не отмечено, · не по графику."""
        today = today or date.today()
        lines = [f"{calendar.month_name[month]} {year}", "Пн Вт Ср Чт Пт Сб Вс"]
        for week in calendar.Calendar(firstweekday=0).monthdayscalendar(year, month):
            cells = []
            for d in week:
                if d == 0:
                    cells.append("  ")
                    continue
                day = date(year, month, d)
                st = self.status(habit.id, day)
                if st == DONE:
                    cells.append(" ✓")
                elif st == SKIPPED:
                    cells.append(" ✗")
                elif not habit.is_scheduled(day):
                    cells.append(" ·")
                elif day < today:
                    cells.append(" ✗")  # прошло, не отмечено
                else:
                    cells.append(" ?")  # впереди / сегодня ещё не отмечено
            lines.append(" ".join(cells))
        return "\n".join(lines)
