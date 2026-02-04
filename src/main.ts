import { getLocalDateStr, formatTitle, calculateStreak, getFlattenedVideos } from './utils'

// @ts-ignore
const { selectFolder, listVideos, openExplorer } = (window as any).ipcRenderer

let courses: any[] = []
let currentCourse: any = null
let flattenedVideos: any[] = []
let progress: Record<string, { completed: boolean, timestamp: number }> = {}
let lastWatched: Record<string, string> = {} // courseName -> videoPath
let expandedModules: Record<string, boolean> = {}
let thumbCache: Record<string, string> = {} // videoPath -> dataURL
let currentTheme: string = 'theme-minimalist'
let watchHistory: Record<string, number> = {} // "YYYY-MM-DD" -> activity count
let courseTags: Record<string, string[]> = {} // courseName -> tags
let achievements: string[] = []
let searchQuery: string = ''

// DOM Elements
const app = document.getElementById('app')!
const startBtn = document.getElementById('start-btn')
const currentFolderDisplay = document.getElementById('current-folder')!
const courseList = document.getElementById('course-list')!
const mainContent = document.getElementById('main-content')!


async function loadCustomCSS(rootPath: string) {
  // This assumes we have an IPC call to check if file exists and read it
  // For now, let's assume we can try to load it via file:/// (if we had a way to check)
  // Actually, let's just use a simple approach: if we have rootFolder, we try to fetch user.css
  try {
    const cssPath = `file:///${rootPath.replace(/\\/g, '/')}/user.css`
    const response = await fetch(cssPath)
    if (response.ok) {
      const css = await response.text()
      let styleTag = document.getElementById('user-custom-css')
      if (!styleTag) {
        styleTag = document.createElement('style')
        styleTag.id = 'user-custom-css'
        document.head.appendChild(styleTag)
      }
      styleTag.textContent = css
    }
  } catch (e) {
    console.log("No user.css found or error loading it.")
  }
}

// Initialization
function init() {
  const savedFolder = localStorage.getItem('lastFolder')
  const savedProgress = localStorage.getItem('courseProgress')

  if (savedProgress) {
    progress = JSON.parse(savedProgress)
  }

  const savedLastWatched = localStorage.getItem('lastWatched')
  if (savedLastWatched) {
    lastWatched = JSON.parse(savedLastWatched)
  }

  const savedExpanded = localStorage.getItem('expandedModules')
  if (savedExpanded) {
    expandedModules = JSON.parse(savedExpanded)
  }

  const savedThumbs = localStorage.getItem('thumbCache')
  if (savedThumbs) {
    thumbCache = JSON.parse(savedThumbs)
  }

  const savedTheme = localStorage.getItem('currentTheme')
  if (savedTheme) {
    currentTheme = savedTheme
  }
  applyTheme(currentTheme)

  const savedHistory = localStorage.getItem('watchHistory')
  if (savedHistory) {
    watchHistory = JSON.parse(savedHistory)
  }

  const savedTags = localStorage.getItem('courseTags')
  if (savedTags) {
    courseTags = JSON.parse(savedTags)
  }

  const savedAchievements = localStorage.getItem('achievements')
  if (savedAchievements) {
    achievements = JSON.parse(savedAchievements)
  }

  if (savedFolder) {
    loadLibrary(savedFolder)
  }

  if (startBtn) {
    startBtn.addEventListener('click', handleSelectFolder)
  }
}

function applyTheme(theme: string) {
  document.body.className = document.body.className.replace(/theme-\S+/g, '').trim()
  document.body.classList.add(theme)
  currentTheme = theme
  localStorage.setItem('currentTheme', theme)
}

async function handleSelectFolder() {
  const folderPath = await selectFolder()
  if (folderPath) {
    loadLibrary(folderPath)
  }
}

async function loadLibrary(folderPath: string) {
  localStorage.setItem('lastFolder', folderPath)
  currentFolderDisplay.textContent = folderPath

  app.classList.add('sidebar-hidden')
  loadCustomCSS(folderPath)

  const content = await listVideos(folderPath)
  const subDirs = content.filter((item: any) => item.type === 'directory')

  courses = subDirs
  renderLibrary()
  renderSidebarHeader(true)
}

