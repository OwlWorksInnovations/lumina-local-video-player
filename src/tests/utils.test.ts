import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatTitle, getFlattenedVideos, calculateStreak, getLocalDateStr } from '../utils'

describe('formatTitle', () => {
    it('should remove "Udemy - " prefix', () => {
        expect(formatTitle('Udemy - JavaScript Course')).toBe('Javascript Course')
    })

    it('should handle underscores and hyphens', () => {
        expect(formatTitle('my_awesome-course')).toBe('My Awesome Course')
    })

    it('should capitalize titles correctly', () => {
        expect(formatTitle('python FOR beginners')).toBe('Python For Beginners')
    })
})

describe('getFlattenedVideos', () => {
    it('should flatten nested course structures', () => {
        const mockData = [
            {
                name: 'Module 1',
                type: 'directory',
                children: [
                    { name: 'Video 1', type: 'video', path: '/path/1' },
                    { name: 'Video 2', type: 'video', path: '/path/2' }
                ]
            },
            { name: 'Video 3', type: 'video', path: '/path/3' }
        ]
        const result = getFlattenedVideos(mockData)
        expect(result).toHaveLength(3)
        expect(result[0].name).toBe('Video 1')
        expect(result[2].path).toBe('/path/3')
    })
})

describe('calculateStreak', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should return 0 for empty history', () => {
        expect(calculateStreak({})).toBe(0)
    })

    it('should calculate streak for consecutive days including today', () => {
        const today = new Date('2026-02-04')
        vi.setSystemTime(today)

        const history = {
            '2026-02-04': 5,
            '2026-02-03': 10,
            '2026-02-02': 2
        }
        expect(calculateStreak(history)).toBe(3)
    })

    it('should calculate streak if last activity was yesterday', () => {
        const today = new Date('2026-02-04')
        vi.setSystemTime(today)

        const history = {
            '2026-02-03': 10,
            '2026-02-02': 2,
            '2026-02-01': 1
        }
        expect(calculateStreak(history)).toBe(3)
    })

    it('should break streak if a day is missed', () => {
        const today = new Date('2026-02-04')
        vi.setSystemTime(today)

        const history = {
            '2026-02-04': 5,
            '2026-02-02': 10
        }
        expect(calculateStreak(history)).toBe(1)
    })
})

describe('getLocalDateStr', () => {
    it('should return date in YYYY-MM-DD format', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-02-04'))
        expect(getLocalDateStr()).toBe('2026-02-04')
        vi.useRealTimers()
    })
})
