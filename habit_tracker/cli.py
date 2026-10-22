"""Консольный интерфейс трекера привычек.

Примеры:
  python -m habit_tracker add "Зарядка" -w пн,ср,пт -t 07:30 -d "15 минут"
  python -m habit_tracker today
  python -m habit_tracker done 1 -n "Пробежка 3 км"
  python -m habit_tracker stats
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, time
from typing import List, Optional

from .checkins import DONE, SKIPPED
from .habits import WEEKDAY_NAMES, Habit
from .stats import HabitStatistics
from .storage import HabitStorage, ReminderConfig


def parse_weekdays(text: str) -> List[int]:
    text = text.strip().lower()
    if text in ("", "все", "ежедневно", "daily", "all"):
        return list(range(7))
    result = []
    for part in text.split(","):
        part = part.strip()
        if part in WEEKDAY_NAMES:
            result.append(WEEKDAY_NAMES.index(part))
        elif part.isdigit() and 1 <= int(part) <= 7:
            result.append(int(part) - 1)
        else:
            raise argparse.ArgumentTypeError(
                f"Неизвестный день '{part}'. Используйте: {', '.join(WEEKDAY_NAMES)} или 1-7")
    return result


def parse_time(text: str) -> time:
    try:
        return time.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError("Время в формате ЧЧ:ММ, например 07:30") from None


def parse_date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError("Дата в формате ГГГГ-ММ-ДД") from None


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="habit_tracker", description="Трекер полезных привычек")
    p.add_argument("--file", default="habits.json", help="файл данных (по умолчанию habits.json)")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add", help="создать привычку")
    a.add_argument("name")
    a.add_argument("-d", "--description", default="")
    a.add_argument("-w", "--weekdays", type=parse_weekdays, default=list(range(7)),
                   help="ежедневно или список: пн,ср,пт (по умолчанию ежедневно)")
    a.add_argument("-t", "--time", type=parse_time, default=None, help="желаемое время, ЧЧ:ММ")

    l = sub.add_parser("list", help="список привычек")
    l.add_argument("-a", "--all", action="store_true", help="включая архивные")

    for name, hlp in (("archive", "архивировать привычку"), ("unarchive", "вернуть из архива"),
                      ("delete", "удалить привычку вместе с историей")):
        s = sub.add_parser(name, help=hlp)
        s.add_argument("habit", help="номер из списка или id")

    for name, hlp in (("done", "отметить выполненной"), ("skip", "отметить пропущенной")):
        s = sub.add_parser(name, help=hlp)
        s.add_argument("habit", help="номер из списка или id")
        s.add_argument("-n", "--note", default="", help="короткая заметка")
        s.add_argument("--date", type=parse_date, default=None, help="дата, по умолчанию сегодня")

    u = sub.add_parser("undo", help="снять отметку")
    u.add_argument("habit")
    u.add_argument("--date", type=parse_date, default=None)

    sub.add_parser("today", help="напоминания и статус на сегодня")

    c = sub.add_parser("calendar", help="календарь месяца по привычке")
    c.add_argument("habit")
    c.add_argument("--month", help="ГГГГ-ММ, по умолчанию текущий")

    sub.add_parser("stats", help="стрики и процент успешности за месяц")
    return p


def _resolve(service, ref: str) -> Habit:
    habits = service.list(include_archived=True)
    if ref.isdigit() and 1 <= int(ref) <= len(habits):
        return habits[int(ref) - 1]
    return service.get(ref)


def _make_console_safe() -> None:
    """Не падать на Windows-консоли, которая не умеет печатать эмодзи."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(errors="replace")
        except (ValueError, OSError):
            pass


def main(argv: Optional[List[str]] = None, today: Optional[date] = None) -> int:
    _make_console_safe()
    args = build_parser().parse_args(argv)
    today = today or date.today()
    storage = HabitStorage(args.file)
    try:
        service, log = storage.load()
    except ValueError as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 1

    try:
        changed = _run(args, service, log, today)
    except (KeyError, ValueError) as exc:
        print(f"Ошибка: {exc.args[0] if exc.args else exc}", file=sys.stderr)
        return 1
    if changed:
        storage.save(service, log)
    return 0


def _run(args, service, log, today: date) -> bool:
    stats = HabitStatistics(log)
    cmd = args.cmd

    if cmd == "add":
        h = service.create(args.name, args.description, args.weekdays, args.time, today)
        print(f"Создана привычка «{h.name}» ({h.schedule_text()}), id {h.id}")
        return True

    if cmd == "list":
        habits = service.list(include_archived=args.all)
        if not habits:
            print("Привычек пока нет. Добавьте: add \"Название\"")
        for i, h in enumerate(service.list(include_archived=True), 1):
            if h.archived and not args.all:
                continue
            t = h.reminder_time.strftime("%H:%M") if h.reminder_time else "—"
            tag = " [архив]" if h.archived else ""
            print(f"{i}. {h.name}{tag} | {h.schedule_text()} | {t} | {h.description}")
        return False

    if cmd in ("archive", "unarchive", "delete"):
        h = _resolve(service, args.habit)
        if cmd == "archive":
            service.archive(h.id)
            print(f"«{h.name}» в архиве")
        elif cmd == "unarchive":
            service.unarchive(h.id)
            print(f"«{h.name}» возвращена из архива")
        else:
            service.delete(h.id)
            log.delete_habit(h.id)
            print(f"«{h.name}» удалена")
        return True

    if cmd in ("done", "skip"):
        h = _resolve(service, args.habit)
        day = args.date or today
        if day > today:
            raise ValueError("Нельзя отмечать будущие дни")
        if cmd == "done":
            log.mark_done(h.id, day, args.note)
        else:
            log.mark_skipped(h.id, day, args.note)
        extra = ""
        if cmd == "done":
            s = stats.streaks.current_streak(h, today)
            extra = f" Текущий стрик: {s} {stats.badge(s)}".rstrip()
        print(f"{day}: «{h.name}» — {'выполнено' if cmd == 'done' else 'пропущено'}.{extra}")
        return True

    if cmd == "undo":
        h = _resolve(service, args.habit)
        log.unmark(h.id, args.date or today)
        print("Отметка снята")
        return True

    if cmd == "today":
        reminders = ReminderConfig.for_today(service, log, today)
        print(f"Сегодня, {today} ({WEEKDAY_NAMES[today.weekday()]})")
        if reminders:
            print("Нужно сделать:")
            for r in reminders:
                print("  •", r.text())
        else:
            print("Всё по графику выполнено или на сегодня ничего не запланировано 🎉")
        return False

    if cmd == "calendar":
        h = _resolve(service, args.habit)
        y, m = (int(x) for x in args.month.split("-")) if args.month else (today.year, today.month)
        print(log.month_calendar(h, y, m, today))
        print("✓ выполнено  ✗ пропущено  ? ещё впереди  · не по графику")
        return False

    if cmd == "stats":
        habits = service.list()
        if not habits:
            print("Нет активных привычек")
        for h in habits:
            s = stats.summary(h, today)
            print(f"{h.name}: стрик {s['current_streak']} {stats.badge(s['current_streak'])} | "
                  f"рекорд {s['best_streak']} | месяц {s['month_rate']}% | всего выполнено {s['total_done']}")
        return False

    return False
