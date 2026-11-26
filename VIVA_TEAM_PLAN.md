# Print Queue Consolidator — 4-Person Split and Viva Notes

Workload is split by difficulty: the **main** person owns the core algorithm, the
**less slow** person owns the rule and tests, and the two **slower** people get
well-bounded tasks that still need real understanding for the viva.

| Role | Who | Owns | Files |
|---|---|---|---|
| 1. Main (lead) | Person 1 | Linked queues + heap merge (the algorithm) | `python/consolidator.py` (`JobQueue`, `merge`) |
| 2. Less slow | Person 2 | Tie rule, merge report, unit tests | `python/test_consolidator.py`, `MergeReport` |
| 3. Slower | Person 3 | Input edge cases, presets, scaling table, README | `consolidate()`, `to_ui_payload()`, `README.md` |
| 4. Slower | Person 4 | React + GSAP visualiser, Source-code drawer, Pyodide bridge | `web/src/App.jsx`, `web/src/pyRunner.js` |

Everyone must be able to explain the whole flow, because each viva asks the whole group.

---

## 1. Main — core algorithm (Person 1)

**Build:** each department is a singly linked list (`Node` → `next`). `merge()` pushes only the
**head** of each queue into a min-heap as `(time, dept, queue_index, node)`. Pop the smallest, append it
to the timeline, and push that queue's next node.

**Viva questions**
- *Why a heap and not just sort everything?* Sorting all N jobs costs O(N log N). The heap holds only
  k heads, so each pick costs O(log k), and the total is O(N log k). With k much smaller than N, this is faster.
- *Why only one node per queue in the heap?* It keeps each queue in its own order. The next job from a
  queue only enters after the previous one has left, so a queue can never overtake itself.
- *What is the time complexity and space?* Time O(N log k). Extra space O(k) for the heap, plus O(N) for the output list.
- *Why is the linked list used, not an array?* Queues are consumed from the front and the data is naturally a chain.
  Popping the head is O(1) with a list, and no copying happens. (An array with an index works just as well here,
  so be ready to say so honestly.)
- *Does it lose or change a job?* No. The same `Job` object is appended. The identifier is never rewritten.

---

## 2. Less slow — tie rule, report and tests (Person 2)

**Tie rule:** equal time → lower department code first. Within one department, the original order is kept.

**Viva questions**
- *Show me the tie rule in code.* The heap key is `(time, dept, queue_index, node)`. Python compares tuples
  left to right, so time is compared first, then dept. `queue_index` is only a last-resort tiebreak in case two
  queues share a dept code. The `node` is never compared, because the first three fields are always unique.
- *Why does a same-dept, same-time pair keep its order?* Only one job per department is in the heap at a time, so
  the second job is pushed only after the first has been popped. Test: `test_same_department_duplicate_times_keep_order`.
- *What does the merge report show?* Queues received (k), non-empty queues, jobs in, jobs out, and heap operations.
  "Jobs in" must equal "jobs out", which is the check that no job was lost.

**Tests to run:** `cd python && python3 -m unittest -v` (10 tests: example, ties, duplicate times, empty queues,
all-empty, no queues, uneven sizes, trace length, 200 queues with about 100k jobs, and unsorted input rejected).

---

## 3. Slower — edge cases, scaling table and README (Person 3)

**Build:** the empty-queue, uneven-size and duplicate-time cases. Run a scaling table: fixed N, vary k
(2, 4, 8, … 200). Record heap ops and compare with N·log₂k and N·log₂N. Write the README.

**Viva questions (keep answers short)**
- *What happens with an empty queue?* It has `head = None`. `merge()` only pushes queues that have a head, so it is
  never put in the heap.
- *What if the input is not sorted?* `JobQueue.append` raises `ValueError`. We validate at the boundary, so bad data fails loudly.
- *Why does the scaling table matter?* It shows merge work grows with log k, not with N·log N. Use the table to back the claim.
- *What is the demo output?* `B1 → A2 → C3 → A7 → B7 → A9 → C10`, from the problem statement. The tie at t=7 goes to A before B.

---

## 4. Slower — visualiser and Source-code drawer (Person 4)

**Build:** the React + Tailwind + GSAP app in `web/`. Each pick is a GSAP tween that flies a job card from its lane
to its printer slot. The "Merge heap" panel shows the current head of each queue, and the smallest one is marked "← min".
The **Source code** button opens a drawer with two tabs: **Python source** (the real `consolidator.py`) and
**Execution** (the step-by-step trace that Python produced). Python runs in the browser through Pyodide.

**Viva questions**
- *Is the animation faking the algorithm?* No. The timeline and trace come from the same Python `merge()` run in
  Pyodide. Click "Run again in Python" to see the execution again.
- *Why GSAP and not CSS transitions?* A pick is a sequence of timed steps. GSAP timelines handle sequencing,
  pause, step and speed in one place.
- *Where does Python run?* In the browser, via `pyRunner.js`, which loads Pyodide from jsDelivr and writes
  `consolidator.py` to its file system.

**Run:** `cd web && npm install && npm run dev`.

---

## Demo script (everyone, about 5 min)

1. "Problem example" → explain the tie at t=7 (A before B).
2. "Ties + empty" → an empty queue shows as `NULL`, and duplicate times keep their order.
3. "200 queues" → show the report and explain O(N log k) against O(N log N).
4. Open **Source code** → show `merge()` in Python → open **Execution** → walk through three trace lines.