function renderSidebarHeader(isLibrary: boolean) {
  const header = document.querySelector('.sidebar-header')!
  const existingNav = header.querySelector('.nav-link')
  if (existingNav) existingNav.remove()

  if (!isLibrary) {
    const homeNav = document.createElement('div')
    homeNav.className = 'nav-link'
    homeNav.innerHTML = '<span>← Back to Library</span>'
    homeNav.onclick = () => {
      currentCourse = null
      renderLibrary()
      renderSidebarHeader(true)
      app.classList.add('sidebar-hidden')
      courseList.innerHTML = '<div style="padding: 20px; color: var(--text-dim); font-size: 0.8rem;">Select a course from the library.</div>'
    }
    header.appendChild(homeNav)
  }
}

function renderLibrary() {
  const streak = calculateStreak(watchHistory)
  checkAchievements('streak', streak)
  mainContent.innerHTML = `
    <div class="main-container fade-in">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: var(--border-width) solid var(--border); padding-bottom: 24px;">
            <div style="display: flex; align-items: center; flex: 1;">
                <h2 class="hero-title" style="margin-right: 32px;">Library</h2>
                <div class="search-container">
                    <input type="text" class="search-input" placeholder="Search courses or tags..." id="search-input" value="${searchQuery}">
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 24px;">
                <div class="streak-badge" title="Daily Streak">
                    <span>🔥</span>
                    <span>${streak}</span>
                </div>
                <div class="theme-switcher">
                    <div class="theme-dot ${currentTheme === 'theme-minimalist' ? 'active' : ''}" style="background: #00f0ff" data-theme="theme-minimalist" title="Sleek Minimal"></div>
                    <div class="theme-dot ${currentTheme === 'theme-cozy-pixel' ? 'active' : ''}" style="background: #00FF41" data-theme="theme-cozy-pixel" title="Dark Pixel"></div>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="secondary-btn" id="stats-btn">Analytics</button>
                    <button class="secondary-btn" id="refresh-thumbs-btn">Refresh</button>
                    <button class="secondary-btn" id="change-folder-btn">Path</button>
                </div>
            </div>
        </div>
        <div class="course-grid" id="course-grid"></div>
    </div>
  `

  document.getElementById('stats-btn')?.addEventListener('click', renderAnalytics)

  const searchInput = document.getElementById('search-input') as HTMLInputElement
  searchInput?.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value.toLowerCase()
    renderCourseCards()
  })

  document.getElementById('change-folder-btn')?.addEventListener('click', handleSelectFolder)
  document.getElementById('refresh-thumbs-btn')?.addEventListener('click', () => {
    thumbCache = {}
    localStorage.removeItem('thumbCache')
    renderLibrary()
  })

  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      const theme = (e.currentTarget as HTMLElement).dataset.theme!
      applyTheme(theme)
      renderLibrary()
    })
  })

  renderCourseCards()
}

