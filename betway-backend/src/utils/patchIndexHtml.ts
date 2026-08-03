/**
 * patchIndexHtml.ts
 *
 * Rewrites all external domain values inside `window.__NUXT__.config.public`
 * in www.betway.com.ng/index.html to point to the local backend.
 *
 * - Creates a .bak backup before any modification
 * - Never touches _nuxt/ asset references
 * - Is idempotent: running twice produces the same result
 */

import fs from 'fs'
import path from 'path'
import { config } from '../config'

// All the domain keys from window.__NUXT__.config.public that need rewriting,
// mapped to their local backend path equivalents.
const DOMAIN_MAP: Record<string, string> = {
  // Sports feed
  'https://feeds-roa2.betwayafrica.com/br/_apis/sport': `${config.BACKEND_URL}/br/_apis/sport`,
  // CMS / Kentico
  'https://cms1.betwayafrica.com':  `${config.BACKEND_URL}/cms`,
  'https//cms1.betwayafrica.com':   `${config.BACKEND_URL}/cms`,   // typo in original html
  // API domains
  'https://api.betwayafrica.com/api':       `${config.BACKEND_URL}/api`,
  'https://apic.betwayafrica.com/api':      `${config.BACKEND_URL}/apic`,
  'https://casinoapi.betwayafrica.com/api': `${config.BACKEND_URL}/casinoapi`,
  'https://casinoapic.betwayafrica.com/api':`${config.BACKEND_URL}/casinoapi`,
  'https://config.betwayafrica.com':        `${config.BACKEND_URL}/config`,
  'https://signalrapi.betwayafrica.com':    `${config.BACKEND_URL}/signalr`,
  'https://promoapi.betwayafrica.com':      `${config.BACKEND_URL}/promoapi`,
  // Betting
  'https://feeds-roa2.betwayafrica.com/br/_apis/public-hub': `${config.BACKEND_URL}/signalr`,
  // Misc external domains that the frontend hits
  'https://sports-client.betwayafrica.com': `${config.BACKEND_URL}/sports-client`,
  'https://loyalty-external.betwayafrica.com': `${config.BACKEND_URL}/loyalty`,
  'https://influencer-external-api.betwayafrica.com': `${config.BACKEND_URL}/influencer`,
  'https://media.betwayafrica.com/': `${config.BACKEND_URL}/media`,
  'https://jackpotza.ragingriver.io': `${config.BACKEND_URL}/jackpots-za`,
  'https://casinobonusing.betwayafrica.com/api/': `${config.BACKEND_URL}/casino-bonus`,
}

const INDEX_HTML = path.resolve(
  __dirname,
  '../../../www.betway.com.ng/index.html'
)

export function patchIndexHtml(): void {
  if (!fs.existsSync(INDEX_HTML)) {
    console.warn(`[patchIndexHtml] WARNING: index.html not found at ${INDEX_HTML} — skipping patch`)
    return
  }

  let html = fs.readFileSync(INDEX_HTML, 'utf8')

  // Check if already fully patched (idempotency guard)
  if (html.includes('"http://localhost:4000/br/_apis/sport"') && html.includes('id="local-overrides"') && html.includes('id="local-reg-bypass"')) {
    console.log('[patchIndexHtml] index.html already patched — skipping')
    return
  }

  // Write backup only if it doesn't already exist
  const bak = INDEX_HTML + '.bak'
  if (!fs.existsSync(bak)) {
    fs.writeFileSync(bak, html, 'utf8')
    console.log(`[patchIndexHtml] Backup written to ${bak}`)
  }

  // Extract just the window.__NUXT__ script block so we only replace inside it
  // and never touch _nuxt/ asset href/src attributes
  const NUXT_SCRIPT_RE = /(window\.__NUXT__\s*=\s*\{[\s\S]*?\}\s*<\/script>)/

  html = html.replace(NUXT_SCRIPT_RE, (scriptBlock) => {
    let patched = scriptBlock
    for (const [original, replacement] of Object.entries(DOMAIN_MAP)) {
      // Escape for use in a string-literal context inside JSON
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      patched = patched.replace(new RegExp(escaped, 'g'), replacement)
    }
    return patched
  })

  // ── Inject CSS to hide deposit/withdraw UI ──────────────────────────────────
  // The deposit UI is baked into minified JS — the only way to suppress it
  // without modifying _nuxt/ files is via a CSS override in the HTML.
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

  // ── Inject JS to bypass client-side registration validation ────────────────
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
  console.log('[patchIndexHtml] ✅  index.html patched — all API domains now point to', config.BACKEND_URL)
  console.log('[patchIndexHtml] ✅  Deposit/withdraw UI suppressed via CSS override')
}