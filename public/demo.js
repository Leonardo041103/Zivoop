/* Zivoop: faixa de demonstração e aviso no lugar do WhatsApp de exemplo (só nas demos do zivoop.com) */
(function(){
  var embed=/[?&]embed=1/.test(location.search);
  var st=document.createElement("style");
  st.textContent=".zv-demo{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 14px;background:#14162B;color:#fff;font:600 13px/1.3 system-ui,sans-serif;text-decoration:none;position:relative;z-index:200}.zv-demo b{color:#FF9B55}.zv-demo span{text-decoration:underline}.zv-av{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;z-index:9999;background:#14162B;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:14px 18px;border-radius:16px;max-width:min(92vw,420px);text-align:center;box-shadow:0 18px 40px rgba(0,0,0,.3);transition:.3s;pointer-events:none}.zv-av.on{opacity:1;transform:translate(-50%,0)}";
  document.head.appendChild(st);
  function aviso(){ var t=document.querySelector(".zv-av"); if(!t){ t=document.createElement("div"); t.className="zv-av"; t.setAttribute("role","status"); document.body.appendChild(t); }
    t.textContent="Isto é uma demonstração. Na loja de verdade, o pedido abre direto no WhatsApp do dono."; t.classList.add("on"); clearTimeout(t._t); t._t=setTimeout(function(){t.classList.remove("on")},3600); }
  function exemplo(u){ return /wa\.me\/(SEU_WHATSAPP|\?)/.test(String(u||"")); }
  var wo=window.open; window.open=function(u){ if(exemplo(u)){ aviso(); return null; } return wo.apply(window,arguments); };
  document.addEventListener("click",function(e){ var a=e.target.closest&&e.target.closest("a[href]"); if(a&&exemplo(a.getAttribute("href"))){ e.preventDefault(); aviso(); } },true);
  function faixa(){ if(embed) return; var a=document.createElement("a"); a.href="/#quero"; a.className="zv-demo"; a.innerHTML="<b>Demonstração Zivoop.</b> <span>Quero um site assim para o meu negócio</span>"; document.body.insertBefore(a,document.body.firstChild); }
  if(document.body) faixa(); else document.addEventListener("DOMContentLoaded",faixa);
})();
