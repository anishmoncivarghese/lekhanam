import { subDays, format } from 'date-fns'

// wordHistory stores cumulative snapshots: each entry is the TOTAL word count at end of that day.
// "Words written in a period" = latest snapshot - snapshot at start of period.

function sortedHistory(wordHistory: { date: string; count: number }[]) {
  return [...wordHistory].sort((a, b) => a.date.localeCompare(b.date))
}

/** Latest total snapshot (most recent entry, any day). */
function latestSnapshot(wordHistory: { date: string; count: number }[]): number {
  const sorted = sortedHistory(wordHistory)
  return sorted.length > 0 ? sorted[sorted.length - 1].count : 0
}

/** Most recent snapshot at or before a given date string (yyyy-MM-dd). */
function snapshotOnOrBefore(
  wordHistory: { date: string; count: number }[],
  dateStr: string
): number {
  const sorted = sortedHistory(wordHistory)
  const before = sorted.filter((h) => h.date <= dateStr)
  return before.length > 0 ? before[before.length - 1].count : 0
}

/** Words written since the start of `days` ago (delta between today's snapshot and snapshot N days ago). */
export function getWordsLastNDays(
  wordHistory: { date: string; count: number }[],
  days: number
): number {
  const cutoffStr = format(subDays(new Date(), days), 'yyyy-MM-dd')
  const now = latestSnapshot(wordHistory)
  const before = snapshotOnOrBefore(wordHistory, cutoffStr)
  return Math.max(0, now - before)
}

/** Words written today = today's snapshot - yesterday's snapshot. */
export function getTodayWordCount(wordHistory: { date: string; count: number }[]): number {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const todayEntry = wordHistory.find((h) => h.date === todayStr)
  if (!todayEntry) return 0
  const prevSnapshot = snapshotOnOrBefore(wordHistory, yesterdayStr)
  return Math.max(0, todayEntry.count - prevSnapshot)
}

/** Consecutive days the daily goal was met (streak), counting backwards from yesterday.
 *  Today is excluded from breaking the streak (you haven't finished writing yet). */
export function getStreak(
  wordHistory: { date: string; count: number }[],
  dailyGoal: number
): number {
  const sorted = sortedHistory(wordHistory)
  if (sorted.length === 0) return 0

  let streak = 0
  const today = new Date()

  // Walk backwards from yesterday
  for (let i = 1; i <= 365; i++) {
    const dayStr = format(subDays(today, i), 'yyyy-MM-dd')
    const prevDayStr = format(subDays(today, i + 1), 'yyyy-MM-dd')
    const dayEntry = sorted.find((h) => h.date === dayStr)
    if (!dayEntry) break  // no entry for this day → streak ends
    const prevSnapshot = snapshotOnOrBefore(sorted, prevDayStr)
    const written = Math.max(0, dayEntry.count - prevSnapshot)
    if (written >= dailyGoal) {
      streak++
    } else {
      break
    }
  }

  // Also count today if goal already met
  const todayWords = getTodayWordCount(wordHistory)
  if (todayWords >= dailyGoal) streak++

  return streak
}

export function getGoalProgress(
  wordHistory: { date: string; count: number }[],
  goalType: 'daily' | 'weekly' | 'monthly',
  target: number
): { current: number; target: number; percentage: number } {
  let current = 0
  if (goalType === 'daily') {
    current = getTodayWordCount(wordHistory)
  } else if (goalType === 'weekly') {
    current = getWordsLastNDays(wordHistory, 7)
  } else {
    current = getWordsLastNDays(wordHistory, 30)
  }
  return {
    current,
    target,
    percentage: Math.min(100, Math.round((current / target) * 100))
  }
}
