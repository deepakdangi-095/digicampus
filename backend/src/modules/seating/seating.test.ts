import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeating, SeatingStudent } from './seating.algorithm';

const make = (counts: number[]): SeatingStudent[] =>
  counts.flatMap((n, b) => Array.from({ length: n }, (_, i) => ({ id: `B${b}-${i}`, branch: `B${b}` })));

describe('exam seating', () => {
  it('never seats the same branch side by side when the mix allows it', () => {
    for (const [rows, cols, counts] of [[6, 10, [20, 20, 20]], [6, 10, [30, 30]], [10, 10, [40, 25, 20, 15]], [12, 13, [25, 25, 25, 25, 25, 25]]] as const) {
      const r = generateSeating(rows, cols, make([...counts]));
      assert.equal(r.unresolvedConflicts, 0, `${rows}x${cols} ${counts}`);
    }
  });

  it('seats every student exactly once, inside the room', () => {
    const students = make([17, 11, 9]);
    const r = generateSeating(5, 8, students);
    assert.equal(r.seatsUsed, students.length);
    assert.equal(new Set(r.assignments.map((a) => a.studentId)).size, students.length);
    assert.equal(new Set(r.assignments.map((a) => `${a.row},${a.col}`)).size, students.length);
    assert.ok(r.assignments.every((a) => a.row >= 0 && a.row < 5 && a.col >= 0 && a.col < 8));
  });

  it('reports unavoidable conflicts honestly instead of hiding them', () => {
    assert.ok(generateSeating(3, 4, make([12])).unresolvedConflicts > 0);
  });

  it('rejects an overfull room and an empty list', () => {
    assert.throws(() => generateSeating(2, 2, make([5])), /seats/);
    assert.throws(() => generateSeating(2, 2, []), /No students/);
  });
});