function renderCourseCards() {
  const grid = document.getElementById('course-grid')!
  grid.innerHTML = ''

  const filtered = courses.filter(course => {
    const nameMatch = course.name.toLowerCase().includes(searchQuery)
    const tags = courseTags[course.name] || []
    const tagMatch = tags.some(t => t.toLowerCase().includes(searchQuery))
    return nameMatch || tagMatch
  })

  filtered.forEach(async course => {
    const card = document.createElement('div')
    card.className = 'course-card'

    const tags = courseTags[course.name] || []
    const tagHtml = tags.map(t => `<div class="tag-chip">${t}</div>`).join('')

    const courseVideos = getFlattenedVideos(course.children || [])
    const firstVideo = courseVideos[0]
    const completedCount = courseVideos.filter(v => progress[v.path]?.completed).length
    const progressPercent = courseVideos.length > 0 ? (completedCount / courseVideos.length) * 100 : 0

    const safeId = course.name.replace(/[^a-zA-Z0-9]/g, '')
    card.innerHTML = `
        <div class="course-menu-btn" title="Add Category">...</div>
        <div class="course-thumb" id="thumb-${safeId}"></div>
        <div class="course-info">
            <div class="course-tags">${tagHtml}</div>
            <div class="course-name">${formatTitle(course.name)}</div>
            <div class="course-stats">
                <span>${courseVideos.length} LESSONS</span>
                <span>${completedCount}/${courseVideos.length}</span>
            </div>
            <div class="course-progress-bar">
                <div class="course-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
        </div>
    `

    card.querySelector('.course-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      openTagModal(course)
    })

    card.onclick = () => {
      currentCourse = course
      flattenedVideos = courseVideos
      app.classList.remove('sidebar-hidden')
      renderCourse(course)
      renderSidebarHeader(false)

      const lastPath = lastWatched[course.name]
      if (lastPath) {
        const lastVideo = flattenedVideos.find(v => v.path === lastPath)
        if (lastVideo) playVideo(lastVideo)
      }
    }
    grid.appendChild(card)

    if (firstVideo) {
      const thumbUrl = await getThumbnail(firstVideo.path)
      const thumbEl = document.getElementById(`thumb-${safeId}`)
      if (thumbEl && thumbUrl) {
        thumbEl.style.backgroundImage = `url(${thumbUrl})`
      }
    }
  })
}

async function getThumbnail(videoPath: string): Promise<string | null> {
  if (thumbCache[videoPath]) return thumbCache[videoPath]

  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.src = `file:///${videoPath.replace(/\\/g, '/')}`
    video.preload = 'metadata'
    video.muted = true

    const cleanup = () => {
      video.onloadedmetadata = null
      video.onseeked = null
      video.onerror = null
      video.src = ""
      video.load()
      video.remove()
    }

    video.onloadedmetadata = () => { video.currentTime = Math.min(2, video.duration) }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        thumbCache[videoPath] = dataUrl
        localStorage.setItem('thumbCache', JSON.stringify(thumbCache))
        resolve(dataUrl)
      } else {
        resolve(null)
      }
      cleanup()
    }
    video.onerror = () => {
      cleanup()
      resolve(null)
    }
    setTimeout(() => {
      cleanup()
      resolve(null)
    }, 12000)
  })
}


function renderCourse(course: any) {
  courseList.innerHTML = ''
  renderSidebarRecursive(course.children || [], courseList)
  renderWelcome()
}

function renderSidebarRecursive(data: any[], container: HTMLElement) {
  data.forEach(item => {
    if (item.type === 'directory') {
      const moduleEl = document.createElement('div')
      moduleEl.className = 'module'
        ; (moduleEl as any)._path = item.path
      if (expandedModules[item.path]) moduleEl.classList.add('open')

      const header = document.createElement('div')
      header.className = 'module-header'
      header.textContent = item.name
      header.onclick = (e) => {
        e.stopPropagation()
        const isOpen = moduleEl.classList.toggle('open')
        expandedModules[item.path] = isOpen
        localStorage.setItem('expandedModules', JSON.stringify(expandedModules))
      }
      moduleEl.appendChild(header)

      const childrenList = document.createElement('div')
      childrenList.className = 'module-children'
      renderSidebarRecursive(item.children, childrenList)
      moduleEl.appendChild(childrenList)
      container.appendChild(moduleEl)
    } else {
      container.appendChild(createLessonItem(item))
    }
  })
}

function createLessonItem(video: any) {
  const el = document.createElement('div')
  el.className = `lesson-item ${progress[video.path]?.completed ? 'completed' : ''}`
  el.innerHTML = `
    <div class="status-icon"></div>
    <div class="lesson-name">${formatTitle(video.name)}</div>
  `
    ; (el as any)._path = video.path
  el.addEventListener('click', () => playVideo(video, true))
  return el
}

