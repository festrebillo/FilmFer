/* Fergard · Acceso (módulo compartido, se copia dentro de cada app)
   Cada app es independiente: pide entrar con Google UNA vez por dispositivo y recibe un token propio de esa app.
   Los datos del servidor solo salen con un token válido de la misma app. La pantalla de acceso tapa toda la app
   hasta que el dispositivo está vinculado (la barrera real está en el servidor; esta pantalla es la puerta).
   Uso: FergardAcceso.iniciar({ app:"gym", nombre:"Gym", clientId:"…", tema:{…}, onListo:function(){…} }) */
(function (root) {
  "use strict";
  var O = null, listo = false;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function tokKey() { return "fg_tok_" + O.app; }
  function nomKey() { return "fg_nom_" + O.app; }
  function cfg() { return { url: ls("fg_url") || O.scriptUrl || "", token: ls(tokKey()) || "" }; }
  function nombreDefault() { var u = navigator.userAgent; return /iPhone/.test(u) ? "Mi iPhone" : /iPad/.test(u) ? "Mi iPad" : /Android/.test(u) ? "Mi Android" : "Mi computadora"; }
  var ERR = { token_invalido: "Google no pudo verificar el acceso. Inténtalo de nuevo.", no_permitido: "Esa cuenta de Google no está autorizada.", sin_configurar: "El script todavía no tiene tu correo configurado.",
    bloqueado: "Demasiados intentos. Espera 15 minutos.", codigo_invalido: "Código incorrecto o vencido.", no_autorizado: "Este dispositivo no está autorizado." };
  function api(op, body) {
    var o = { op: op, app: O.app }; for (var k in (body || {})) o[k] = body[k];
    return fetch(cfg().url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(o) }).then(function (r) { return r.json(); });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function css() {
    var t = O.tema || {}, bg = t.bg || "#0B0B0D", fg = t.fg || "#F5F5F7", mut = t.mut || "#9A9AA3", ac = t.acento || "#FF5A47", bb = t.btnBg || fg, bf = t.btnFg || bg, font = t.font || "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',system-ui,sans-serif";
    return "#fgx{position:fixed;inset:0;z-index:99999;background:" + bg + ";color:" + fg + ";font-family:" + font + ";overflow:auto;-webkit-overflow-scrolling:touch;padding:calc(env(safe-area-inset-top,0px) + 34px) 24px calc(env(safe-area-inset-bottom,0px) + 30px)}" +
      "#fgx *{box-sizing:border-box}#fgx .w{max-width:420px;margin:0 auto}#fgx h1{font-size:34px;letter-spacing:-.8px;line-height:1.1;margin:6px 0 8px}#fgx p{color:" + mut + ";line-height:1.45;margin:0 0 20px;font-size:16px}" +
      "#fgx label{display:block;font-size:13px;color:" + mut + ";font-weight:600;margin:16px 2px 7px}#fgx input{width:100%;font:inherit;color:" + fg + ";background:rgba(128,128,128,.14);border:1px solid rgba(128,128,128,.28);border-radius:14px;padding:14px 15px}" +
      "#fgx input:focus{outline:2px solid " + ac + ";outline-offset:1px}#fgx button.b{display:flex;align-items:center;justify-content:center;width:100%;height:52px;border:0;border-radius:16px;background:" + bb + ";color:" + bf + ";font:inherit;font-weight:700;font-size:17px;margin-top:14px;cursor:pointer}" +
      "#fgx button.s{background:rgba(128,128,128,.16);color:" + fg + "}#fgx button.l{border:0;background:none;color:" + ac + ";font:inherit;font-weight:600;font-size:14px;margin-top:18px;cursor:pointer;padding:0}#fgx .m{min-height:20px;margin-top:14px;font-size:14px;line-height:1.4;color:" + ac + "}" +
      "#fgx .sep{display:flex;align-items:center;gap:12px;color:" + mut + ";font-size:13px;margin:22px 0 4px}#fgx .sep:before,#fgx .sep:after{content:'';height:1px;background:rgba(128,128,128,.28);flex:1}#fgx #fgx-g{display:flex;justify-content:center;min-height:44px;margin-top:8px}" +
      ".fgx-card{border:1px solid rgba(128,128,128,.25);border-radius:18px;padding:14px 16px;background:rgba(128,128,128,.07)}.fgx-card .r{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(128,128,128,.2)}.fgx-card .r:last-child{border:0}" +
      ".fgx-card small{display:block;opacity:.65;font-size:12.5px;margin-top:2px}.fgx-card button{font:inherit;border:0;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer;background:rgba(128,128,128,.2);color:inherit;margin-top:8px}.fgx-code{font-size:42px;font-weight:800;letter-spacing:6px;text-align:center;font-variant-numeric:tabular-nums;margin:8px 0 0}";
  }
  function estilo() { if (document.getElementById("fgx-css")) return; var st = document.createElement("style"); st.id = "fgx-css"; st.textContent = css(); document.head.appendChild(st); }
  function montar() {
    if (document.getElementById("fgx")) return document.getElementById("fgx");
    estilo();
    var d = document.createElement("div"); d.id = "fgx"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Acceso a " + O.nombre); document.body.appendChild(d); return d;
  }
  function cerrar() { var d = document.getElementById("fgx"); if (d) d.remove(); if (!listo) { listo = true; if (O.onListo) O.onListo(); } }
  function msg(t, ok) { var m = document.querySelector("#fgx .m"); if (m) { m.textContent = t || ""; m.style.color = ok ? "" : ""; } }

  function vistaUrl(d) {
    d.innerHTML = '<div class="w">' + (O.marca || "") + "<h1>" + esc(O.nombre) + "</h1><p>Pega una sola vez el enlace de tu script (termina en <b>/exec</b>). Queda guardado solo en este celular.</p>" +
      '<label for="fgx-u">Enlace del script</label><input id="fgx-u" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec"><button class="b" id="fgx-ub">Continuar</button><div class="m"></div></div>';
    document.getElementById("fgx-ub").onclick = function () {
      var u = document.getElementById("fgx-u").value.trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) { msg("El enlace debe empezar con https://script.google.com/macros/s/ y terminar en /exec"); return; }
      ls("fg_url", u); vistaLogin(d);
    };
  }
  function vistaLogin(d) {
    d.innerHTML = '<div class="w">' + (O.marca || "") + "<h1>" + esc(O.nombre) + "</h1><p>Entra con Google una sola vez. Después este dispositivo queda autorizado para " + esc(O.nombre) + " y abre directo.</p>" +
      '<label for="fgx-n">Nombre de este dispositivo</label><input id="fgx-n" maxlength="40" autocomplete="off"><div id="fgx-g"></div><div class="m" id="fgx-m1"></div>' +
      '<div class="sep">o con un código</div><label for="fgx-c">Código de 8 dígitos (desde otro dispositivo ya autorizado en esta app)</label><input id="fgx-c" inputmode="numeric" pattern="[0-9]*" maxlength="9" autocomplete="off" placeholder="00000000"><button class="b s" id="fgx-cb">Vincular con código</button><div class="m" id="fgx-m2"></div>' +
      '<button class="l" id="fgx-cu">Cambiar enlace del script</button></div>';
    document.getElementById("fgx-n").value = ls(nomKey()) || nombreDefault();
    var nom = function () { return document.getElementById("fgx-n").value.trim() || nombreDefault(); };
    function listoCon(r) { ls(tokKey(), r.token); ls(nomKey(), r.nombre); cerrar(); }
    function onCred(resp) {
      document.getElementById("fgx-m1").textContent = "Verificando…";
      api("enrolar", { idToken: resp.credential, nombre: nom() }).then(function (r) { if (r.ok) listoCon(r); else document.getElementById("fgx-m1").textContent = ERR[r.error] || "No se pudo autorizar este dispositivo."; })
        .catch(function () { document.getElementById("fgx-m1").textContent = "Sin conexión con el script. Revisa el enlace y tu internet."; });
    }
    function initG() {
      if (!(root.google && google.accounts && google.accounts.id)) return false;
      google.accounts.id.initialize({ client_id: O.clientId, callback: onCred, auto_select: false, cancel_on_tap_outside: true });
      google.accounts.id.renderButton(document.getElementById("fgx-g"), { theme: "filled_black", size: "large", text: "continue_with", shape: "pill", width: 300, locale: "es" }); return true;
    }
    if (!initG()) { var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = initG; s.onerror = function () { document.getElementById("fgx-m1").textContent = "No se pudo cargar el acceso de Google. Revisa tu conexión."; }; document.head.appendChild(s); }
    document.getElementById("fgx-cb").onclick = function () {
      var c = document.getElementById("fgx-c").value.replace(/\D/g, ""); if (c.length !== 8) { document.getElementById("fgx-m2").textContent = "Son 8 dígitos."; return; }
      document.getElementById("fgx-m2").textContent = "Verificando…";
      api("canjear", { codigo: c, nombre: nom() }).then(function (r) { if (r.ok) listoCon(r); else document.getElementById("fgx-m2").textContent = ERR[r.error] || "No se pudo vincular."; })
        .catch(function () { document.getElementById("fgx-m2").textContent = "Sin conexión con el script."; });
    };
    document.getElementById("fgx-cu").onclick = function () { ls("fg_url", null); vistaUrl(d); };
  }

  var A = {
    iniciar: function (o) {
      O = o; var c = cfg(); if (document.head) estilo(); else document.addEventListener("DOMContentLoaded", estilo);
      if (c.token && c.url) {      // dispositivo ya autorizado: abre directo y verifica en segundo plano
        listo = true; if (O.onListo) O.onListo();
        api("ping", { token: c.token }).then(function (r) { if (r && r.ok === false && r.error === "no_autorizado") { ls(tokKey(), null); location.reload(); } else if (r && r.ok) ls(nomKey(), r.nombre); }).catch(function () { /* sin conexión: sigue abierta */ });
        return;
      }
      var go = function () { var d = montar(); if (!c.url) vistaUrl(d); else vistaLogin(d); };
      if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
    },
    config: function () { return cfg(); },
    vinculado: function () { return !!cfg().token; },
    nombre: function () { return ls(nomKey()) || ""; },
    cerrarSesion: function () { ls(tokKey(), null); location.reload(); },
    /* panel de acceso para los ajustes de cada app: vincular otro dispositivo, ver y revocar dispositivos, cerrar sesión */
    panel: function (el) {
      var c = cfg(); if (!c.token) { el.innerHTML = '<div class="fgx-card">Este dispositivo no está vinculado.</div>'; return; }
      el.innerHTML = '<div class="fgx-card"><div class="r"><div><b>' + esc(A.nombre() || "Este dispositivo") + "</b><small>Autorizado para " + esc(O.nombre) + '</small></div></div><button id="fgx-pv">Vincular otro dispositivo</button><div id="fgx-pc"></div><button id="fgx-pl">Ver dispositivos de esta app</button><div id="fgx-pd"></div><button id="fgx-ps" style="color:#FF6B5B">Cerrar sesión en este dispositivo</button></div>';
      var tv = null;
      document.getElementById("fgx-pv").onclick = function () {
        api("codigo", { token: c.token }).then(function (r) {
          if (!r.ok) { document.getElementById("fgx-pc").textContent = ERR[r.error] || "No se pudo generar el código"; return; }
          var fin = Date.now() + r.segundos * 1000, box = document.getElementById("fgx-pc");
          clearInterval(tv); tv = setInterval(function () { var s = Math.max(0, Math.round((fin - Date.now()) / 1000)); if (!document.getElementById("fgx-pc")) { clearInterval(tv); return; } box.innerHTML = s ? '<div class="fgx-code">' + r.codigo.slice(0, 4) + " " + r.codigo.slice(4) + "</div><small>Escríbelo en el otro dispositivo (en esta misma app). Vence en " + Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2) + "</small>" : "<small>Código vencido</small>"; if (!s) clearInterval(tv); }, 500);
        }).catch(function () { document.getElementById("fgx-pc").textContent = "Sin conexión"; });
      };
      document.getElementById("fgx-pl").onclick = function () {
        api("lista", { token: c.token }).then(function (r) {
          var box = document.getElementById("fgx-pd"); if (!r.ok) { box.textContent = ERR[r.error] || "No se pudo cargar"; return; }
          box.innerHTML = r.dispositivos.filter(function (x) { return !x.app || x.app === O.app; }).map(function (x) { return '<div class="r" style="display:flex;justify-content:space-between;gap:8px;padding:9px 0"><div>' + esc(x.nombre) + (x.actual ? " (este)" : "") + "<small>" + esc(x.estado) + " · último uso " + esc(String(x.ultimo_uso).slice(0, 10)) + "</small></div>" + (x.estado === "activo" && !x.actual ? '<button data-r="' + esc(x.id) + '">Revocar</button>' : "") + "</div>"; }).join("");
          Array.prototype.forEach.call(box.querySelectorAll("button[data-r]"), function (b) { b.onclick = function () { if (!confirm("¿Quitar el acceso a este dispositivo?")) return; api("revocar", { token: c.token, id: b.getAttribute("data-r") }).then(function () { document.getElementById("fgx-pl").onclick(); }); }; });
        }).catch(function () { document.getElementById("fgx-pd").textContent = "Sin conexión"; });
      };
      document.getElementById("fgx-ps").onclick = function () { if (confirm("Este dispositivo volverá a pedir acceso. ¿Cerrar sesión?")) A.cerrarSesion(); };
    }
  };
  root.FergardAcceso = A;
})(window);
