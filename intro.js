/* 授業ツール・ゲーム共通：開いたときの説明（イントロ）カード
   使い方: <script src="intro.js"></script> のあとに
           ClassIntro.init({key:"bingo", icon:"🎱", title:"ビンゴマシン", desc:"…初期の説明文…"});
   ・説明文（日本語）と翻訳（任意）と画像（任意）は先生が✏️から編集でき、localStorage（intro.<key>.v1）に保存されます。
   ・Enter／Space／背景クリックでも「はじめる」。 */
(function(){
  const CSS=`
.ci-overlay{position:fixed;inset:0;background:rgba(10,6,30,.74);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:200;overflow:auto}
.ci-card{position:relative;background:linear-gradient(165deg,#241a52,#1a1140);border:1.5px solid rgba(255,255,255,.2);border-radius:20px;max-width:520px;width:100%;padding:26px 24px 22px;box-shadow:0 30px 80px rgba(0,0,0,.6);color:#fff;text-align:center;animation:ciPop .28s cubic-bezier(.2,1.3,.4,1)}
.ci-card,.ci-card *{box-sizing:border-box;font-family:"Segoe UI","Yu Gothic UI",Meiryo,"Hiragino Kaku Gothic ProN",system-ui,sans-serif}
@keyframes ciPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
.ci-head{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px}
.ci-icon{font-size:34px;line-height:1}
.ci-title{font-size:22px;font-weight:900}
.ci-img{max-width:72%;max-height:200px;border-radius:12px;box-shadow:0 10px 26px rgba(0,0,0,.35);margin:0 auto 14px;display:block;object-fit:contain}
.ci-ja{font-size:16.5px;line-height:1.9;color:#f0edff;text-align:left;font-weight:600;white-space:pre-wrap}
.ci-tr{margin-top:10px;padding-top:10px;border-top:1.5px dashed rgba(255,255,255,.2);font-size:14px;line-height:1.8;color:#7af0c4;text-align:left;font-weight:600;white-space:pre-wrap}
.ci-start{display:block;width:100%;margin-top:18px;border:0;border-radius:14px;padding:15px;font-size:19px;font-weight:900;color:#3a2400;background:linear-gradient(135deg,#ffe27a,#ffb43b);box-shadow:0 10px 26px rgba(255,170,40,.4);cursor:pointer}
.ci-start:active{transform:scale(.98)}
.ci-edit{position:absolute;top:12px;right:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:9px;width:32px;height:32px;color:#fff;cursor:pointer;font-size:14px;line-height:1}
.ci-edit:hover{background:rgba(255,255,255,.2)}
.ci-lbl{display:block;text-align:left;font-size:12.5px;font-weight:800;color:#c9c2e8;margin:12px 0 4px}
.ci-card textarea{width:100%;min-height:84px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.96);color:#241552;border-radius:10px;padding:10px;font-size:14px;line-height:1.6;resize:vertical}
.ci-imgslot{margin:0 auto;width:100%;min-height:60px;border:1.5px dashed rgba(255,255,255,.35);border-radius:12px;display:grid;place-items:center;color:#cfc8f0;font-weight:700;font-size:13px;cursor:pointer;background-size:contain;background-repeat:no-repeat;background-position:center;background-color:rgba(0,0,0,.18);position:relative}
.ci-imgslot.has{min-height:130px;border-style:solid}
.ci-imgx{position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;border:0;background:#e53935;color:#fff;font-weight:900;font-size:11px;cursor:pointer;line-height:1;padding:0}
.ci-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
.ci-b{border:0;border-radius:10px;padding:10px 16px;font-weight:800;cursor:pointer;font-size:14px}
.ci-b.save{background:linear-gradient(135deg,#7af0c4,#2bbf8e);color:#063b2c}
.ci-b.plain{background:rgba(255,255,255,.14);color:#fff}
.ci-b.ghost{background:transparent;border:1.5px dashed rgba(255,255,255,.3);color:#cfc8f0;margin-right:auto}
`;
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function load(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }

  window.ClassIntro={
    init(cfg){
      const KEY="intro."+cfg.key+".v1";
      function fresh(){ const s=load(KEY); return { ja:(s&&typeof s.ja==="string")?s.ja:(cfg.desc||""), tr:(s&&typeof s.tr==="string")?s.tr:"", img:(s&&typeof s.img==="string")?s.img:"" }; }
      let data=fresh(), editing=false;

      const style=document.createElement("style"); style.textContent=CSS; document.head.appendChild(style);
      const ov=document.createElement("div"); ov.className="ci-overlay"; document.body.appendChild(ov);
      const fileInput=document.createElement("input"); fileInput.type="file"; fileInput.accept="image/*"; fileInput.hidden=true; document.body.appendChild(fileInput);

      function trySave(){ try{ localStorage.setItem(KEY,JSON.stringify(data)); return true; }catch(e){ return false; } }
      function close(){ ov.remove(); fileInput.remove(); document.removeEventListener("paste",onPaste); document.removeEventListener("keydown",onKey,true); }

      function render(){
        if(!editing){
          ov.innerHTML=`<div class="ci-card">
            <div class="ci-head"><span class="ci-icon">${cfg.icon||"📖"}</span><span class="ci-title">${esc(cfg.title||"")}</span></div>
            ${data.img?`<img class="ci-img" src="${data.img}" alt="">`:""}
            <div class="ci-ja">${esc(data.ja)}</div>
            ${data.tr?`<div class="ci-tr">${esc(data.tr)}</div>`:""}
            <button class="ci-start" id="ciStart">▶ はじめる</button>
            <button class="ci-edit" id="ciEdit" title="説明を編集（先生用）">✏️</button>
          </div>`;
          ov.querySelector("#ciStart").onclick=close;
          ov.querySelector("#ciEdit").onclick=()=>{ editing=true; render(); };
          ov.onclick=e=>{ if(e.target===ov) close(); };
        } else {
          ov.innerHTML=`<div class="ci-card">
            <div class="ci-head"><span class="ci-icon">✏️</span><span class="ci-title">説明を編集</span></div>
            <div class="ci-imgslot${data.img?" has":""}" id="ciImgSlot" title="クリックで画像を選択（Ctrl+V 貼り付け・ドロップもOK）" ${data.img?`style="background-image:url('${data.img}')"`:""}>${data.img?'<button class="ci-imgx" id="ciImgDel" title="画像を削除">✕</button>':"🖼 画像（任意）— クリックで選択・Ctrl+V・ドロップ"}</div>
            <label class="ci-lbl">説明（日本語）</label>
            <textarea id="ciJa">${esc(data.ja)}</textarea>
            <label class="ci-lbl">翻訳（任意）</label>
            <textarea id="ciTr" placeholder="生徒の母語での説明（空欄なら表示されません）">${esc(data.tr)}</textarea>
            <div class="ci-btns">
              <button class="ci-b ghost" id="ciReset">初期の説明に戻す</button>
              <button class="ci-b plain" id="ciCancel">やめる</button>
              <button class="ci-b save" id="ciSave">💾 保存</button>
            </div>
          </div>`;
          ov.onclick=null;
          ov.querySelector("#ciImgSlot").onclick=e=>{ if(e.target.id==="ciImgDel"){ data.img=""; trySave(); render(); return; } fileInput.click(); };
          ov.querySelector("#ciSave").onclick=()=>{ data.ja=ov.querySelector("#ciJa").value; data.tr=ov.querySelector("#ciTr").value; if(!trySave()){ alert("容量不足で保存できませんでした。"); return; } editing=false; render(); };
          ov.querySelector("#ciCancel").onclick=()=>{ data=fresh(); editing=false; render(); };
          ov.querySelector("#ciReset").onclick=()=>{ if(!confirm("説明を初期状態に戻しますか？")) return; try{ localStorage.removeItem(KEY); }catch(e){} data={ja:cfg.desc||"",tr:"",img:""}; editing=false; render(); };
        }
      }

      function compress(file,cb){
        const url=URL.createObjectURL(file), im=new Image();
        im.onload=()=>{ const max=560; let w=im.width||1,h=im.height||1;
          if(w>=h&&w>max){ h=Math.round(h*max/w); w=max; } else if(h>w&&h>max){ w=Math.round(w*max/h); h=max; }
          const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const c=cv.getContext("2d");
          c.fillStyle="#fff"; c.fillRect(0,0,w,h); c.drawImage(im,0,0,w,h); URL.revokeObjectURL(url);
          try{ cb(cv.toDataURL("image/jpeg",0.85)); }catch(e){ cb(null); } };
        im.onerror=()=>{ URL.revokeObjectURL(url); cb(null); }; im.src=url;
      }
      function setImg(file){ compress(file,url=>{ if(!url){ alert("画像を読み込めませんでした。"); return; } const old=data.img; data.img=url; if(!trySave()){ data.img=old; alert("画像が多くて保存できませんでした。"); return; } render(); }); }
      fileInput.onchange=()=>{ const f=fileInput.files[0]; if(f) setImg(f); fileInput.value=""; };

      function onPaste(e){
        if(!editing || !document.body.contains(ov)) return;
        const items=(e.clipboardData&&e.clipboardData.items)||[];
        for(const it of items){ if(it.type&&it.type.startsWith("image/")){ const f=it.getAsFile(); if(f){ e.preventDefault(); e.stopImmediatePropagation(); setImg(f); } return; } }
      }
      function onKey(e){
        if(!document.body.contains(ov)) return;
        const tag=(e.target&&e.target.tagName)||"";
        if(e.key==="Escape" && !editing){ close(); return; }
        if(tag==="TEXTAREA"||tag==="INPUT") return;
        e.stopPropagation();                                  // 後ろのページのキー操作（スピン等）を止める
        if(!editing && (e.code==="Space"||e.code==="Enter")){ e.preventDefault(); close(); }
      }
      document.addEventListener("paste",onPaste,true);
      document.addEventListener("keydown",onKey,true);
      ov.addEventListener("dragover",e=>{ if(editing) e.preventDefault(); });
      ov.addEventListener("drop",e=>{ if(!editing) return; e.preventDefault(); const f=[...(e.dataTransfer.files||[])].find(x=>x.type.startsWith("image/")); if(f) setImg(f); });

      render();
    }
  };
})();
