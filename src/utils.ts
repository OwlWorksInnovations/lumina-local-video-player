export function getLocalDateStr(): string {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
}

export function formatTitle(str: string): string {
  // Remove "Udemy - " and handle delimiters
  let clean = str.replace(/^Udemy\s*-\s*/i, '')
  clean = clean.replace(/[_-]/g, ' ')
  clean = clean.replace(/,/g, ' ')

  // Title Case
  return clean.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim()
}

export function calculateStreak(watchHistory: Record<string, number>): number {
  const dates = Object.keys(watchHistory).sort().reverse()
  if (dates.length === 0) return 0

  let streak = 0
  let current = new Date()
  current.setHours(0, 0, 0, 0)

  // Check if they did something today or yesterday
  const todayStr = getLocalDateStr()
  let checkDate = new Date(current)

  if (!watchHistory[todayStr]) {
    checkDate.setDate(checkDate.getDate() - 1)
    const yesterdayStr = checkDate.toLocaleDateString('en-CA')
    if (!watchHistory[yesterdayStr]) return 0
  }

  // We start checking from the most recent active date
  let streakDate = new Date(watchHistory[todayStr] ? current : checkDate)

  while (true) {
    const dateStr = streakDate.toLocaleDateString('en-CA')
    if (watchHistory[dateStr]) {
      streak++
      streakDate.setDate(streakDate.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export function getFlattenedVideos(items: any[]): any[] {
  let results: any[] = []
  items.forEach(item => {
    if (item.type === 'video') results.push(item)
    if (item.children) results = results.concat(getFlattenedVideos(item.children))
  })
  return results
}
