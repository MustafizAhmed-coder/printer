import random
import unittest

from consolidator import JobQueue, consolidate, merge


def ids(timeline):
    return [j.job_id for j in timeline]


class TestConsolidator(unittest.TestCase):
    def test_problem_example(self):
        spec = {
            "A": [("A2", 2), ("A7", 7), ("A9", 9)],
            "B": [("B1", 1), ("B7", 7)],
            "C": [("C3", 3), ("C10", 10)],
        }
        timeline, report = consolidate(spec)
        self.assertEqual(ids(timeline), ["B1", "A2", "C3", "A7", "B7", "A9", "C10"])
        self.assertEqual(report.jobs_in, 7)
        self.assertEqual(report.jobs_out, 7)

    def test_ties_ordered_by_department_code(self):
        spec = {"C": [("C5", 5)], "A": [("A5", 5)], "B": [("B5", 5)]}
        timeline, _ = consolidate(spec)
        self.assertEqual(ids(timeline), ["A5", "B5", "C5"])

    def test_same_department_duplicate_times_keep_order(self):
        spec = {"B": [("B4a", 4), ("B4b", 4), ("B4c", 4)], "A": [("A4", 4)]}
        timeline, _ = consolidate(spec)
        self.assertEqual(ids(timeline), ["A4", "B4a", "B4b", "B4c"])

    def test_empty_queues(self):
        spec = {"A": [], "B": [("B1", 1)], "C": []}
        timeline, report = consolidate(spec)
        self.assertEqual(ids(timeline), ["B1"])
        self.assertEqual(report.nonempty, 1)

    def test_all_empty(self):
        timeline, report = consolidate({"A": [], "B": []})
        self.assertEqual(timeline, [])
        self.assertEqual(report.jobs_out, 0)

    def test_no_queues(self):
        timeline, report = merge([])
        self.assertEqual(timeline, [])
        self.assertEqual(report.queues, 0)

    def test_uneven_sizes(self):
        spec = {"A": [("A1", 1)], "B": [(f"B{t}", t) for t in range(1, 50)]}
        timeline, _ = consolidate(spec)
        self.assertEqual(len(timeline), 50)
        self.assertEqual([j.time for j in timeline], sorted(j.time for j in timeline))

    def test_trace_has_one_step_per_job(self):
        trace = []
        queues = [JobQueue("A", [("A1", 1), ("A3", 3)]), JobQueue("B", [("B2", 2)])]
        timeline, _ = merge(queues, trace)
        self.assertEqual([s["job"] for s in trace], ids(timeline))

    def test_many_queues_no_loss_no_duplicates(self):
        rng = random.Random(7)
        spec = {}
        total = 0
        for d in range(200):  # 200 departments
            times = sorted(rng.randint(1, 500) for _ in range(rng.randint(0, 1000)))
            spec[f"D{d:03d}"] = [(f"D{d:03d}-{i}", t) for i, t in enumerate(times)]
            total += len(times)
        self.assertGreater(total, 90_000)
        timeline, report = consolidate(spec)
        self.assertEqual(len(timeline), total)
        self.assertEqual(len(set(ids(timeline))), total)
        keys = [(j.time, j.dept) for j in timeline]
        self.assertEqual(keys, sorted(keys))

    def test_unsorted_input_rejected(self):
        with self.assertRaises(ValueError):
            JobQueue("A", [("A5", 5), ("A2", 2)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
