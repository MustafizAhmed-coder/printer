"""Print Queue Consolidation: k-way merge of sorted department job queues.

Each department queue is a singly linked list of jobs, already sorted by time.
We merge them with a min-heap that holds only the HEAD of each queue, so the
work is O(N log k) instead of re-sorting all N jobs.

Tie rule: equal time -> lower department code first.
Within one department, original order is kept (only one head per queue is in
the heap at a time, so a queue can never overtake itself).
"""
import heapq
from dataclasses import dataclass


@dataclass
class Job:
    job_id: str
    time: int
    dept: str


class Node:
    __slots__ = ("job", "next")

    def __init__(self, job):
        self.job = job
        self.next = None


class JobQueue:
    """Linked list of jobs for one department, kept in time order."""

    def __init__(self, dept, jobs=()):
        self.dept = dept
        self.head = None
        self._tail = None
        self.size = 0
        for job_id, time in jobs:
            self.append(Job(job_id, time, dept))

    def append(self, job):
        if self._tail and job.time < self._tail.job.time:
            raise ValueError(f"{self.dept}: queue not sorted at {job.job_id}")
        node = Node(job)
        if self._tail is None:
            self.head = node
        else:
            self._tail.next = node
        self._tail = node
        self.size += 1

    def __iter__(self):
        node = self.head
        while node:
            yield node.job
            node = node.next


@dataclass
class MergeReport:
    queues: int
    nonempty: int
    jobs_in: int
    jobs_out: int
    heap_ops: int

    def text(self):
        return (f"queues={self.queues} (non-empty {self.nonempty}) | "
                f"jobs in={self.jobs_in} out={self.jobs_out} | "
                f"heap ops={self.heap_ops}")


def merge(queues, trace=None):
    """Merge JobQueues into one timeline. Returns (list[Job], MergeReport).

    If `trace` is a list, one event dict per step is appended to it.
    """
    heap = []          # entries: (time, dept, queue_index, node)
    heap_ops = 0
    jobs_in = 0
    for qi, q in enumerate(queues):
        jobs_in += q.size
        if q.head:
            heapq.heappush(heap, (q.head.job.time, q.dept, qi, q.head))
            heap_ops += 1

    timeline = []
    while heap:
        time, dept, qi, node = heapq.heappop(heap)
        heap_ops += 1
        timeline.append(node.job)
        if trace is not None:
            trace.append({"type": "pick", "job": node.job.job_id,
                          "time": time, "dept": dept, "queue": qi,
                          "heap": len(heap)})
        if node.next:
            nxt = node.next
            heapq.heappush(heap, (nxt.job.time, dept, qi, nxt))
            heap_ops += 1

    report = MergeReport(
        queues=len(queues),
        nonempty=sum(1 for q in queues if q.size),
        jobs_in=jobs_in,
        jobs_out=len(timeline),
        heap_ops=heap_ops,
    )
    return timeline, report


def consolidate(spec):
    """spec: {"A": [("A2", 2), ...], "B": [...]} -> (timeline, report)."""
    queues = [JobQueue(dept, jobs) for dept, jobs in sorted(spec.items())]
    return merge(queues)


def to_ui_payload(spec):
    """Used by the web app: returns plain data (JSON-friendly) for one run."""
    queues = [JobQueue(dept, jobs) for dept, jobs in sorted(spec.items())]
    trace = []
    timeline, report = merge(queues, trace)
    return {
        "inputs": {q.dept: [[j.job_id, j.time] for j in q] for q in queues},
        "timeline": [[j.job_id, j.time, j.dept] for j in timeline],
        "trace": trace,
        "report": report.text(),
        "jobs_in": report.jobs_in,
        "jobs_out": report.jobs_out,
        "heap_ops": report.heap_ops,
    }


if __name__ == "__main__":
    example = {
        "A": [("A2", 2), ("A7", 7), ("A9", 9)],
        "B": [("B1", 1), ("B7", 7)],
        "C": [("C3", 3), ("C10", 10)],
    }
    timeline, report = consolidate(example)
    print("Timeline:", " -> ".join(j.job_id for j in timeline))
    print("Report:  ", report.text())
    assert [j.job_id for j in timeline] == ["B1", "A2", "C3", "A7", "B7", "A9", "C10"]
    print("demo OK")
