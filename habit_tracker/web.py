"""Веб-интерфейс трекера привычек (Flask). Запуск: python -m habit_tracker.web"""
from __future__ import annotations

import calendar
import os
from datetime import date, time, timedelta
from typing import Callable, Optional

from flask import Flask, abort, flash, redirect, render_template, request, url_for

from .checkins import DONE, SKIPPED
from .habits import WEEKDAY_NAMES
from .stats import HabitStatistics
from .storage import HabitStorage, ReminderConfig

MONTHS = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль",
          "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]


def create_app(data_file: str = "habits.json",
               today_fn: Callable[[], date] = date.today) -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ.get("SECRET_KEY", "dev-only-habit-tracker")
    storage = HabitStorage(data_file)

    def load():
        service, log = storage.load()
        return service, log, HabitStatistics(log)

    def month_grid(habit, log, year: int, month: int, today: date):
        weeks = []
        for week in calendar.Calendar(0).monthdayscalendar(year, month):
            row = []
            for d in week:
                if d == 0:
                    row.append(None)
                    continue
                day = date(year, month, d)
                st = log.status(habit.id, day)
                if st == DONE:
                    cls = "done"
                elif st == SKIPPED:
                    cls = "skipped"
                elif not habit.is_scheduled(day):
                    cls = "off"
                elif day < today:
                    cls = "missed"
                else:
                    cls = "future"
                entry = log.get(habit.id, day)
                row.append({"n": d, "cls": cls, "today": day == today,
                            "note": entry.note if entry else ""})
            weeks.append(row)
        return weeks

    @app.get("/")
    def index():
        service, log, stats = load()
        today = today_fn()
        cards = []
        for h in service.list():
            s = stats.summary(h, today)
            last7 = []
            for i in range(6, -1, -1):
                d = today - timedelta(days=i)
                st = log.status(h.id, d)
                cls = ("done" if st == DONE else "skipped" if st == SKIPPED
                       else "off" if not h.is_scheduled(d)
                       else "missed" if d < today else "future")
                last7.append({"label": WEEKDAY_NAMES[d.weekday()], "cls": cls})
            cards.append({
                "habit": h, "stats": s, "badge": stats.badge(s["current_streak"]),
                "scheduled_today": h.is_scheduled(today),
                "entry": log.get(h.id, today), "last7": last7,
            })
        reminders = ReminderConfig.for_today(service, log, today)
        archived = [h for h in service.list(include_archived=True) if h.archived]
        return render_template("index.html", cards=cards, reminders=reminders, archived=archived,
                               today=today, weekday_names=WEEKDAY_NAMES,
                               wd=WEEKDAY_NAMES[today.weekday()])

    @app.post("/habits")
    def create():
        service, log, _ = load()
        name = request.form.get("name", "").strip()
        weekdays = [int(x) for x in request.form.getlist("weekdays") if x.isdigit()]
        t = request.form.get("time", "").strip()
        try:
            service.create(name, request.form.get("description", ""),
                           weekdays or list(range(7)),
                           time.fromisoformat(t) if t else None, today_fn())
            storage.save(service, log)
            flash(f"Привычка «{name}» добавлена", "ok")
        except ValueError as exc:
            flash(str(exc), "err")
        return redirect(url_for("index"))

    @app.post("/habits/<habit_id>/mark")
    def mark(habit_id):
        service, log, _ = load()
        status = request.form.get("status")
        try:
            h = service.get(habit_id)
            day = date.fromisoformat(request.form.get("day") or today_fn().isoformat())
            if day > today_fn():
                raise ValueError("Нельзя отмечать будущие дни")
            if status == "undo":
                log.unmark(h.id, day)
            else:
                log.mark(h.id, day, status, request.form.get("note", ""))
            storage.save(service, log)
        except KeyError:
            abort(404)
        except ValueError as exc:
            flash(str(exc), "err")
        return redirect(request.form.get("next") or url_for("index"))

    @app.post("/habits/<habit_id>/<action>")
    def manage(habit_id, action):
        service, log, _ = load()
        try:
            if action == "archive":
                service.archive(habit_id)
            elif action == "unarchive":
                service.unarchive(habit_id)
            elif action == "delete":
                service.delete(habit_id)
                log.delete_habit(habit_id)
            else:
                abort(404)
        except KeyError:
            abort(404)
        storage.save(service, log)
        return redirect(url_for("index"))

    @app.get("/habits/<habit_id>")
    def detail(habit_id):
        service, log, stats = load()
        today = today_fn()
        try:
            h = service.get(habit_id)
        except KeyError:
            abort(404)
        try:
            y, m = (int(x) for x in request.args.get("month", f"{today.year}-{today.month}").split("-"))
            first = date(y, m, 1)
        except ValueError:
            abort(400)
        prev = (first - timedelta(days=1)).replace(day=1)
        nxt = (first + timedelta(days=32)).replace(day=1)
        return render_template(
            "habit.html", habit=h, stats=stats.summary(h, today),
            rate=stats.month_success_rate(h, y, m, today), weeks=month_grid(h, log, y, m, today),
            title=f"{MONTHS[m]} {y}", prev=f"{prev.year}-{prev.month}", nxt=f"{nxt.year}-{nxt.month}",
            today=today, entries=list(reversed([e for e in log.entries_for(h.id) if e.note]))[:10])

    return app


def main() -> None:
    path = os.environ.get("HABITS_FILE", "habits.json")
    create_app(path).run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=False)


if __name__ == "__main__":
    main()
