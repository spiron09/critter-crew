// Pixel critters and the SVG cards they live on. Pure strings: no `$` here.

import type { Agent } from '../types'


type Critter = {
  key: string
  name: string
  color: string // the critter's own colour: chip, bar, live dot
  verb: string // how it says it finished: 'Sniffed it out'
  rows: string[]
  map: Record<string, string>
}

// Identity colours: a pastel set (saturation +35% in OKLCH) for the dark card, in hire order. Checked
// with the dataviz validator on #262624: neighbours distinct (normal-vision >= 15,
// CVD >= 8), all readable (>= 3:1). Lighter and softer than a chart band by design.
// Legend: b body, f face/belly, x accent, e eye (blinks), k ink, y beak, c cheek,
// A/B the two feet (they step in turn while the critter works).
const INK = '#2B2622'
export const CRITTERS: Critter[] = [
  {
    key: 'cat',
    verb: 'Pounced on it',
    name: 'Cat',
    color: '#9BB6FF',
    map: { b: '#8FB4D9', f: '#EAF2FA', x: '#F2A7B8', e: INK, k: INK, A: '#5F86AD', B: '#5F86AD' },
    rows: [
      'b..........b',
      'bx........xb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbebbbbbbebb',
      'bbbbbkkbbbbb',
      '.bbbbbbbbbb.',
      '..bffffffb..',
      '..bffffffb..',
      '..bbbbbbbb..',
      '..AA....BB..',
    ],
  },
  {
    key: 'fox',
    verb: 'Sniffed it out',
    name: 'Fox',
    color: '#F5C94C',
    map: { b: '#F2994A', f: '#FFF3E3', x: '#5A3A28', e: INK, k: INK, A: '#5A3A28', B: '#5A3A28' },
    rows: [
      '.x........x.',
      '.bb......bb.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbebbbbbbebb',
      'bffbbbbbbffb',
      '.ffffkkffff.',
      '..ffffffff..',
      '..bbbbbbbb..',
      '..bbbbbbbb..',
      '..AA....BB..',
    ],
  },
  {
    key: 'bunny',
    verb: 'Bounced through it',
    name: 'Bunny',
    color: '#FE98C5',
    map: { b: '#F7B2CF', f: '#FFFFFF', x: '#E86FA0', e: INK, k: INK, c: '#F48FB8', A: '#E86FA0', B: '#E86FA0' },
    rows: [
      '..bb....bb..',
      '..bx....xb..',
      '..bx....xb..',
      '.bbbbbbbbbb.',
      'bbebbbbbbebb',
      'bcbbbkkbbbcb',
      '.bbbbbbbbbb.',
      '..bffffffb..',
      '..bffffffb..',
      '..bbbbbbbb..',
      '..AA....BB..',
    ],
  },
  {
    key: 'panda',
    verb: 'Munched through it',
    name: 'Panda',
    color: '#ACE073',
    map: { b: '#F4F4F2', x: '#33363D', e: '#FFFFFF', k: INK, A: '#33363D', B: '#33363D' },
    rows: [
      '.xx......xx.',
      '.xx......xx.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bxebbbbbbexb',
      'bxxbbbbbbxxb',
      '.bbbbkkbbbb.',
      '..bbbbbbbb..',
      '..xxxxxxxx..',
      '..xxxxxxxx..',
      '..AA....BB..',
    ],
  },
  {
    key: 'owl',
    verb: 'Figured it out',
    name: 'Owl',
    color: '#CDAEFF',
    map: { b: '#9B7EDE', f: '#EDE7FB', x: '#6B4FBB', e: INK, y: '#F2C94C', A: '#F2C94C', B: '#F2C94C' },
    rows: [
      '.x........x.',
      '.xb......bx.',
      '.bbbbbbbbbb.',
      'bffffbbffffb',
      'bfeffbbfeffb',
      'bffffyyffffb',
      '.bbbbyybbbb.',
      '..bffffffb..',
      '..bffffffb..',
      '..bbbbbbbb..',
      '..AA....BB..',
    ],
  },
  {
    key: 'frog',
    verb: 'Hopped through it',
    name: 'Frog',
    color: '#74DFBD',
    map: { b: '#6FCF97', f: '#D8F5E3', x: '#FFFFFF', e: INK, k: '#2F7A4D', A: '#3FAE6A', B: '#3FAE6A' },
    rows: [
      '.xxx....xxx.',
      '.xex....xex.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bkbbbbbbbbkb',
      '.bkkkkkkkkb.',
      '..ffffffff..',
      '..bffffffb..',
      '..bbbbbbbb..',
      '..AA....BB..',
    ],
  },
]

