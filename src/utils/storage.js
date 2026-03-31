const USERS_KEY = 'ca_users'
const SESSION_KEY = 'ca_session'
const CONVOS_KEY = 'ca_convos'
const ONBOARDED_KEY = 'ca_onboarded'

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}
function write(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

export function registerUser(username, password) {
  const users = read(USERS_KEY, [])
  if (users.some(u => u.username === username)) return { error: 'Username already taken' }
  const user = { username, createdAt: Date.now() }
  write(USERS_KEY, [...users, { username, password, createdAt: user.createdAt }])
  return { user }
}

export function loginUser(username, password) {
  const user = read(USERS_KEY, []).find(u => u.username === username && u.password === password)
  return user ? { user: { username: user.username, createdAt: user.createdAt } } : { error: 'Invalid username or password' }
}

export function setSession(user) { write(SESSION_KEY, user) }
export function getSession() { return read(SESSION_KEY, null) }
export function clearSession() { localStorage.removeItem(SESSION_KEY) }

export function hasOnboarded(username) { return read(ONBOARDED_KEY, []).includes(username) }
export function markOnboarded(username) {
  const done = read(ONBOARDED_KEY, [])
  if (!done.includes(username)) write(ONBOARDED_KEY, [...done, username])
}

export function getConversations(username) { return read(CONVOS_KEY, {})[username] || [] }

export function saveConversation(username, convo) {
  const all = read(CONVOS_KEY, {})
  all[username] = [convo, ...(all[username] || [])]
  write(CONVOS_KEY, all)
}

export function deleteConversation(username, id) {
  const all = read(CONVOS_KEY, {})
  if (all[username]) {
    all[username] = all[username].filter(c => c.id !== id)
    write(CONVOS_KEY, all)
  }
}
