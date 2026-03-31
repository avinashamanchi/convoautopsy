const W = 1080
const H = 1920
const PAD = 80
const CARD_PAD = 44

const TAG_COLORS = {
  Stonewalling:  { bg: 'rgba(248,113,113,0.15)', border: '#f87171', text: '#fca5a5' },
  Criticism:     { bg: 'rgba(251,191,36,0.12)', border: '#fbbf24', text: '#fde68a' },
  Contempt:      { bg: 'rgba(167,139,250,0.15)', border: '#a78bfa', text: '#ddd6fe' },
  Defensiveness: { bg: 'rgba(52,211,153,0.12)', border: '#34d399', text: '#6ee7b7' },
  Neutral:       { bg: 'rgba(255,255,255,0.05)', border: '#666', text: '#999' },
}

const EGO_COLORS = { Child: '#f472b6', Parent: '#fbbf24', Adult: '#34d399' }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function fillRR(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

function strokeRR(ctx, x, y, w, h, r, color, lw = 1) {
  roundRect(ctx, x, y, w, h, r)
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.stroke()
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (ctx.measureText(test).width > maxW) {
      if (cur) lines.push(cur)
      cur = w
    } else cur = test
  }
  if (cur) lines.push(cur)
  return lines
}

export function generateReceipt(data) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#08060e'
  ctx.fillRect(0, 0, W, H)

  // Gradient glow
  const g = ctx.createRadialGradient(W * 0.3, H * 0.12, 0, W * 0.3, H * 0.12, W * 0.7)
  g.addColorStop(0, 'rgba(124, 58, 237, 0.06)')
  g.addColorStop(1, 'transparent')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  let y = PAD

  // Title
  ctx.font = 'bold 28px "DM Sans", sans-serif'
  ctx.fillStyle = '#a78bfa'
  ctx.fillText('CONVOAUTOPSY', PAD, y + 28)
  y += 36

  ctx.font = '16px "DM Sans", sans-serif'
  ctx.fillStyle = 'rgba(238,237,242,0.28)'
  ctx.fillText('AI RELATIONSHIP DIAGNOSTICS', PAD, y + 20)
  y += 56

  // Divider
  ctx.strokeStyle = 'rgba(167,139,250,0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
  y += 36

  // Tension score
  const scoreColor = data.overall_tension_score >= 75 ? '#f87171'
    : data.overall_tension_score >= 50 ? '#fbbf24' : '#34d399'

  fillRR(ctx, PAD, y, W - PAD * 2, 180, 20, 'rgba(255,255,255,0.025)')
  strokeRR(ctx, PAD, y, W - PAD * 2, 180, 20, 'rgba(167,139,250,0.18)')

  ctx.font = 'bold 100px Georgia, serif'
  ctx.fillStyle = scoreColor
  ctx.fillText(String(data.overall_tension_score), PAD + CARD_PAD, y + 115)

  ctx.font = 'bold 15px "DM Sans", sans-serif'
  ctx.fillStyle = 'rgba(238,237,242,0.28)'
  ctx.fillText('TENSION SCORE', PAD + CARD_PAD, y + 150)

  const barW = W - PAD * 2 - CARD_PAD * 2
  fillRR(ctx, PAD + CARD_PAD, y + 162, barW, 5, 3, 'rgba(248,113,113,0.12)')
  fillRR(ctx, PAD + CARD_PAD, y + 162, barW * (data.overall_tension_score / 100), 5, 3, scoreColor)

  y += 204

  // Conflict mode
  const modeParts = data.conflict_mode?.split(/\s+vs\.?\s+/i) || ['?', '?']
  fillRR(ctx, PAD, y, W - PAD * 2, 90, 20, 'rgba(255,255,255,0.025)')
  strokeRR(ctx, PAD, y, W - PAD * 2, 90, 20, 'rgba(167,139,250,0.18)')

  ctx.font = 'bold 22px "DM Sans", sans-serif'
  const p1W = ctx.measureText(modeParts[0]).width + 32
  fillRR(ctx, PAD + CARD_PAD, y + 22, p1W, 38, 19, 'rgba(248,113,113,0.12)')
  ctx.fillStyle = '#fca5a5'
  ctx.fillText(modeParts[0], PAD + CARD_PAD + 16, y + 48)

  ctx.font = '16px "DM Sans", sans-serif'
  ctx.fillStyle = 'rgba(238,237,242,0.28)'
  ctx.fillText('vs', PAD + CARD_PAD + p1W + 14, y + 48)

  ctx.font = 'bold 22px "DM Sans", sans-serif'
  const p2X = PAD + CARD_PAD + p1W + 44
  const p2W = ctx.measureText(modeParts[1] || '?').width + 32
  fillRR(ctx, p2X, y + 22, p2W, 38, 19, 'rgba(167,139,250,0.12)')
  ctx.fillStyle = '#c4b5fd'
  ctx.fillText(modeParts[1] || '?', p2X + 16, y + 48)

  ctx.font = 'bold 13px "DM Sans", sans-serif'
  ctx.fillStyle = 'rgba(238,237,242,0.28)'
  ctx.fillText('CONFLICT MODE · TKI', PAD + CARD_PAD, y + 78)

  y += 116

  // Messages (fit up to 4)
  const maxMsgs = Math.min(data.messages.length, 4)
  for (let i = 0; i < maxMsgs; i++) {
    const msg = data.messages[i]
    const tc = TAG_COLORS[msg.gottman_flag] || TAG_COLORS.Neutral

    ctx.font = 'italic 22px "DM Sans", sans-serif'
    const textLines = wrapText(ctx, `"${msg.text}"`, W - PAD * 2 - CARD_PAD * 2)
    ctx.font = 'italic 18px "DM Sans", sans-serif'
    const hiddenLines = wrapText(ctx, msg.hidden_meaning, W - PAD * 2 - CARD_PAD * 2)
    const cardH = 56 + textLines.length * 30 + 46 + hiddenLines.length * 24 + 20

    if (y + cardH > H - 100) break

    fillRR(ctx, PAD, y, W - PAD * 2, cardH, 16, tc.bg)
    strokeRR(ctx, PAD, y, W - PAD * 2, cardH, 16, tc.border + '44')

    ctx.font = 'bold 14px "DM Sans", sans-serif'
    ctx.fillStyle = 'rgba(238,237,242,0.28)'
    ctx.fillText(msg.sender.toUpperCase(), PAD + CARD_PAD, y + 30)

    ctx.font = 'italic 22px "DM Sans", sans-serif'
    ctx.fillStyle = 'rgba(240,239,244,0.85)'
    let ly = y + 58
    for (const l of textLines) { ctx.fillText(l, PAD + CARD_PAD, ly); ly += 30 }

    ctx.font = 'bold 16px "DM Sans", sans-serif'
    ctx.fillStyle = tc.text
    ctx.fillText(msg.gottman_flag, PAD + CARD_PAD, ly + 10)
    const twid = ctx.measureText(msg.gottman_flag).width
    ctx.fillStyle = EGO_COLORS[msg.ego_state] || '#34d399'
    ctx.font = '16px "DM Sans", sans-serif'
    ctx.fillText(`${msg.ego_state} state`, PAD + CARD_PAD + twid + 20, ly + 10)

    const hy = ly + 36
    ctx.font = 'bold 11px "DM Sans", sans-serif'
    ctx.fillStyle = 'rgba(238,237,242,0.28)'
    ctx.fillText('HIDDEN MEANING', PAD + CARD_PAD, hy)

    ctx.font = 'italic 17px "DM Sans", sans-serif'
    ctx.fillStyle = 'rgba(240,239,244,0.45)'
    let hmy = hy + 22
    for (const l of hiddenLines) { ctx.fillText(l, PAD + CARD_PAD, hmy); hmy += 24 }

    y += cardH + 14
  }

  if (data.messages.length > maxMsgs) {
    ctx.font = '16px "DM Sans", sans-serif'
    ctx.fillStyle = 'rgba(238,237,242,0.28)'
    const mt = `+ ${data.messages.length - maxMsgs} more messages analyzed`
    ctx.fillText(mt, (W - ctx.measureText(mt).width) / 2, y + 20)
  }

  // Footer
  ctx.strokeStyle = 'rgba(167,139,250,0.18)'
  ctx.beginPath()
  ctx.moveTo(PAD, H - 80)
  ctx.lineTo(W - PAD, H - 80)
  ctx.stroke()

  ctx.font = '15px "DM Sans", sans-serif'
  ctx.fillStyle = 'rgba(238,237,242,0.28)'
  ctx.textAlign = 'left'
  ctx.fillText('convoautopsy.app', PAD, H - 48)
  ctx.textAlign = 'right'
  ctx.fillText('powered by claude + gottman', W - PAD, H - 48)
  ctx.textAlign = 'left'

  return canvas
}

export function downloadReceipt(data) {
  const canvas = generateReceipt(data)
  const link = document.createElement('a')
  link.download = `convo-autopsy-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}
