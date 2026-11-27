/**
 * Pure range planner for task-aware compaction.
 *
 * Only closed task spans are compactible, the newest `tasksLater` closed tasks
 * stay verbatim, and any span overlapping an open task is split around it.
 * Positions are surface positions (indices into the live surface), never seqs.
 */

function subtract(range, block) {
  const [start, end] = range
  const [bStart, bEnd] = block
  if (bEnd < start || bStart > end) return [range]
  const parts = []
  if (bStart > start) parts.push([start, bStart - 1])
  if (bEnd < end) parts.push([bEnd + 1, end])
  return parts
}

/**
 * @param {{surface: number[], tasks: Array<{id:string,state:string,startSeq:number|null,endSeq:number|null}>, tasksLater?: number}} input
 * @returns {Array<{start:number,end:number,taskIds:string[]}>}
 */
export function planRanges({ surface, tasks, tasksLater = 2 }) {
  if (!Array.isArray(surface) || surface.length < 2 || !Array.isArray(tasks)) return []
  const index = new Map(surface.map((seq, position) => [seq, position]))
  const closed = tasks
    .filter((task) => task.state !== 'open' && Number.isFinite(task.startSeq) && Number.isFinite(task.endSeq))
    .filter((task) => index.has(task.startSeq) && index.has(task.endSeq))
    .sort((a, b) => index.get(a.startSeq) - index.get(b.startSeq))
  const eligible = closed.slice(0, Math.max(0, closed.length - tasksLater))
  const blocked = tasks
    .filter((task) => task.state === 'open' && Number.isFinite(task.startSeq))
    .map((task) => {
      const start = index.get(task.startSeq)
      const end = index.get(task.endSeq ?? task.startSeq)
      return start === undefined ? undefined : [start, end === undefined ? start : end]
    })
    .filter((block) => block !== undefined)
  const ranges = []
  for (const task of eligible) {
    let pieces = [[index.get(task.startSeq), index.get(task.endSeq)]]
    for (const block of blocked) {
      pieces = pieces.flatMap((piece) => subtract(piece, block))
    }
    for (const [start, end] of pieces) {
      if (end - start < 1) continue
      ranges.push({ start: surface[start], end: surface[end], taskIds: [task.id] })
    }
  }
  return ranges
}