function playVideo(video: any, isManual: boolean = false) {
  document.querySelectorAll('.lesson-item').forEach(item => item.classList.remove('active'))
  const items = Array.from(document.querySelectorAll('.lesson-item'))
  const activeItem = items.find(el => (el as any)._path === video.path) as HTMLElement
  activeItem?.classList.add('active')

  // AUTO-EXPAND LOGIC: Find parents and expand
  if (activeItem) {
    expandParentModules(activeItem)
  }

  if (currentCourse) {
    lastWatched[currentCourse.name] = video.path
    localStorage.setItem('lastWatched', JSON.stringify(lastWatched))
  }

  let savedTime = progress[video.path]?.timestamp || 0
  if (isManual && progress[video.path]?.completed) {
    savedTime = 0
  }

  const cleanUrl = `file:///${video.path.replace(/\\/g, '/')}`

  mainContent.innerHTML = `
    <div class="main-container fade-in">
      <div class="player-container">
        <video id="video-player" controls src="${cleanUrl}"></video>
      </div>
      <div class="video-info">
        <div style="flex: 1;">
          <h2 class="video-title">${formatTitle(video.name)}</h2>
          <p class="video-meta">${video.path}</p>
        </div>
        
        <div class="playback-controls">
            <button class="speed-btn active" data-speed="1">1x</button>
            <button class="speed-btn" data-speed="1.25">1.25x</button>
            <button class="speed-btn" data-speed="1.5">1.5x</button>
            <button class="speed-btn" data-speed="2">2x</button>
            <input type="number" step="0.1" min="0.1" max="10" class="custom-speed-input" placeholder="CUST" id="custom-speed">
        </div>

        <button class="secondary-btn" id="open-folder-btn" style="margin-left: 16px;">Resources</button>
      </div>
    </div>
  `

  const player = document.getElementById('video-player') as HTMLVideoElement
  const cleanupShortcuts = setupKeyboardShortcuts(player)

  player.onloadedmetadata = () => {
    player.currentTime = savedTime
    player.play().catch(e => console.error(e))
  }

  player.ontimeupdate = () => {
    updateProgress(video.path, player.currentTime, player.duration)
  }

  player.onended = () => {
    cleanupShortcuts()
    markAsCompleted(video.path)
    activeItem?.classList.add('completed')
    checkAchievements('lesson_complete')

    // Check course completion
    if (currentCourse) {
      const vids = getFlattenedVideos(currentCourse.children || [])
      if (vids.every(v => progress[v.path]?.completed)) {
        checkAchievements('course_complete')
      }
    }

    const currentIndex = flattenedVideos.findIndex(v => v.path === video.path)
    if (currentIndex !== -1 && currentIndex < flattenedVideos.length - 1) {
      playVideo(flattenedVideos[currentIndex + 1])
    }
  }

  const speedBtns = document.querySelectorAll('.speed-btn')
  const customInput = document.getElementById('custom-speed') as HTMLInputElement

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      player.playbackRate = parseFloat((btn as HTMLElement).dataset.speed!)
    })
  })

  customInput.onchange = () => {
    let val = parseFloat(customInput.value)
    if (val > 10) val = 10
    if (val < 0.1) val = 0.1
    player.playbackRate = val
    speedBtns.forEach(b => b.classList.remove('active'))
  }

  document.getElementById('open-folder-btn')?.addEventListener('click', () => {
    openExplorer(video.path)
  })
}

function expandParentModules(el: HTMLElement) {
  let parent = el.parentElement
  let changed = false
  while (parent && parent !== courseList) {
    if (parent.classList.contains('module')) {
      if (!parent.classList.contains('open')) {
        parent.classList.add('open')
        const path = (parent as any)._path
        if (path) {
          expandedModules[path] = true
          changed = true
        }
      }
    }
    parent = parent.parentElement
  }
  if (changed) {
    localStorage.setItem('expandedModules', JSON.stringify(expandedModules))
  }
}

function renderWelcome() {
  mainContent.innerHTML = `
    <div class="main-container fade-in">
        <h2 class="hero-title">${currentCourse?.name || 'Welcome'}</h2>
        <p style="color: var(--text-dim); margin-top: 8px;">Select a lesson to begin.</p>
    </div>
  `
}

