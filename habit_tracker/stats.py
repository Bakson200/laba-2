"""Модуль 3. Метрики и Стрики (Streak & Gamification Module).

Правила подсчёта (учитываются только дни по графику привычки):
  * день по графику считается успешным, если стоит отметка «выполнено»;
    «пропущено» и отсутствие отметки в прошлом — разрыв серии;
  * сегодняшний день, если он по графику и ещё не отмечен, серию не обрывает
    (у пользователя ещё есть время);
  * дни не по графику серию не прерывают и не увеличивают.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Dict, Optional

from .checkins import HabitLog
from .habits import Habit


class StreakCalculator:
    def __init__(self, log: HabitLog) -> None:
        self.log = log

    def current_streak(self, habit: Habit, today: Optional[date] = None) -> int:
        today = today or date.today()
        streak = 0
        day = today
        while day >= habit.created:
            if habit.is_scheduled(day):
                if self.log.is_done(habit.id, day):
                    streak += 1
                elif day == today and self.log.status(habit.id, day) is None:
                    pass  # сегодня ещё можно успеть
                else:
                    break
            day -= timedelta(days=1)
        return streak

    def best_streak(self, habit: Habit, today: Optional[date] = None) -> int:
        today = today or date.today()
        best = run = 0
        day = habit.created
        while day <= today:
            if habit.is_scheduled(day):
                if self.log.is_done(habit.id, day):
                    run += 1
                    best = max(best, run)
                elif day == today and self.log.status(habit.id, day) is None:
                    pass
                else:
                    run = 0
            day += timedelta(days=1)
        return best


class HabitStatistics:
    def __init__(self, log: HabitLog) -> None:
        self.log = log
        self.streaks = StreakCalculator(log)

    def month_success_rate(self, habit: Habit, year: int, month: int,
                           today: Optional[date] = None) -> float:
        """Процент выполненных дней среди дней по графику в месяце (0..100).

        Считаются только дни от создания привычки до сегодня включительно.
        Сегодняшний неотмеченный день в знаменатель не входит.
        """
        today = today or date.today()
        first = date(year, month, 1)
        last = date(year, month, calendar.monthrange(year, month)[1])
        start, end = max(first, habit.created), min(last, today)
        planned = done = 0
        day = start
        while day <= end:
            if habit.is_scheduled(day):
                if self.log.is_done(habit.id, day):
                    planned += 1
                    done += 1
                elif not (day == today and self.log.status(habit.id, day) is None):
                    planned += 1
            day += timedelta(days=1)
        return round(100.0 * done / planned, 1) if planned else 0.0

    def summary(self, habit: Habit, today: Optional[date] = None) -> Dict[str, object]:
        today = today or date.today()
        total_done = sum(1 for e in self.log.entries_for(habit.id) if e.status == "done")
        return {
            "current_streak": self.streaks.current_streak(habit, today),
            "best_streak": self.streaks.best_streak(habit, today),
            "month_rate": self.month_success_rate(habit, today.year, today.month, today),
            "total_done": total_done,
        }

    @staticmethod
    def badge(streak: int) -> str:
        """Простая геймификация: значок по длине серии."""
        if streak >= 100:
            return "🏆"
        if streak >= 30:
            return "💎"
        if streak >= 7:
            return "🔥"
        if streak >= 3:
            return "⭐"
        return ""
