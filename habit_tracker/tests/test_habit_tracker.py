import os
import sys
import tempfile
import unittest
from datetime import date, time, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from habit_tracker import (HabitLog, HabitService, HabitStatistics, HabitStorage,
                           ReminderConfig, StreakCalculator)
from habit_tracker.cli import main

D = date(2026, 10, 14)  # среда


class HabitServiceTests(unittest.TestCase):
    def test_create_archive_delete(self):
        s = HabitService()
        h = s.create("Вода", weekdays=[0, 2, 4], reminder_time=time(9, 0), created=D)
        self.assertEqual(h.schedule_text(), "пн, ср, пт")
        s.archive(h.id)
        self.assertEqual(s.list(), [])
        self.assertEqual(len(s.list(include_archived=True)), 1)
        s.delete(h.id)
        with self.assertRaises(KeyError):
            s.get(h.id)

    def test_validation(self):
        s = HabitService()
        with self.assertRaises(ValueError):
            s.create("  ")
        with self.assertRaises(ValueError):
            s.create("X", weekdays=[7])


class LogTests(unittest.TestCase):
    def test_overwrite_and_note(self):
        log = HabitLog()
        log.mark_skipped("a", D)
        log.mark_done("a", D, "ок")
        self.assertTrue(log.is_done("a", D))
        self.assertEqual(log.get("a", D).note, "ок")
        self.assertEqual(len(log.all()), 1)

    def test_long_note_rejected(self):
        with self.assertRaises(ValueError):
            HabitLog().mark_done("a", D, "x" * 201)


class StreakTests(unittest.TestCase):
    def setUp(self):
        self.s = HabitService()
        self.log = HabitLog()
        self.calc = StreakCalculator(self.log)
        self.stats = HabitStatistics(self.log)

    def test_daily_current_and_best(self):
        h = self.s.create("Чтение", created=D - timedelta(days=9))
        # 4 дня подряд, пропуск, потом 2 дня подряд (вчера и позавчера)
        for i in (9, 8, 7, 6):
            self.log.mark_done(h.id, D - timedelta(days=i))
        for i in (2, 1):
            self.log.mark_done(h.id, D - timedelta(days=i))
        self.assertEqual(self.calc.best_streak(h, D), 4)
        # сегодня не отмечено — серия не рвётся
        self.assertEqual(self.calc.current_streak(h, D), 2)
        self.log.mark_done(h.id, D)
        self.assertEqual(self.calc.current_streak(h, D), 3)

    def test_skip_today_breaks(self):
        h = self.s.create("Чтение", created=D - timedelta(days=3))
        self.log.mark_done(h.id, D - timedelta(days=1))
        self.log.mark_skipped(h.id, D)
        self.assertEqual(self.calc.current_streak(h, D), 0)

    def test_weekday_schedule_ignores_off_days(self):
        # пн, ср, пт; сегодня среда 2026-10-14
        h = self.s.create("Зал", weekdays=[0, 2, 4], created=date(2026, 10, 5))
        for d in (date(2026, 10, 5), date(2026, 10, 7), date(2026, 10, 9),
                  date(2026, 10, 12), date(2026, 10, 14)):
            self.log.mark_done(h.id, d)
        self.assertEqual(self.calc.current_streak(h, D), 5)
        self.assertEqual(self.calc.best_streak(h, D), 5)

    def test_month_rate(self):
        h = self.s.create("Бег", created=date(2026, 10, 1))
        for d in range(1, 8):  # 7 из 14 дней (1..14, сегодня тоже не отмечено → 13 в знаменателе)
            self.log.mark_done(h.id, date(2026, 10, d))
        self.assertEqual(self.stats.month_success_rate(h, 2026, 10, D), round(100 * 7 / 13, 1))
        self.log.mark_done(h.id, D)
        self.assertEqual(self.stats.month_success_rate(h, 2026, 10, D), round(100 * 8 / 14, 1))

    def test_empty(self):
        h = self.s.create("Новая", created=D)
        self.assertEqual(self.calc.current_streak(h, D), 0)
        self.assertEqual(self.stats.month_success_rate(h, 2026, 10, D), 0.0)


class ReminderStorageTests(unittest.TestCase):
    def test_reminders_today(self):
        s, log = HabitService(), HabitLog()
        a = s.create("Поздно", reminder_time=time(21, 0), created=D)
        b = s.create("Рано", reminder_time=time(7, 0), created=D)
        c = s.create("Без времени", created=D)
        d = s.create("Только пн", weekdays=[0], created=D)  # сегодня среда
        e = s.create("Уже сделано", created=D)
        f = s.create("Архив", created=D)
        s.archive(f.id)
        log.mark_done(e.id, D)
        names = [r.habit.name for r in ReminderConfig.for_today(s, log, D)]
        self.assertEqual(names, ["Рано", "Поздно", "Без времени"])

    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "h.json")
            s, log = HabitService(), HabitLog()
            h = s.create("Йога", "утро", [1, 3], time(6, 30), D)
            log.mark_done(h.id, D, "хорошо")
            HabitStorage(path).save(s, log)
            s2, log2 = HabitStorage(path).load()
            h2 = s2.get(h.id)
            self.assertEqual((h2.name, h2.weekdays, h2.reminder_time), ("Йога", [1, 3], time(6, 30)))
            self.assertEqual(log2.get(h.id, D).note, "хорошо")

    def test_missing_and_corrupt_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "h.json")
            s, log = HabitStorage(path).load()
            self.assertEqual(s.all(), [])
            with open(path, "w") as f:
                f.write("{oops")
            with self.assertRaises(ValueError):
                HabitStorage(path).load()


class CliTests(unittest.TestCase):
    def test_flow(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = os.path.join(tmp, "h.json")
            run = lambda *a: main(["--file", f, *a], today=D)
            self.assertEqual(run("add", "Зарядка", "-w", "пн,ср", "-t", "07:30"), 0)
            self.assertEqual(run("done", "1", "-n", "ok"), 0)
            self.assertEqual(run("today"), 0)
            self.assertEqual(run("stats"), 0)
            self.assertEqual(run("calendar", "1"), 0)
            self.assertEqual(run("done", "1", "--date", "2026-12-01"), 1)  # будущее
            self.assertEqual(run("archive", "1"), 0)
            self.assertEqual(run("delete", "1"), 0)
            self.assertEqual(run("done", "5"), 1)  # нет такой


if __name__ == "__main__":
    unittest.main()
