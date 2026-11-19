import { desk3D } from "./scene3d.js?v=3";
"use strict";
const STORE_KEY = "palabra-fiszki-v1";
const $ = id => document.getElementById(id);
const UI = {
  card:$("card"), hand:$("hand"), frontWord:$("frontWord"), backWord:$("backWord"),
  frontLanguage:$("frontLanguage"), backLanguage:$("backLanguage"), frontSerial:$("frontSerial"),
  backSerial:$("backSerial"), cardPosition:$("cardPosition"), completed:$("completedCount"),
  total:$("totalCount"), progress:$("progressFill"), againCount:$("againCount"),
  knownCount:$("knownCount"), direction:$("directionText"), directionBtn:$("directionBtn"),
  shuffleBtn:$("shuffleBtn"), resetBtn:$("resetBtn"), againPile:$("againPile"),
  knownPile:$("knownPile"), againBtn:$("againBtn"), knownBtn:$("knownBtn"),
  flipBtn:$("flipBtn"), undoBtn:$("undoBtn"), overlay:$("finishOverlay"),
  finishKnown:$("finishKnown"), finishAgain:$("finishAgain"),
  reviewAgainBtn:$("reviewAgainBtn"), finishRestartBtn:$("finishRestartBtn"),
  toast:$("toast")
};
let words = [];
let state = null;
let busy = true;
let drag = null;
let toastTimer = null;
let flipTimer = null;
let endFlipTimer = null;
let exitTimer = null;

