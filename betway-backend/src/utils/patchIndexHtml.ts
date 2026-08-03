/**
 * patchIndexHtml.ts
 *
 * Rewrites all external domain values inside `window.__NUXT__.config.public`
 * in www.betway.com.ng/index.html to point to the local/Render backend.
 *
 * - Creates a .bak backup before any modification
 * - Always re-patches on startup so Render URL is always current
 */

import fs from 'fs'
import path from 'path'
import { config } from '../config'

const INDEX_HTML = path.resolve(
  __dirname,
  '../../../www.betway.com.ng/index.html'
)

function buildDomainMap(backendUrl: string): Record<string, string> {
  return {
    'https://feeds-roa2.betwayafrica.com/br/_apis/sport': `${backendUrl}/br/_apis/sport`,
    'https://cms1.betwayafrica.com':  `${backendUrl}/cms`,
    'https//cms1.betwayafrica.com':   `${backendUrl}/cms`,
    'https://api.betwayafrica.com/api':       `${backendUrl}/api`,
    'https://apic.betwayafrica.com/api':      `${backendUrl}/apic`,
    'https://casinoapi.betwayafrica.com/api': `${backendUrl}/casinoapi`,
    'https://casinoapic.betwayafrica.com/api':`${backendUrl}/casinoapi`,
    'https://config.betwayafrica.com':        `${backendUrl}/config`,
    'https://signalrapi.betwayafrica.com':    `${backendUrl}/signalr`,
    'https://promoapi.betwayafrica.com':      `${backendUrl}/promoapi`,
    'https://feeds-roa2.betwayafrica.com/br/_apis/public-hub': `${backendUrl}/signalr`,
    'https://sports-client.betwayafrica.com': `${backendUrl}/sports-client`,
    'https://loyalty-external.betwayafrica.com': `${backendUrl}/loyalty`,
    'https://influencer-external-api.betwayafrica.com': `${backendUrl}/influencer`,
    'https://media.betwayafrica.com/': `${backendUrl}/media`,
    'https://jackpotza.ragingriver.io': `${backendUrl}/jackpots-za`,
    'https://casinobonusing.betwayafrica.com/api/': `${backendUrl}/casino-bonus`,
  }
}

export function patchIndexHtml(force = false): void {
  if (!fs.existsSync(INDEX_HTML)) {
    console.warn(`[patchIndexHtml] WARNING: index.html not found at ${INDEX_HTML} — skipping patch`)
    return
  }

  // Build domain map fresh every time so RENDER_EXTERNAL_URL is always used
  const backendUrl = config.BACKEND_URL
  const DOMAIN_MAP = buildDomainMap(backendUrl)

  const bak = INDEX_HTML + '.bak'

  // Always restore from backup first so we patch against the original
  if (fs.existsSync(bak)) {
    const original = fs.readFileSync(bak, 'utf8')
    // Check if already patched with the CURRENT url
    const alreadyPatched = original.includes('id="local-overrides"')
      ? false  // backup is clean original, always re-patch from it
      : false
    // Restore clean original before patching
    fs.writeFileSync(INDEX_HTML, original, 'utf8')
    console.log(`[patchIndexHtml] Restored clean original, patching for: ${backendUrl}`)
  } else {
    // First run — save backup of original
    fs.writeFileSync(bak, fs.readFileSync(INDEX_HTML, 'utf8'), 'utf8')
    console.log(`[patchIndexHtml] Backup written to ${bak}`)
  }

  let html = fs.readFileSync(INDEX_HTML, 'utf8')

  // Rewrite domains inside window.__NUXT__ block only
  const NUXT_SCRIPT_RE = /(window\.__NUXT__\s*=\s*\{[\s\S]*?\}\s*<\/script>)/
  html = html.replace(NUXT_SCRIPT_RE, (scriptBlock) => {
    let patched = scriptBlock
    for (const [original, replacement] of Object.entries(DOMAIN_MAP)) {
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      patched = patched.replace(new RegExp(escaped, 'g'), replacement)
    }
    return patched
  })

  // ── Inject CSS to hide deposit/withdraw UI ────────────────────────────────
  const DEPOSIT_HIDE_CSS = [
    '<style id="local-overrides">',
    '/* Hide deposit & withdrawal UI — feature disabled in local mode */',
    '[href*="account=deposit"],[href*="account=withdraw"],',
    '[href*="banking=quick-deposit"],[href*="banking=deposit"],',
    '[data-testid="deposit-button"],[data-testid="quick-deposit"],',
    '.deposit-btn,.quick-deposit,.withdraw-btn,',
    '[class*="QuickDeposit"],[class*="quick-deposit"],',
    '[id*="deposit"],[id*="withdraw"],',
    'a[href$="deposit"],button[data-action="deposit"] {',
    '  display: none !important;',
    '}',
    '</style>',
  ].join('\n')

  if (!html.includes('id="local-overrides"')) {
    html = html.replace('</head>', `${DEPOSIT_HIDE_CSS}\n</head>`)
  }

  // ── Inject JS to bypass client-side registration validation ──────────────
  const REG_BYPASS_JS = `<script id="local-reg-bypass">
(function() {
  var STUB = ['doesUsername','doesEmail','doesMobile','doesUser','CheckMobile','ValidateMobile'];
  var SAVE = ['authenticate','Users/Register'];
  function matchAny(u, list) { for(var i=0;i<list.length;i++){if(u.indexOf(list[i])>=0)return true;} return false; }
  function saveUser(data) {
    try {
      if (data && (data.access_token || data.token || data.userId || data.id)) {
        localStorage.setItem('bw_user', JSON.stringify({
          userId: data.userId||data.id||'', username: data.username||'',
          email: data.email||'', firstName: data.firstName||'',
          lastName: data.lastName||'', mobileNumber: data.mobileNumber||'',
          countryCode: data.countryCode||'', currencyCode: data.currencyCode||'',
          token: data.access_token||data.token||'', loggedIn: true,
          savedAt: new Date().toISOString()
        }));
      }
    } catch(e) {}
  }
  var _fetch = window.fetch;
  window.fetch = function(url, opts) {
    var u = typeof url==='string' ? url : (url&&url.url ? url.url : String(url));
    if (matchAny(u, STUB)) {
      return Promise.resolve(new Response('false', {status:200, headers:{'Content-Type':'application/json'}}));
    }
    return _fetch.apply(this, arguments).then(function(res) {
      if (matchAny(u, SAVE)) { res.clone().json().then(saveUser).catch(function(){}); }
      return res;
    });
  };
  var _xopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, url) { this._su = url||''; return _xopen.apply(this,arguments); };
  var _xsend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    if (matchAny(this._su||'', STUB)) {
      var self = this;
      setTimeout(function() {
        Object.defineProperty(self,'readyState',{get:function(){return 4;},configurable:true});
        Object.defineProperty(self,'status',{get:function(){return 200;},configurable:true});
        Object.defineProperty(self,'responseText',{get:function(){return 'false';},configurable:true});
        if(self.onreadystatechange) self.onreadystatechange();
        if(self.onload) self.onload();
      }, 5);
      return;
    }
    return _xsend.apply(this, arguments);
  };
})();
</script>`

  if (!html.includes('id="local-reg-bypass"')) {
    html = html.replace('</head>', `${REG_BYPASS_JS}\n</head>`)
  }

  fs.writeFileSync(INDEX_HTML, html, 'utf8')
  console.log('[patchIndexHtml] ✅  index.html patched — all API domains now point to', backendUrl)
  console.log('[patchIndexHtml] ✅  Deposit/withdraw UI suppressed via CSS override')
}