function updateProgress(path: string, timestamp: number, duration: number = 0) {
  if (!progress[path]) progress[path] = { completed: false, timestamp: 0 }
  progress[path].timestamp = timestamp

  // Record activity (use local date)
  const dateStr = getLocalDateStr()
  watchHistory[dateStr] = (watchHistory[dateStr] || 0) + 1 // increment activity
  localStorage.setItem('watchHistory', JSON.stringify(watchHistory))

  if (!progress[path].completed && duration > 0) {
    if (timestamp / duration >= 0.8) {
      progress[path].completed = true
      checkAchievements('lesson_complete')
      const items = Array.from(document.querySelectorAll('.lesson-item'))
      const activeItem = items.find(el => (el as any)._path === path)
      activeItem?.classList.add('completed')
    }
  }

  localStorage.setItem('courseProgress', JSON.stringify(progress))
}

function markAsCompleted(path: string) {
  if (!progress[path]) progress[path] = { completed: false, timestamp: 0 }
  progress[path].completed = true
  localStorage.setItem('courseProgress', JSON.stringify(progress))
}

function renderAnalytics() {
  app.classList.add('sidebar-hidden')
  const streak = calculateStreak(watchHistory)
  checkAchievements('streak', streak)
  const totalLessons = Object.keys(progress).filter(k => progress[k].completed).length

  mainContent.innerHTML = `
        <div class="main-container fade-in">
            <div class="stats-header">
                <h2 class="hero-title">Analytics</h2>
                <button class="secondary-btn" id="back-to-lib">← Back to Library</button>
            </div>

            <div class="stats-grid">
                <div class="streak-card">
                    <div class="streak-number">${streak}</div>
                    <div class="streak-label">Day Streak</div>
                </div>
                <div class="streak-card">
                    <div class="streak-number">${totalLessons}</div>
                    <div class="streak-label">Lessons Completed</div>
                </div>
            </div>

            <div class="graph-container">
                <div class="graph-title">Unlocked Achievements</div>
                <div class="course-tags" style="margin-bottom: 32px;" id="achievements-list">
                    ${achievements.length > 0 ? achievements.map(a => `<div class="tag-chip" style="background: var(--accent); color: var(--bg-color); padding: 8px 16px;">${a.replace(/_/g, ' ').toUpperCase()}</div>`).join('') : '<p style="color: var(--text-dim); font-size: 0.8rem;">No achievements yet. Keep learning!</p>'}
                </div>
                
                <div class="graph-title">Activity Graph</div>
                <div class="contribution-graph-wrapper">
                    <div class="graph-labels">
                        <span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span>
                    </div>
                    <div style="flex: 1;">
                        <div class="graph-months" id="graph-months"></div>
                        <div class="contribution-graph" id="contribution-graph"></div>
                    </div>
                </div>
            </div>
        </div>
    `
  document.getElementById('back-to-lib')?.addEventListener('click', renderLibrary)
  renderSidebarHeader(true)
  renderContributionGraph()
}


function openTagModal(course: any) {
  const modal = document.getElementById('tag-modal')!
  const nameEl = document.getElementById('modal-course-name')!
  const input = document.getElementById('tag-input') as HTMLInputElement
  const saveBtn = document.getElementById('modal-save')!
  const cancelBtn = document.getElementById('modal-cancel')!

  nameEl.textContent = formatTitle(course.name)
  input.value = ''
  modal.style.display = 'flex'
  input.focus()

  const close = () => {
    modal.style.display = 'none'
    saveBtn.onclick = null
    cancelBtn.onclick = null
    window.removeEventListener('keydown', handleEsc)
  }

  const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
  window.addEventListener('keydown', handleEsc)

  cancelBtn.onclick = close
  saveBtn.onclick = () => {
    const val = input.value.trim()
    if (val) {
      if (!courseTags[course.name]) courseTags[course.name] = []
      if (!courseTags[course.name].includes(val)) {
        courseTags[course.name].push(val)
        localStorage.setItem('courseTags', JSON.stringify(courseTags))
        renderCourseCards()
      }
    }
    close()
  }

  input.onkeydown = (e) => {
    if (e.key === 'Enter') saveBtn.click()
  }
}