// Claude itself: a pixel spark in Claude's colour that turns while it thinks.
const SPARK: Critter = {
  key: 'claude',
  verb: 'Wrapped it up',
  name: 'Claude',
  color: '#F1A180', // pastel clay, a touch more saturated
  map: { s: '#D97757' },
  rows: [
    '............',
    '.....ss.....',
    '.....ss.....',
    '....ssss....',
    '..ssssssss..',
    '.ssssssssss.',
    '..ssssssss..',
    '....ssss....',
    '.....ss.....',
    '.....ss.....',
    '............',
  ],
}

export const critterOf = (key: string): Critter =>
  key === 'claude' ? SPARK : (CRITTERS.find(c => c.key === key) ?? CRITTERS[0]!)

// Motion, all CSS on transform and opacity (compositor-only). The app
// re-creates these images on every redraw, once a second while anyone works,
// which restarts each animation. So every loop is one second long and rests,
// at zero velocity, on its first and last frame: a restart lands on the very
// frame the loop was about to show, and can't be seen.
const EASE_IN_OUT = 'cubic-bezier(.77,0,.175,1)'
const SINE = 'cubic-bezier(.37,0,.63,1)' // easeInOutSine: a soft, breathing bob
const CSS = `<style>
.trk{stroke:#E7E3DD}.ring{stroke:#FFFFFF}
@media (prefers-color-scheme: dark){.trk{stroke:#3A3733}.ring{stroke:#1E1D1B}}
.go .fa,.go .fb,.go .bd,.eye,.ping{transform-box:fill-box;transform-origin:center}
.go .bd{animation:bob-a 1s ${SINE} infinite}
.go .fa{animation:foot-1 1s ${SINE} infinite}.go .fb{animation:foot-2 1s ${SINE} infinite}
.alt.go .bd{animation-name:bob-b}
.zz .eye{transform:scaleY(.34)}
.breathe{animation:breathe 1s ${SINE} infinite}
.ping{animation:ping 1s ${EASE_IN_OUT} infinite}
@keyframes bob-a{0%,50%,100%{transform:translateY(0)}25%{transform:translateY(-1.2px)}}
@keyframes bob-b{0%,50%,100%{transform:translateY(0)}75%{transform:translateY(-1.2px)}}
@keyframes foot-1{0%,50%,100%{transform:translateY(0)}25%{transform:translateY(-.8px)}}
@keyframes foot-2{0%,50%,100%{transform:translateY(0)}75%{transform:translateY(-.8px)}}
@keyframes breathe{0%,100%{opacity:1}50%{opacity:.82}}
@keyframes ping{0%{transform:scale(1);opacity:0}15%{opacity:.45}85%,100%{transform:scale(2.1);opacity:0}}
@media (prefers-reduced-motion: reduce){
.go .fa,.go .fb,.go .bd{animation:none}
.ping{animation:fade 1s ${SINE} infinite}
@keyframes fade{0%,100%{opacity:0}50%{opacity:.3}}
}
</style>`

// Half the crew bobs on the first beat, half on the second, so a row of
// critters never moves in lockstep; both phases still rest on the redraw.
const isAlt = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 2 === 1
}

/** A critter at (x, y), `px` CSS px per pixel: walking, asleep, resting or greyed out. */
function sprite(key: string, x: number, y: number, mood: Mood, px: number, id = ''): string {
  const c = critterOf(key)
  const groups: Record<string, string[]> = { bd: [], fa: [], fb: [], eye: [] }
  c.rows.forEach((row, ry) =>
    [...row].forEach((ch, rx) => {
      const fill = c.map[ch]
      if (!fill) return
      const g = ch === 'A' ? 'fa' : ch === 'B' ? 'fb' : ch === 'e' ? 'eye' : 'bd'
      groups[g]!.push(`<rect x="${rx * px}" y="${ry * px}" width="${px}" height="${px}" fill="${fill}"/>`)
    }),
  )
  const isSpark = c.key === 'claude'
  const cls = mood === 'go' && !isSpark ? `go${isAlt(id) ? ' alt' : ''}` : mood === 'zz' ? 'zz' : ''
  const sad = mood === 'sad' ? ' style="filter:grayscale(1)" opacity=".5"' : ''
  const inner = isSpark
    ? `<g class="${mood === 'go' ? 'breathe' : ''}">${groups.bd!.join('')}</g>`
    : `<g class="bd">${groups.bd!.join('')}<g class="eye">${groups.eye!.join('')}</g></g><g class="fa">${groups.fa!.join('')}</g><g class="fb">${groups.fb!.join('')}</g>`
  return `<g transform="translate(${x},${y})" class="${cls}"${sad}>${inner}</g>`
}

export type Mood = 'go' | 'zz' | 'rest' | 'sad'

export const moodOf = (a: Agent): Mood =>
  a.state === 'working' ? 'go' : a.state === 'failed' ? 'sad' : a.state === 'done' || a.state === 'stopped' ? 'zz' : 'rest'

