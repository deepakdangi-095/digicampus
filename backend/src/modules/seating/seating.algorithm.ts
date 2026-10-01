import { AppError } from '../../utils/AppError';

export interface SeatingStudent { id: string; branch: string }
export interface SeatAssignment { row: number; col: number; studentId: string; branch: string }
export interface SeatingResult {
  assignments: SeatAssignment[];
  unresolvedConflicts: number;
  seatsUsed: number;
  branchCounts: Record<string, number>;
}
type Grid = (SeatAssignment | null)[][];

const DIRS: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // right, front, left, back

// Regulation: no two students seated adjacent (left/right/front/back) may share a branch.
// 1) Interleave: round-robin across branch queues, row-major, with one extra rotation per row so the
//    pattern phase-shifts (otherwise cols that are a multiple of the branch count stripe vertically).
// 2) Repair: swap conflicted seats with any seat that strictly reduces the conflicts around both cells.
// Best-effort by design: if one branch holds more than half the room some adjacency is unavoidable, so the
// result reports the number of remaining conflicting pairs instead of pretending otherwise.
export function generateSeating(rows: number, cols: number, students: SeatingStudent[]): SeatingResult {
  const seats = rows * cols;
  if (students.length === 0) throw new AppError(400, 'No students provided');
  if (students.length > seats) throw new AppError(400, `Room has ${seats} seats but ${students.length} students were provided`);

  const byBranch = new Map<string, SeatingStudent[]>();
  for (const s of students) byBranch.set(s.branch, [...(byBranch.get(s.branch) ?? []), s]);
  // Largest branches first so the tail of the fill isn't a run of the majority branch.
  const queues = [...byBranch.values()].sort((a, b) => b.length - a.length);

  const grid: Grid = Array.from({ length: rows }, () => Array<SeatAssignment | null>(cols).fill(null));
  let cursor = 0;
  outer: for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let picked: SeatingStudent | undefined;
      for (let attempt = 0; attempt < queues.length && !picked; attempt++) {
        const qi = (cursor + attempt) % queues.length;
        if (queues[qi].length) {
          picked = queues[qi].shift();
          cursor = (qi + 1) % queues.length;
        }
      }
      if (!picked) break outer;
      grid[r][c] = { row: r, col: c, studentId: picked.id, branch: picked.branch };
    }
    cursor = (cursor + 1) % queues.length;
  }

  repair(grid, rows, cols);

  const assignments = grid.flat().filter((s): s is SeatAssignment => s !== null);
  const branchCounts: Record<string, number> = {};
  for (const a of assignments) branchCounts[a.branch] = (branchCounts[a.branch] ?? 0) + 1;
  return { assignments, unresolvedConflicts: countConflictPairs(grid, rows, cols), seatsUsed: assignments.length, branchCounts };
}

/** Number of same-branch neighbours around a cell. */
function around(grid: Grid, r: number, c: number): number {
  const cell = grid[r][c];
  if (!cell) return 0;
  return DIRS.reduce((n, [dr, dc]) => n + (grid[r + dr]?.[c + dc]?.branch === cell.branch ? 1 : 0), 0);
}

function countConflictPairs(grid: Grid, rows: number, cols: number): number {
  let pairs = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (grid[r][c + 1]?.branch === cell.branch) pairs++;
      if (grid[r + 1]?.[c]?.branch === cell.branch) pairs++;
    }
  return pairs;
}

function repair(grid: Grid, rows: number, cols: number): void {
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!around(grid, r, c)) continue;
        let done = false;
        for (let r2 = 0; r2 < rows && !done; r2++) {
          for (let c2 = 0; c2 < cols && !done; c2++) {
            if ((r2 === r && c2 === c) || !grid[r2][c2]) continue;
            const before = around(grid, r, c) + around(grid, r2, c2);
            swap(grid, r, c, r2, c2);
            if (around(grid, r, c) + around(grid, r2, c2) < before) { done = improved = true; }
            else swap(grid, r, c, r2, c2); // revert
          }
        }
      }
    }
    if (!improved) return;
  }
}

function swap(grid: Grid, r1: number, c1: number, r2: number, c2: number): void {
  const a = grid[r1][c1], b = grid[r2][c2];
  grid[r1][c1] = b ? { ...b, row: r1, col: c1 } : null;
  grid[r2][c2] = a ? { ...a, row: r2, col: c2 } : null;
}