function renderContributionGraph() {
  const grid = document.getElementById('contribution-graph')!
  const monthsEl = document.getElementById('graph-months')!

  const now = new Date()
  const startDate = new Date()
  startDate.setDate(now.getDate() - 364) // 1 year ago

  // Adjust to Monday
  while (startDate.getDay() !== 1) {
    startDate.setDate(startDate.getDate() - 1)
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  let lastMonth = -1

  for (let i = 0; i < 371; i++) { // roughly 53 weeks
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    const dateStr = d.toLocaleDateString('en-CA')
    const count = watchHistory[dateStr] || 0

    const day = document.createElement('div')
    day.className = 'graph-day'
    if (count > 0) {
      day.classList.add('active')
      const level = Math.min(3, Math.ceil(count / 20)) // Increased threshold for levels
      day.setAttribute('data-level', level.toString())
    }
    day.title = `${dateStr}: ${Math.floor(count)} active units`
    grid.appendChild(day)

    if (d.getMonth() !== lastMonth && i % 7 === 0) {
      const mSpan = document.createElement('span')
      mSpan.textContent = months[d.getMonth()]
      monthsEl.appendChild(mSpan)
      lastMonth = d.getMonth()
    }
  }
}

function showAchievement(title: string, description: string, icon: string = '🏆') {
  const container = document.getElementById('toast-container') || createToastContainer()
  const toast = document.createElement('div')
  toast.className = 'achievement-toast'
  toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <h4>Achievement Unlocked</h4>
            <p>${title}: ${description}</p>
        </div>
    `
  container.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('toast-fade-out')
    setTimeout(() => toast.remove(), 500)
  }, 5000)
}

function createToastContainer() {
  const el = document.createElement('div')
  el.id = 'toast-container'
  el.className = 'toast-container'
  document.body.appendChild(el)
  return el
}

function checkAchievements(type: string, data?: any) {
  const milestones = [
    { id: 'first_blood', name: 'First Blood', desc: 'Complete your first lesson', icon: '🩸' },
    { id: 'seven_days', name: 'Week Warrior', desc: 'Reach a 7-day streak', icon: '🔥' },
    { id: 'master', name: 'Course Master', desc: 'Complete an entire course', icon: '🎓' },
    { id: 'night_owl', name: 'Night Owl', desc: 'Finish a video after midnight', icon: '🦉' }
  ]

  milestones.forEach(m => {
    if (achievements.includes(m.id)) return

    let unlocked = false
    if (type === 'lesson_complete' && m.id === 'first_blood') unlocked = true
    if (type === 'streak' && m.id === 'seven_days' && data >= 7) unlocked = true
    if (type === 'course_complete' && m.id === 'master') unlocked = true
    if (type === 'lesson_complete' && m.id === 'night_owl') {
      const hour = new Date().getHours()
      if (hour >= 0 && hour < 5) unlocked = true
    }

    if (unlocked) {
      achievements.push(m.id)
      localStorage.setItem('achievements', JSON.stringify(achievements))
      showAchievement(m.name, m.desc, m.icon)
    }
  })
}

function setupKeyboardShortcuts(player: HTMLVideoElement) {
  const handleKeys = (e: KeyboardEvent) => {
    if (document.activeElement?.tagName === 'INPUT') return

    switch (e.code) {
      case 'Space':
      case 'KeyK':
        e.preventDefault()
        player.paused ? player.play() : player.pause()
        break
      case 'KeyL':
        player.currentTime += 10
        break
      case 'KeyJ':
        player.currentTime -= 10
        break
      case 'BracketRight':
        player.playbackRate = Math.min(10, player.playbackRate + 0.25)
        break
      case 'BracketLeft':
        player.playbackRate = Math.max(0.1, player.playbackRate - 0.25)
        break
      case 'KeyF':
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          player.requestFullscreen()
        }
        break
    }
  }

  window.addEventListener('keydown', handleKeys)
  // Cleanup on video change
  return () => window.removeEventListener('keydown', handleKeys)
}

init()