// A turn does not report its model's window: 200k, unless the model says 1M
// or the context has already outgrown 200k, which only a 1M window allows.
const windowOf = (m: string, used: number) => (m.includes('[1m]') || used > 200_000 ? 1_000_000 : 200_000)
export const contextOf = (a: Agent) => (a.context ? Math.min(1, a.context / windowOf(a.model, a.context)) : 0)

export const AVATAR = 56

/**
 * The avatar: the critter on a soft disc in its colour, a ring that fills with
 * the agent's context, and a corner badge for its state. No text inside, so
 * nothing here depends on fonts, and a fixed size, so nothing gets rescaled.
 */
export function avatarSvg(a: Agent, size = AVATAR, isFaded = false): string {
  const c = critterOf(a.critter)
  const s = size / AVATAR
  const mid = size / 2
  const r = 25.5 * s
  const circ = 2 * Math.PI * r
  const fill = contextOf(a)
  const live = a.state === 'working'
  // 2.5px per sprite pixel leaves room around the critter inside its disc.
  const px = 2.5 * s
  const spriteW = 12 * px
  const spriteH = c.rows.length * px
  // The badge keeps a readable size on small avatars (k never below .62).
  const k = Math.max(s, 0.62)
  const bx = size - 8 * k
  const badge = live
    ? `<circle class="ping" cx="${bx}" cy="${bx}" r="${4 * k}" fill="${c.color}"/><circle class="ring" cx="${bx}" cy="${bx}" r="${6.5 * k}" stroke-width="${2.2 * k}" fill="${c.color}"/><circle cx="${bx}" cy="${bx}" r="${2.4 * k}" fill="#FFFFFF"/>`
    : a.state === 'failed'
      ? `<circle class="ring" cx="${bx}" cy="${bx}" r="${5.5 * k}" stroke-width="${2.2 * k}" fill="#D64545"/>`
      : '' // Finished needs no mark: the critter sleeps and the card says so.
  const ring =
    size < 40
      ? ''
      : `<circle class="trk" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${2.5 * s}"/>
${fill > 0 ? `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${c.color}" stroke-width="${2.5 * s}" stroke-linecap="round" stroke-dasharray="${(circ * fill).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${mid} ${mid})" opacity="${live ? 1 : 0.45}"/>` : ''}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"${isFaded ? ' opacity=".45"' : ''}>${CSS}
<circle cx="${mid}" cy="${mid}" r="${21.5 * s}" fill="${c.color}" opacity="${a.state === 'failed' ? 0.08 : 0.16}"/>
${ring}
${sprite(a.critter, mid - spriteW / 2, mid - spriteH / 2 + 0.5 * s, moodOf(a), px, a.id)}
${badge}
</svg>`
}

export const elapsed = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`
}

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`

export const modelName = (m: string) => {
  const s = m.toLowerCase()
  for (const n of ['opus', 'sonnet', 'haiku', 'fable']) if (s.includes(n)) return n[0]!.toUpperCase() + n.slice(1)
  return m ? m.replace(/^claude-/, '') : ''
}

export const BAR_W = 1000

/**
 * The crew's progress as one continuous line across the band: each finished
 * helper adds a block in its own colour, the rest is a quiet track. Drawn on a
 * wide canvas with no fixed width, so the band stretches it edge to edge.
 */
export function crewBarSvg(helpers: Agent[], H = 4): string {
  // One equal step per helper, even gaps: finished steps take the helper's
  // colour in the order they finished; the rest stay as quiet track.
  const n = Math.max(1, helpers.length)
  const gap = n > 1 ? 6 : 0
  const step = (BAR_W - gap * (n - 1)) / n
  const done = helpers.filter(a => a.state !== 'working').sort((x, y) => (x.endedAt ?? 0) - (y.endedAt ?? 0))
  const steps = Array.from({ length: n }, (_, i) => {
    const a = done[i]
    const x = (i * (step + gap)).toFixed(1)
    const fill = !a ? '' : a.state === 'failed' ? ' fill="#C9534A"' : ` fill="${critterOf(a.critter).color}"`
    return `<rect${a ? '' : ' class="trk-f"'} x="${x}" y="0" width="${step.toFixed(1)}" height="${H}" rx="${H / 2}"${fill}/>`
  }).join('')
  // Static on purpose: the band redraws often and would replay any motion.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_W}" height="${H}" viewBox="0 0 ${BAR_W} ${H}" preserveAspectRatio="none"><style>
.trk-f{fill:#E9E5DF}@media (prefers-color-scheme: dark){.trk-f{fill:#3A3733}}
</style>${steps}</svg>`
}

/**
 * A softer shade of a critter colour: blended toward a warm grey, so the
 * family stays recognisable while each step reads quieter. 0 = the colour.
 */
export function shade(hex: string, amount: number): string {
  const to = [0x9a, 0x95, 0x8f]
  const from = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const mixed = from.map((c, i) => Math.round(c + (to[i]! - c) * amount))
  return `#${mixed.map(c => c.toString(16).padStart(2, '0')).join('')}`
}
