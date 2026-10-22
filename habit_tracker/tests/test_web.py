import os
import sys
import tempfile
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from habit_tracker.web import create_app

D = date(2026, 10, 14)


class WebTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(os.path.join(self.tmp.name, "h.json"), lambda: D)
        self.c = self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def _hid(self):
        from habit_tracker import HabitStorage
        s, _ = HabitStorage(os.path.join(self.tmp.name, "h.json")).load()
        return s.all()[0].id

    def test_full_flow(self):
        self.assertIn("Привычек пока нет", self.c.get("/").get_data(as_text=True))
        r = self.c.post("/habits", data={"name": "Зарядка", "time": "07:30", "weekdays": ["0", "2"]},
                        follow_redirects=True)
        html = r.get_data(as_text=True)
        self.assertIn("Зарядка", html)
        self.assertIn("пн, ср", html)
        hid = self._hid()
        r = self.c.post(f"/habits/{hid}/mark", data={"status": "done", "note": "ок"}, follow_redirects=True)
        self.assertIn("1", r.get_data(as_text=True))
        d = self.c.get(f"/habits/{hid}").get_data(as_text=True)
        self.assertIn("Октябрь 2026", d)
        self.assertIn("ок", d)
        self.assertEqual(self.c.get(f"/habits/{hid}?month=2026-11").status_code, 200)
        self.assertEqual(self.c.get(f"/habits/{hid}?month=bad").status_code, 400)
        self.c.post(f"/habits/{hid}/archive")
        self.assertIn("Архив", self.c.get("/").get_data(as_text=True))
        self.c.post(f"/habits/{hid}/delete")
        self.assertIn("Привычек пока нет", self.c.get("/").get_data(as_text=True))

    def test_errors(self):
        r = self.c.post("/habits", data={"name": "  "}, follow_redirects=True)
        self.assertIn("не может быть пустым", r.get_data(as_text=True))
        self.assertEqual(self.c.get("/habits/nope").status_code, 404)
        self.assertEqual(self.c.post("/habits/nope/archive").status_code, 404)
        self.c.post("/habits", data={"name": "X"})
        hid = self._hid()
        r = self.c.post(f"/habits/{hid}/mark", data={"status": "done", "day": "2026-12-01"},
                        follow_redirects=True)
        self.assertIn("будущие", r.get_data(as_text=True))
        r = self.c.post(f"/habits/{hid}/mark", data={"status": "bogus"}, follow_redirects=True)
        self.assertIn("Статус", r.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
