/* ─────────────────────────────────────────────────────────────────
   analyzeConversation.js
   Real keyword-based psychological analysis engine.
   Detects Gottman's Four Horsemen, TKI conflict modes,
   and Transactional Analysis ego states from message text.
   ───────────────────────────────────────────────────────────────── */

/* ── Parse raw text into messages ────────────────────────────────── */
export function parseConversation(raw) {
  const lines = raw.trim().split('\n').filter(l => l.trim())
  const messages = []
  let currentSender = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Match: "Name: message", "[timestamp] Name: message", "Name - message"
    const colonMatch = trimmed.match(/^(?:\[.*?\]\s*)?([A-Za-z0-9 _.'"-]+?):\s*(.+)$/)
    const dashMatch  = trimmed.match(/^(?:\[.*?\]\s*)?([A-Za-z0-9 _.'"-]+?)\s*[-–—]\s*(.+)$/)
    const match = colonMatch || dashMatch

    if (match) {
      currentSender = match[1].trim()
      messages.push({ sender: currentSender, text: match[2].trim() })
    } else if (currentSender && messages.length > 0) {
      messages[messages.length - 1].text += ' ' + trimmed
    } else {
      const sender = messages.length % 2 === 0 ? 'Person A' : 'Person B'
      messages.push({ sender, text: trimmed })
    }
  }

  return messages
}

/* ── Anonymize ───────────────────────────────────────────────────── */
function anonymize(messages) {
  const senders = [...new Set(messages.map(m => m.sender))]
  const senderMap = {}
  senders.forEach((s, i) => {
    senderMap[s] = `Person ${String.fromCharCode(65 + i)}`
  })

  return messages.map(m => ({
    ...m,
    sender: senderMap[m.sender] || m.sender,
    text: m.text
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]')
      .replace(/\b\d{1,5}\s\w+\s(?:St|Ave|Blvd|Rd|Dr|Ln|Ct|Pl)\b/gi, '[address]'),
  }))
}

/* ── Gottman's Four Horsemen detection ───────────────────────────── */
const GOTTMAN_PATTERNS = {
  Criticism: {
    patterns: [
      /\byou always\b/i, /\byou never\b/i, /\byou're so\b/i,
      /\bwhat's wrong with you\b/i, /\bwhy can't you\b/i,
      /\byou should\b/i, /\bwhat is your problem\b/i,
      /\byou're the one\b/i, /\byou don't even\b/i,
      /\bevery single time\b/i, /\byou're just like\b/i,
    ],
    sentiment: ['blame', 'accusation', 'generalization'],
  },
  Contempt: {
    patterns: [
      /\bwhatever\b/i, /\bi don't care\b/i, /\bpathetic\b/i,
      /\byou're ridiculous\b/i, /\bdisgust/i, /\bget over (it|yourself)\b/i,
      /\byeah right\b/i, /\bgrow up\b/i, /\bseriously\?\b/i,
      /\bi can't believe\b/i, /\bso predictable\b/i, /\blmao\b/i,
      /\byou're joking\b/i, /\bnot my problem\b/i, /\bclassic you\b/i,
      /🙄|😂|💀/, /\b(lol|lmfao)\b/i,
    ],
    sentiment: ['mockery', 'superiority', 'dismissal'],
  },
  Defensiveness: {
    patterns: [
      /\bthat's not what i\b/i, /\bi didn't\b/i, /\bi never said\b/i,
      /\bwhat about you\b/i, /\byou did the same\b/i,
      /\bit's not my fault\b/i, /\bi was just\b/i,
      /\byou're twisting\b/i, /\bthat's not fair\b/i,
      /\bi was trying to\b/i, /\byou're making me\b/i,
      /\byes but\b/i, /\bwhy are you blaming\b/i,
    ],
    sentiment: ['deflection', 'counter-attack', 'excuse'],
  },
  Stonewalling: {
    patterns: [
      /^(fine|ok|okay|k|sure|whatever|idc|nothing|nvm|nm)\.?$/i,
      /\bleave me alone\b/i, /\bi'm done\b/i,
      /\bdo what you want\b/i, /\bi don't want to talk\b/i,
      /\bforget it\b/i, /\bnever\s?mind\b/i,
      /\bi can't do this\b/i, /\bgoodbye\b/i,
      /^\.+$/, /\b(bye|done|stop|enough)\b/i,
    ],
    sentiment: ['withdrawal', 'shutdown', 'disengagement'],
  },
}

function detectGottman(text) {
  let bestTag = null
  let bestScore = 0

  for (const [tag, { patterns }] of Object.entries(GOTTMAN_PATTERNS)) {
    let score = 0
    for (const p of patterns) {
      if (p.test(text)) score += 1
    }
    // Short messages that match stonewalling patterns get a boost
    if (tag === 'Stonewalling' && text.length < 15) score += 0.5
    // Contempt gets a boost for sarcastic punctuation
    if (tag === 'Contempt' && /[?!]{2,}|\.{3,}/.test(text)) score += 0.3

    if (score > bestScore) {
      bestScore = score
      bestTag = tag
    }
  }

  return bestTag || 'Neutral'
}

/* ── Ego State detection (Transactional Analysis) ────────────────── */
function detectEgoState(text, gottmanTag) {
  const lower = text.toLowerCase()

  // Parent: authoritative, lecturing, should/must, rules
  const parentSignals = [
    /\byou should\b/, /\byou need to\b/, /\byou must\b/,
    /\bi told you\b/, /\bhow many times\b/, /\bwhen will you\b/,
    /\byou're supposed to\b/, /\bwhat did i say\b/,
    /\bresponsible\b/, /\bimmature\b/, /\bgrow up\b/,
  ].filter(p => p.test(lower)).length

  // Adult: rational, factual, problem-solving
  const adultSignals = [
    /\bi think\b/, /\bmaybe we\b/, /\bcan we\b/,
    /\bi understand\b/, /\blet's\b/, /\bhow about\b/,
    /\bi feel like\b.*\bbecause\b/, /\bwhat if\b/,
    /\bi hear you\b/, /\bthat makes sense\b/,
  ].filter(p => p.test(lower)).length

  // Child: emotional, reactive, needy
  const childSignals = [
    /\byou don't\b/, /\bit's not fair\b/, /\bi hate\b/,
    /\bwhy\?\b/, /\bplease\b.*\bdon't\b/, /\bi can't\b/,
    /!{2,}/, /\bugh\b/, /\bomg\b/, /\bwtf\b/,
  ].filter(p => p.test(lower)).length

  // Gottman correlation boost
  const scores = { Parent: parentSignals, Adult: adultSignals, Child: childSignals }
  if (gottmanTag === 'Criticism') scores.Parent += 1
  if (gottmanTag === 'Contempt') scores.Parent += 0.5
  if (gottmanTag === 'Defensiveness') scores.Child += 0.5
  if (gottmanTag === 'Stonewalling') scores.Child += 1

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  return sorted[0][1] > 0 ? sorted[0][0] : 'Adult'
}

/* ── Hidden meaning generation ───────────────────────────────────── */
const HIDDEN_MEANINGS = {
  Criticism: {
    Parent: 'I feel unheard and am resorting to generalizations to force you to listen.',
    Child: 'I am scared of being abandoned and am lashing out to test your loyalty.',
    Adult: 'I have a legitimate concern but am expressing it through blame instead of vulnerability.',
  },
  Contempt: {
    Parent: 'I feel superior because vulnerability feels too dangerous right now.',
    Child: 'I am deeply hurt but mocking you feels safer than admitting it.',
    Adult: 'I have reached emotional exhaustion and have stopped trying to connect.',
  },
  Defensiveness: {
    Parent: 'I cannot accept fault because my self-image depends on being right.',
    Child: 'I feel attacked and am shutting down to protect myself from more pain.',
    Adult: 'I sense unfairness in this accusation and want to correct the record.',
  },
  Stonewalling: {
    Parent: 'I am withdrawing my attention as a form of punishment.',
    Child: 'I am overwhelmed and have no emotional bandwidth left to engage.',
    Adult: 'I need space to process before I can respond constructively.',
  },
  Neutral: {
    Parent: 'I am maintaining composure to control the direction of this conversation.',
    Child: 'I am uncertain how to respond and am waiting to gauge your reaction.',
    Adult: 'I am engaging in good faith and trying to communicate clearly.',
  },
}

function getHiddenMeaning(gottmanTag, egoState) {
  return HIDDEN_MEANINGS[gottmanTag]?.[egoState]
    || HIDDEN_MEANINGS.Neutral[egoState]
    || 'This message carries emotional weight that may not be immediately apparent.'
}

/* ── TKI Conflict Mode (per-person aggregate) ────────────────────── */
function detectConflictMode(messages, sender) {
  const senderMsgs = messages.filter(m => m.sender === sender)
  const tags = senderMsgs.map(m => m.gottman_flag)

  const counts = { Criticism: 0, Contempt: 0, Defensiveness: 0, Stonewalling: 0, Neutral: 0 }
  for (const t of tags) counts[t] = (counts[t] || 0) + 1

  // Map Gottman patterns to TKI modes
  const competing = counts.Criticism * 2 + counts.Contempt * 1.5
  const avoiding = counts.Stonewalling * 2.5 + counts.Neutral * 0.5
  const accommodating = counts.Defensiveness * 1 + counts.Neutral * 1
  const compromising = counts.Neutral * 1.5
  const collaborating = counts.Neutral * 2

  const modes = { Competing: competing, Avoiding: avoiding, Accommodating: accommodating, Compromising: compromising, Collaborating: collaborating }
  const sorted = Object.entries(modes).sort((a, b) => b[1] - a[1])
  return sorted[0][0]
}

/* ── Tension score ───────────────────────────────────────────────── */
function calculateTension(messages) {
  let score = 30 // baseline

  for (const m of messages) {
    switch (m.gottman_flag) {
      case 'Contempt':      score += 12; break
      case 'Criticism':     score += 8; break
      case 'Defensiveness': score += 6; break
      case 'Stonewalling':  score += 10; break
      default:              score += 1; break
    }
  }

  // Cap at 99
  return Math.min(99, Math.max(5, score))
}

/* ── Main analysis pipeline ──────────────────────────────────────── */
function analyzeMessages(messages) {
  // Step 1: Detect Gottman + Ego State for each message
  const analyzed = messages.map((m, i) => {
    const gottman_flag = detectGottman(m.text)
    const ego_state = detectEgoState(m.text, gottman_flag)
    const hidden_meaning = getHiddenMeaning(gottman_flag, ego_state)

    return {
      id: i + 1,
      text: m.text,
      sender: m.sender,
      gottman_flag,
      ego_state,
      hidden_meaning,
    }
  })

  // Step 2: Per-person conflict mode
  const senders = [...new Set(messages.map(m => m.sender))]
  const modeA = detectConflictMode(analyzed, senders[0])
  const modeB = senders[1] ? detectConflictMode(analyzed, senders[1]) : 'Neutral'

  // Step 3: Overall tension
  const tension = calculateTension(analyzed)

  return {
    overall_tension_score: tension,
    conflict_mode: `${modeA} vs. ${modeB}`,
    sender_a: senders[0] || 'Person A',
    sender_b: senders[1] || 'Person B',
    messages: analyzed,
  }
}

/* ── Main export ─────────────────────────────────────────────────── */
export async function analyzeConversation(rawText) {
  const parsed = parseConversation(rawText)
  if (parsed.length === 0) {
    throw new Error('No messages detected. Try "Name: message" format, one per line.')
  }

  if (parsed.length < 2) {
    throw new Error('Need at least 2 messages to analyze a conversation.')
  }

  const anonymized = anonymize(parsed)

  // Simulate analysis time (feels more "real")
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 800))

  return analyzeMessages(anonymized)
}
