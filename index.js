/* WATCHDOG — independent of the main script below */
    window.__corehzBooted = false;
    setTimeout(function () {
      if (window.__corehzBooted) return;
      var b = document.createElement("div");
      b.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10001;background:#16161b;border:1px solid rgba(255,255,255,0.17);color:#f4f4f5;font:12.5px/1.5 Arial,sans-serif;padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.5);text-align:center;max-width:88vw";
      b.innerHTML = "<b>coreHZ loaded an out-of-date copy.</b><br>Hold Ctrl and Shift, and press R to refresh.";
      (document.body || document.documentElement).appendChild(b);
    }, 2500);

"use strict";

/* ============================================================
   ROUTING LAYER
   - Routes are fetched from the public routing file and decoded
     only when a launch is requested.
   ============================================================ */
const ROUTE_SOURCES = [
  "https://cdn.jsdelivr.net/gh/dobberr/cfg@main/r.txt",
  "https://raw.githubusercontent.com/dobberr/cfg/main/r.txt",
  "https://raw.githack.com/dobberr/cfg/main/r.txt",
  "https://cdn.statically.io/gh/dobberr/cfg/main/r.txt"
];
const ROUTES_CACHE = "corehz.routes.cache.v4";

let routesData = null;
let routesPromise = null;

function parseRoutes(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e <= s) throw new Error("Malformed routing file");

  const raw = JSON.parse(text.slice(s, e + 1));
  const out = {};

  for (const k in raw) {
    let url;
    try {
      url = atob(raw[k]);
    } catch (_) {
      throw new Error("Routing entry not decodable: " + k);
    }

    if (!/^https:\/\//.test(url)) {
      throw new Error("Routing entry invalid: " + k);
    }

    out[k] = url;
  }

  if (!Object.keys(out).length) {
    throw new Error("Routing file empty");
  }

  return out;
}

function getRoutes() {
  if (routesData) return Promise.resolve(routesData);
  if (routesPromise) return routesPromise;
  routesPromise = (async () => {
    for (const url of ROUTE_SOURCES) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = await res.text();
        if (text.length < 20 || !text.includes("{") || !text.includes("}")) throw new Error("Unexpected response");
        const parsed = parseRoutes(text);
        routesData = parsed;
        try { localStorage.setItem(ROUTES_CACHE, text); } catch (_) {}
        return parsed;
      } catch (e) {
        console.warn("[coreHZ] route source failed (" + (e && e.message ? e.message : e) + ")");
      }
    }
    // Every source unreachable: last cached copy keeps launches working
    try {
      const cached = localStorage.getItem(ROUTES_CACHE);
      if (cached && cached.includes("{") && cached.includes("}")) {
        routesData = parseRoutes(cached);
        return routesData;
      }
    } catch (_) {}
    throw new Error("Routing file unreachable");
  })().catch(e => { routesPromise = null; throw e; });
  return routesPromise;
}

/* ============================================================
   POPUP SPOOFING
   ============================================================ */