const baseState = () => ({
  order: words.map((_,i)=>i),
  cursor: 0,
  ratings: {},
  history: [],
  direction: "es-en",
  shuffled: false,
  round: 1
});
function validState(s) {
  if (!s || !Array.isArray(s.order) || !s.order.length || s.order.length > words.length ||
      !Number.isInteger(s.cursor) || s.cursor < 0 || s.cursor > s.order.length ||
      !["es-en","en-es"].includes(s.direction)) return false;
  const seen = new Set(s.order);
  if (seen.size !== s.order.length || !s.order.every(x => Number.isInteger(x) && x >= 0 && x < words.length)) return false;
  if (!s.ratings || typeof s.ratings !== "object" || Array.isArray(s.ratings)) return false;
  return true;
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (validState(saved)) {
      return {
        ...saved,
        history: Array.isArray(saved.history) ? saved.history.slice(-1000) : [],
        round: Math.max(1,Number(saved.round)||1),
        shuffled: Boolean(saved.shuffled)
      };
    }
  } catch (err) {
    console.warn("Postęp nie mógł zostać odczytany:", err);
  }
  return baseState();
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Brak możliwości zapisu postępu:", err);
  }
}
function counts() {
  const entries = Object.values(state.ratings);
  return {known:entries.filter(v=>v==="known").length,again:entries.filter(v=>v==="again").length};
}
function current() { return state.order[state.cursor]; }
function pad(n) { return String(n).padStart(4,"0"); }
function setWord(el,word) {
  el.textContent = word;
  el.classList.toggle("long",word.length>12);
  el.classList.toggle("very-long",word.length>21);
}
function render(animate = false) {
  if (!state) return;
  const amount = state.order.length, cursor = state.cursor;
  const stats = counts();
  desk3D.setCounts(stats);
  UI.completed.textContent = cursor.toLocaleString("pl-PL");
  UI.total.textContent = amount.toLocaleString("pl-PL");
  UI.progress.style.width = (cursor/amount*100)+"%";
  UI.againCount.textContent = stats.again+" "+plural(stats.again);
  UI.knownCount.textContent = stats.known+" "+plural(stats.known);
  UI.undoBtn.disabled = cursor===0;
  UI.direction.innerHTML = state.direction==="es-en" ? 'ES <span class="arrow-swap">⇄</span> EN' : 'EN <span class="arrow-swap">⇄</span> ES';
  UI.directionBtn.setAttribute("aria-label", state.direction==="es-en" ? "Hiszpański na angielski, zmień" : "Angielski na hiszpański, zmień");
  UI.shuffleBtn.classList.toggle("is-active",state.shuffled);
  UI.shuffleBtn.setAttribute("aria-pressed",String(state.shuffled));
  const finished = cursor>=amount;
  UI.againBtn.disabled = UI.knownBtn.disabled = UI.flipBtn.disabled = finished;
  if (finished) {
    UI.card.setAttribute("aria-label","Wszystkie słowa z tej rundy są przejrzane");
    UI.card.style.visibility="hidden";
    UI.finishKnown.textContent=stats.known;
    UI.finishAgain.textContent=stats.again;
    UI.reviewAgainBtn.textContent = stats.again ? "Powtórz trudniejsze ↗" : "Wszystko już umiesz ✓";
    UI.reviewAgainBtn.disabled = stats.again===0;
    UI.overlay.hidden=false;
    return;
  }
  UI.overlay.hidden=true;
  UI.card.style.visibility="";
  const idx=current();
  const item=words[idx];
  const front = state.direction==="es-en" ? item.es : item.en;
  const back = state.direction==="es-en" ? item.en : item.es;
  desk3D.setCard(front,back,idx+1);
  setWord(UI.frontWord, front);
  setWord(UI.backWord, back);
  UI.frontLanguage.textContent = state.direction==="es-en" ? "ESPAÑOL" : "ENGLISH";
  UI.backLanguage.textContent = state.direction==="es-en" ? "ENGLISH" : "ESPAÑOL";
  UI.frontSerial.textContent = UI.backSerial.textContent = "Nº "+pad(idx+1);
  UI.cardPosition.textContent = (cursor+1)+" Z "+amount;
  UI.card.classList.remove("is-flipped","dragging","exiting-left","exiting-right","entering");
  UI.card.style.removeProperty("--drag-x");
  UI.card.style.removeProperty("--drag-y");
  UI.card.style.removeProperty("--tilt");
  UI.card.setAttribute("aria-label", "Fiszka "+(cursor+1)+" z "+amount+": "+front+". Dotknij, aby odwrócić.");
  if (animate) {
    void UI.card.offsetWidth;
    UI.card.classList.add("entering");
    window.setTimeout(()=>UI.card.classList.remove("entering"),550);
  }
}
function plural(n) {return n===1?"fiszka":(n%10>=2&&n%10<=4&&(n%100<12||n%100>14))?"fiszki":"fiszek";}
function notify(message) {
  clearTimeout(toastTimer);
  UI.toast.textContent=message;
  UI.toast.classList.add("show");
  toastTimer=setTimeout(()=>UI.toast.classList.remove("show"),2100);
}
function flip() {
  if (busy || !state || state.cursor>=state.order.length) return;
  busy=true;
  desk3D.flip();
  UI.hand.classList.remove("perform-flip");
  void UI.hand.offsetWidth;
  UI.hand.classList.add("perform-flip");
  flipTimer=setTimeout(()=>{
    UI.card.classList.toggle("is-flipped");
    const isBack=UI.card.classList.contains("is-flipped");
    UI.card.setAttribute("aria-label",isBack ? "Znaczenie: "+UI.backWord.textContent+". Przesuń kartę do lewej lub prawej kupki." : "Słowo: "+UI.frontWord.textContent+". Dotknij, aby obrócić.");
  },270);
  endFlipTimer = setTimeout(()=>{
    UI.hand.classList.remove("perform-flip");
    busy=false;
  },1160);
}
function clearFlipIfActive(){
  if (busy && UI.hand.classList.contains("perform-flip")) {
    clearTimeout(flipTimer);
    clearTimeout(endFlipTimer);
    UI.hand.classList.remove("perform-flip");
    busy = false;
  }
}
function rate(choice) {
  clearFlipIfActive();
  if (busy || !state || state.cursor>=state.order.length || !["again","known"].includes(choice)) return;
  busy=true;
  clearHover();
  desk3D.fly(choice);
  const idx=current();
  const previous=state.ratings[idx] || null;
  UI.card.classList.remove("dragging","entering");
  UI.card.style.removeProperty("--drag-x");
  UI.card.style.removeProperty("--drag-y");
  UI.card.style.removeProperty("--tilt");
  void UI.card.offsetWidth;
  UI.card.classList.add(choice==="again"?"exiting-left":"exiting-right");
  UI.card.setAttribute("aria-label","Karta odkładana");
  exitTimer=setTimeout(()=>{
    const pile = choice==="again"?UI.againPile:UI.knownPile;
    pile.classList.remove("bump");
    void pile.offsetWidth;
    pile.classList.add("bump");
    setTimeout(()=>pile.classList.remove("bump"),650);
  },235);
  setTimeout(()=>{
    state.history.push({idx,previous});
    state.cursor++;
    state.ratings[idx]=choice;
    save();
    render(true);
    busy=false;
    if(state.cursor===state.order.length) {
      UI.overlay.hidden=false;
      UI.reviewAgainBtn.focus({preventScroll:true});
    }
  },540);
}
function undo() {
  if(busy || !state || state.cursor===0) return;
  const previousId=state.order[state.cursor-1];
  const record=state.history.at(-1);
  if(record && record.idx===previousId) {
    state.history.pop();
    if(record.previous===null) delete state.ratings[previousId];
    else state.ratings[previousId]=record.previous;
  } else {
    delete state.ratings[previousId];
  }
  state.cursor--;
  save();
  render(true);
  notify("Ostatnia fiszka wróciła na stół.");
}
function shuffleRemaining() {
  if(busy || !state) return;
  const pending=state.order.slice(state.cursor);
  if(pending.length<2) { notify("Nie ma już słów do wymieszania."); return; }
  if(!state.shuffled) {
    for(let i=pending.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [pending[i],pending[j]]=[pending[j],pending[i]];
    }
    state.shuffled=true;
    notify("Pozostałe fiszki wymieszane.");
  } else {
    pending.sort((a,b)=>a-b);
    state.shuffled=false;
    notify("Przywrócono kolejność z listy.");
  }
  state.order.splice(state.cursor,pending.length,...pending);
  save();
  render(true);
}
function changeDirection() {
  if(busy || !state) return;
  state.direction=state.direction==="es-en"?"en-es":"es-en";
  save(); render(true);
  notify(state.direction==="es-en"?"Hiszpański → angielski":"Angielski → hiszpański");
}
function restart() {
  if (!state || !window.confirm("Usunąć cały postęp i zacząć 1000 fiszek od początku?")) return;
  clearTimeout(flipTimer); clearTimeout(exitTimer);
  state=baseState();
  busy=false;
  save();
  render(true);
  notify("Rozpoczęto nową sesję.");
}
function reviewAgain() {
  if(busy || !state) return;
  const difficult=words.map((_,i)=>i).filter(i=>state.ratings[i]==="again");
  if(!difficult.length) {notify("Nie masz fiszek do powtórki.");return;}
  state.order=difficult;
  state.cursor=0;
  state.history=[];
  state.round++;
  state.shuffled=false;
  save();
  render(true);
  notify("Powtórka: "+difficult.length+" słów.");
}
function clearHover() {UI.againPile.classList.remove("drop-target");UI.knownPile.classList.remove("drop-target");}
function pointerDown(e) {
  clearFlipIfActive();
  if(busy || !state || state.cursor>=state.order.length || e.button!==0) return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,moved:false};
  UI.card.setPointerCapture?.(e.pointerId);
}
function pointerMove(e) {
  if(!drag || drag.id!==e.pointerId) return;
  drag.dx=e.clientX-drag.x;
  drag.dy=e.clientY-drag.y;
  const distance=Math.hypot(drag.dx,drag.dy);
  if(distance>6) drag.moved=true;
  if(!drag.moved) return;
  desk3D.drag(drag.dx,drag.dy);
  UI.card.classList.add("dragging");
  UI.card.style.setProperty("--drag-x",drag.dx+"px");
  UI.card.style.setProperty("--drag-y",drag.dy+"px");
  UI.card.style.setProperty("--tilt",Math.max(-22,Math.min(22,drag.dx/12))+"deg");
  const inside=(r)=>e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
  UI.againPile.classList.toggle("drop-target",inside(UI.againPile.getBoundingClientRect()) || drag.dx < -110);
  UI.knownPile.classList.toggle("drop-target",inside(UI.knownPile.getBoundingClientRect()) || drag.dx > 110);
}
function pointerUp(e) {
  if(!drag || drag.id!==e.pointerId) return;
  const info=drag;
  drag=null;
  if(UI.card.hasPointerCapture?.(e.pointerId)) UI.card.releasePointerCapture(e.pointerId);
  const x=e.clientX,y=e.clientY;
  const inside=(r)=>x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
  const target = inside(UI.againPile.getBoundingClientRect()) && info.moved ? "again" :
    inside(UI.knownPile.getBoundingClientRect()) && info.moved ? "known" :
    info.dx < -90 ? "again" : info.dx > 90 ? "known" : null;
  clearHover();
  if(target) { rate(target); return; }
  desk3D.release();
  UI.card.classList.remove("dragging");
  UI.card.style.removeProperty("--drag-x");
  UI.card.style.removeProperty("--drag-y");
  UI.card.style.removeProperty("--tilt");
  if(!info.moved || Math.hypot(info.dx,info.dy)<11) flip();
}
function onKey(e) {
  if(e.altKey || e.ctrlKey || e.metaKey) return;
  const tag=document.activeElement?.tagName;
  if (tag==="INPUT" || tag==="TEXTAREA" || tag==="SELECT") return;
  if(!UI.overlay.hidden) {
    if(e.key==="Escape"){UI.overlay.hidden=true;return;}
    return;
  }
  if(e.key===" " || e.key==="Enter" && document.activeElement===UI.card) {
    e.preventDefault(); flip();
  } else if(e.key==="ArrowLeft") {
    e.preventDefault(); rate("again");
  } else if(e.key==="ArrowRight") {
    e.preventDefault(); rate("known");
  } else if(e.key.toLowerCase()==="u") {
    e.preventDefault(); undo();
  }
}
function attach() {
  UI.card.addEventListener("pointerdown",pointerDown);
  UI.card.addEventListener("pointermove",pointerMove);
  UI.card.addEventListener("pointerup",pointerUp);
  UI.card.addEventListener("pointercancel",()=>{drag=null;clearHover();UI.card.classList.remove("dragging");UI.card.style.removeProperty("--drag-x");UI.card.style.removeProperty("--drag-y");UI.card.style.removeProperty("--tilt");});
  UI.card.addEventListener("dragstart",e=>e.preventDefault());
  UI.flipBtn.addEventListener("click",flip);
  UI.againBtn.addEventListener("click",()=>rate("again"));
  UI.knownBtn.addEventListener("click",()=>rate("known"));
  UI.againPile.addEventListener("click",()=>rate("again"));
  UI.knownPile.addEventListener("click",()=>rate("known"));
  UI.undoBtn.addEventListener("click",undo);
  UI.directionBtn.addEventListener("click",changeDirection);
  UI.shuffleBtn.addEventListener("click",shuffleRemaining);
  UI.resetBtn.addEventListener("click",restart);
  UI.finishRestartBtn.addEventListener("click",restart);
  UI.reviewAgainBtn.addEventListener("click",reviewAgain);
  document.addEventListener("keydown",onKey);
}
async function init() {
  attach();
  try {
    const response=await fetch("./words.json",{cache:"no-cache"});
    if(!response.ok) throw Error("HTTP "+response.status);
    const data=await response.json();
    if(!Array.isArray(data) || data.length!==1000 || !data.every(row=>typeof row.es==="string"&&typeof row.en==="string"&&row.es&&row.en)) throw Error("Niekompletna lista słów");
    words=data;
    state=restore();
    busy=false;
    render();
    try { await desk3D.init(); render(); } catch(e) {console.warn("Włączono zastępczy widok CSS:",e);}
    if(state.cursor===state.order.length) UI.overlay.hidden=false;
  } catch(err) {
    console.error(err);
    UI.frontWord.textContent="Brak danych";
    UI.backWord.textContent="Odśwież stronę";
    UI.card.setAttribute("aria-label","Błąd pobierania słów");
    UI.flipBtn.disabled=UI.againBtn.disabled=UI.knownBtn.disabled=true;
    notify("Nie można pobrać listy słów. Odśwież stronę.");
  }
}
init();