const SPOOF_OPTIONS = [
  { title: "Google", icon: "https://www.google.com/favicon.ico" },
  { title: "Google Classroom", icon: "https://www.gstatic.com/classroom/favicon.png" },
  { title: "Google Drive", icon: "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" },
  { title: "Google Docs", icon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon-2023q4.ico" }
];

const WINDOW_FEATURES = "width=" + screen.width + ",height=" + screen.height +
  ",menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes,popup=yes";

function applySpoof(targetDoc, spoof) {
  targetDoc.title = spoof.title;
  var link = targetDoc.querySelector("link[rel~='icon']");
  if (!link) { link = targetDoc.createElement('link'); link.rel = 'icon'; targetDoc.head.appendChild(link); }
  link.href = spoof.icon;
}

function pickSpoof() {
  return SPOOF_OPTIONS[Math.floor(Math.random() * SPOOF_OPTIONS.length)];
}

function keepSpoofed(d, spoof) {
  applySpoof(d, spoof);
  var t = setInterval(function () {
    try { applySpoof(d, spoof); } catch (e) { clearInterval(t); }
  }, 500);
}

/* ============================================================
   MODAL CHOREOGRAPHY
   ============================================================ */
function closeModal(id) {
  var m = document.getElementById(id);
  if (!m) return;
  m.classList.add("closing");
  m.addEventListener("animationend", function (e) {
    if (e.target === m) m.remove();
  }, { once: true });
}

/* ============================================================
   LAUNCHERS — routes fetched on demand, decoded in memory only
   ============================================================ */
async function resolveRoute(app) {
  let routes;
  try {
    routes = await getRoutes();
  } catch (e) {
    alert("coreHZ couldn't load its routing file from any source.\n\n" +
          "Check your connection and try again. Details are in the console (F12).");
    return null;
  }
  if (!routes[app]) {
    alert("coreHZ's routing file doesn't include this app.\n\n" +
          "Check r.txt in the routing repo includes a \"" + app + "\" entry.");
    return null;
  }
  return routes[app];
}

function launchWithSpoof(url, showNoticeBanner = false) {
  var win = window.open("about:blank", "_blank", WINDOW_FEATURES);
  if (!win) { alert("Please allow popups."); return; }

  var d = win.document;
  d.open();
  d.write(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#000;overflow:hidden;width:100vw;height:100vh;"></body></html>`);
  d.close();

  // Native "Leave site?" confirmation when this popup is closed or
  // reloaded. Chrome/Edge only arm it after the user interacts with
  // the window (clicking inside the app counts); the message text is
  // browser-controlled and cannot be customized.
  d.addEventListener("beforeunload", function (e) {
    e.preventDefault();
    e.returnValue = ""; // required for Chrome/Edge to show the dialog
  });

  keepSpoofed(d, pickSpoof());

  var frame = d.createElement('iframe');
  frame.src = url;
  frame.style.width = "100vw";
  frame.style.height = "100vh";
  frame.style.border = "none";
  frame.style.display = "block";
  frame.setAttribute("allow", "fullscreen; pointer-lock; gamepad; keyboard-map; clipboard-read; clipboard-write; camera; microphone");
  frame.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock");
  frame.setAttribute("allowfullscreen", "true");
  d.body.appendChild(frame);

  if (showNoticeBanner) {
    var banner = d.createElement('div');
    banner.style.cssText = "position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 999999; width: 90%; max-width: 480px; background: rgba(69, 26, 3, 0.9); border: 1px solid rgba(245, 158, 11, 0.3); color: #fde68a; backdrop-filter: blur(8px); padding: 16px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); display: flex; align-items: flex-start; gap: 12px; font-family: sans-serif; opacity: 0; transition: opacity 0.5s ease; box-sizing: border-box;";
    banner.innerHTML = `
      <svg style="width: 20px; height: 20px; color: #fbbf24; flex-shrink: 0; margin-top: 2px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div style="flex: 1; font-size: 13px; line-height: 1.5; min-w-0;">
        <strong style="display: block; color: #fcd34d; margin-bottom: 4px; font-size: 14px;">Account Inactivity Notice</strong>
        To keep Slate completely free for active users, any accounts left inactive for 3+ months are automatically deleted to free up system space. You can always remake an account if yours gets removed.
      </div>
      <button style="background: transparent; border: none; color: rgba(251, 191, 36, 0.6); font-size: 22px; cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0;" onmouseover="this.style.color='#fde68a'" onmouseout="this.style.color='rgba(251, 191, 36, 0.6)'">&times;</button>
    `;
    d.body.appendChild(banner);

    var closeBtn = banner.querySelector('button');
    var timeoutId;
    function closeBanner() {
      banner.style.opacity = '0';
      setTimeout(() => { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 500);
      clearTimeout(timeoutId);
    }
    closeBtn.onclick = closeBanner;
    setTimeout(() => { banner.style.opacity = '1'; }, 100);
    timeoutId = setTimeout(closeBanner, 20000);
  }
}

function openSlateLegalDocs() {
  var existingModal = document.getElementById('slate-privacy-modal');
  if (existingModal) existingModal.remove();

  var modal = document.createElement('div');
  modal.id = "slate-privacy-modal";
  modal.className = "modal-backdrop";
  modal.style = "position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 16px; font-family: 'Ubuntu', Arial, sans-serif; backdrop-filter: blur(4px); box-sizing: border-box;";
  modal.innerHTML = `
    <div class="modal-card" style="background: #0e0e13; border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 22px; width: 100%; max-width: 600px; color: #f4f4f5; box-shadow: 0 24px 60px rgba(0,0,0,0.55); max-height: 85vh; overflow-y: auto; box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px;">
        <h2 style="font-size: 18px; font-weight: 700; font-family: 'Ubuntu', sans-serif; letter-spacing: -0.01em; margin: 0;">Slate Legal Agreements</h2>
        <button onclick="closeModal('slate-privacy-modal')" style="background: transparent; border: none; color: #a1a1aa; font-size: 24px; cursor: pointer; line-height: 1; padding: 0;">&times;</button>
      </div>

      <div style="font-size: 13px; line-height: 1.6; color: #a1a1aa;">
        <p style="margin-bottom: 16px;">Last Updated: 26 June 2026. By accessing and using the Slate AI platform (the "Service"), managed by the Slate operations team ("we", "us", or "our"), you agree to be legally bound by these Terms of Service and Privacy Policy.</p>

        <h3 style="font-size: 14px; font-weight: 700; color: #ffffff; margin: 24px 0 10px 0; border-left: 2px solid #38a7ff; padding-left: 8px;">Part 1: Terms of Service</h3>

        <h4 style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; margin: 0 0 4px 0;">1.1 Acceptance and Capacity</h4>
        <p style="margin-bottom: 12px;">By interacting with the Service, you confirm you have read, understood, and agreed to these Terms. If you are under the age of 18, you confirm that you have obtained the consent of a parent or legal guardian to access and use the Service.</p>

        <h4 style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; margin: 0 0 4px 0;">1.2 Acceptable Use</h4>
        <p style="margin-bottom: 12px;">You assume complete and sole responsibility for all content, prompts, and instructions you submit to the Service. You explicitly agree not to use the Service to generate malicious text, distribute malware, engage in harassment, perform illegal activities, or attempt to systematically abuse backend resource allocations.</p>

        <h4 style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; margin: 0 0 4px 0;">1.3 Limitation of Liability</h4>
        <p style="margin-bottom: 12px;">To the maximum extent permitted under UK law, we offer the Service strictly on an "as-is" and "as-available" basis without warranties of any kind. We shall not be liable for any indirect, loss of data, or circumstantial damages resulting from AI model outputs or sudden service interruptions.</p>

        <div style="background: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 8px; padding: 14px; margin-bottom: 24px;">
          <h4 style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #ef4444; margin: 0 0 6px 0;">1.4 Slate [UNCENSORED] Tier Agreement</h4>
          <p style="font-size: 12px; color: #fca5a5; margin: 0; line-height: 1.5;">
            Registered users executing queries via the invite-only <code>Slate [UNCENSORED]</code> model (requested through the Discord server) acknowledge full, sole, and exclusive accountability for all prompt strategies and outcomes. This specific model variant operates without traditional filters; therefore, the generation of all content is driven strictly by user intent. The user assumes full legal and ethical responsibility for outputs encountered while utilizing this specific model variant.
          </p>
        </div>

        <h3 style="font-size: 14px; font-weight: 700; color: #ffffff; margin: 0 0 10px 0; border-left: 2px solid #38a7ff; padding-left: 8px;">Part 2: Privacy Policy</h3>
        <p style="margin-bottom: 12px;">We are committed to data minimization. This policy outlines how core parameters are processed cleanly and safely.</p>

        <h4 style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; margin: 0 0 4px 0;">2.1 Data We Collect</h4>
        <ul style="margin: 0 0 14px 0; padding-left: 20px; list-style-type: disc;">
          <li style="margin-bottom: 4px;">Account username profile data</li>
          <li style="margin-bottom: 4px;">Authentication email address</li>
          <li style="margin-bottom: 4px;">Last active system timestamps</li>
          <li style="margin-bottom: 4px;">Account initialization timestamps</li>
          <li style="margin-bottom: 4px;">Cumulative totals of prompts sent and token payloads utilized</li>
        </ul>

      </div>

      <button onclick="closeModal('slate-privacy-modal')" style="width: 100%; margin-top: 16px; padding: 12px; background: #ffffff; color: #000000; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 13px;">Close Document</button>
    </div>
  `;
  document.body.appendChild(modal);
}

function showSlateModal(onAccept) {
  var existingModal = document.getElementById('slate-welcome-modal');
  if (existingModal) existingModal.remove();

  var slateLogo = "https://corehzunblocked.github.io/assets/Slate/Slate.png";
  var modal = document.createElement('div');
  modal.id = "slate-welcome-modal";
  modal.className = "modal-backdrop";
  modal.style = "position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 16px; font-family: 'Ubuntu', Arial, sans-serif; backdrop-filter: blur(4px); box-sizing: border-box;";
  modal.innerHTML = `
    <div class="modal-card" style="background: #0e0e13; border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 22px; width: 100%; max-width: 480px; color: #f4f4f5; box-shadow: 0 24px 60px rgba(0,0,0,0.55); max-height: 90vh; overflow-y: auto; box-sizing: border-box;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${slateLogo}" alt="Slate" style="width: 48px; height: 48px; border-radius: 12px; margin-bottom: 12px; display: inline-block;">
        <h2 style="font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin: 0;">Welcome to Slate</h2>
        <p style="font-size: 13px; color: #a1a1aa; margin-top: 6px;">Your AI helper for schoolwork and projects.</p>
      </div>

      <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; margin-bottom: 18px; line-height: 1.5;">
        <h3 style="font-size: 11px; text-transform: uppercase; color: #8b8b94; letter-spacing: 0.05em; margin: 0 0 8px 0; font-weight: 600;">What Slate Can Do</h3>
        <p style="font-size: 12px; color: #a1a1aa; margin: 0 0 12px 0;">
          Slate is designed to assist you directly in your browser. It can help you draft essays, summarize long articles, brainstorm fresh ideas for projects, explain complex math concepts step-by-step, and intelligently organize your study notes.
        </p>
        <p style="font-size: 11.5px; color: #8b8b94; margin: 0; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06);">
          <strong style="color: #d4d4d8;">Need a completely unrestricted model?</strong> We offer a private, uncensored version of Slate designed for home use. This version operates completely free of standard safety guardrails, giving you absolute freedom over your prompts. You can request access in our <a href="https://discord.gg/tzvrq8SmSm" target="_blank" rel="noopener noreferrer" style="color: #7b1fa2; text-decoration: underline;">Discord server</a>.
        </p>
      </div>

      <div style="margin-bottom: 20px; background: rgba(34, 211, 238, 0.05); padding: 14px; border-radius: 10px; border: 1.5px solid rgba(34, 211, 238, 0.55);">
        <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; margin: 0;">
          <input type="checkbox" id="welcome-terms-checkbox" style="margin-top: 3px; transform: scale(1.15); accent-color: #38a7ff; cursor: pointer; flex-shrink: 0;">
          <span style="font-size: 12px; color: #f4f4f5; font-weight: 500; line-height: 1.5;">
            I acknowledge that I have read and agree to the
            <a href="#" onclick="openSlateLegalDocs(); return false;" style="color: #38a7ff; font-weight: 700; text-decoration: underline;">Terms of Service</a>
            and
            <a href="#" onclick="openSlateLegalDocs(); return false;" style="color: #38a7ff; font-weight: 700; text-decoration: underline;">Privacy Policy</a>.
            I understand my legal responsibilities regarding acceptable use.
          </span>
        </label>
      </div>

      <button id="welcome-dismiss-btn" disabled style="width: 100%; padding: 12px; background: #232329; color: #7c7c85; border: none; border-radius: 10px; font-weight: 600; cursor: not-allowed; font-size: 13px; transition: background-color 0.2s, color 0.2s;">Accept agreements to continue</button>
    </div>
  `;
  document.body.appendChild(modal);

  var btn = modal.querySelector('#welcome-dismiss-btn');
  var checkbox = modal.querySelector('#welcome-terms-checkbox');

  function updateLaunchState() {
    if (checkbox.checked) {
      btn.disabled = false;
      btn.innerText = 'Launch Slate';
      btn.style.background = '#ffffff';
      btn.style.color = '#000000';
      btn.style.cursor = 'pointer';
    } else {
      btn.disabled = true;
      btn.innerText = 'Accept agreements to continue';
      btn.style.background = '#232329';
      btn.style.color = '#7c7c85';
      btn.style.cursor = 'not-allowed';
    }
  }

  checkbox.addEventListener('change', updateLaunchState);
  btn.onclick = function() {
    if (!btn.disabled) {
      closeModal('slate-welcome-modal');
      onAccept();
    }
  };
}

// ROUTING INITIATORS
async function launchMineral() {
  const url = await resolveRoute("mineral");
  if (url) launchWithSpoof(url, false);
}
async function launchSlate() {
  showSlateModal(async function() {
    const url = await resolveRoute("slate");
    if (url) launchWithSpoof(url, true);
  });
}
async function launchMagma() {
  const url = await resolveRoute("magma");
  if (url) launchWithSpoof(url, false);
}

// Listener wiring — no inline onclick
document.querySelectorAll("[data-launch]").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var map = { mineral: launchMineral, slate: launchSlate, magma: launchMagma };
    var fn = map[btn.getAttribute("data-launch")];
    if (fn) fn();
  });
  // Pre-warm on first press of a launch button: shaves the fetch
  // latency off the click, without ever fetching for idle viewers
  btn.addEventListener("pointerdown", function () { getRoutes(); }, { once: true });
});

/* Launch capability live — disarm the watchdog */
window.__corehzBooted = true;
console.info("[coreHZ] hub ready · v3.6 (routed, lazy, close-guard)");

/* Self-heal: refresh the shell's offline cache with this good copy */
try {
  if (window.parent && window.parent !== window) {
    window.parent.localStorage.setItem(
      "corehz.hub.cache.v1",
      "<!DOCTYPE html>\n" + document.documentElement.outerHTML
    );
  }
} catch (e) { /* cross-origin parent — nothing to heal */ }

/* Decorative layer — spotlight + entrance cleanup, last */
document.querySelectorAll(".cell").forEach(function (card) {
  card.addEventListener("pointermove", function (e) {
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", (e.clientX - r.left) + "px");
    card.style.setProperty("--my", (e.clientY - r.top) + "px");
  });
});

document.querySelectorAll(".rise").forEach(function (el) {
  el.addEventListener("animationend", function (e) {
    if (e.target === el) el.classList.remove("rise");
  }, { once: true });
});