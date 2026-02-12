// =====================
// CONFIG
// =====================
const SERVER_URL = "https://kabo-server.onrender.com"; // <-- replace if needed

// Valentine assets (edit these)
const VAL_PHOTOS = [
  "assets/photo1.jpeg",
  "assets/photo2.jpeg",
  "assets/photo3.jpeg",
];
const VAL_AUDIO = "assets/orangrez.mp3";

// =====================
// Socket
// =====================
const socket = io(SERVER_URL, { transports: ["websocket"] });

// =====================
// DOM - Game
// =====================
const gameScreen = document.getElementById("gameScreen");
const valScreen = document.getElementById("valScreen");

const gameStatus = document.getElementById("gameStatus");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const startBtn = document.getElementById("startBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");

const roomRow = document.getElementById("roomRow");
const roomCodeEl = document.getElementById("roomCode");

const board = document.getElementById("board");
const myGrid = document.getElementById("myGrid");
const oppGrid = document.getElementById("oppGrid");
const oppTitle = document.getElementById("oppTitle");

const peekHint = document.getElementById("peekHint");
const turnHint = document.getElementById("turnHint");

const drawBtn = document.getElementById("drawBtn");
const discardDrawnBtn = document.getElementById("discardDrawnBtn");
const caboBtn = document.getElementById("caboBtn");

const drawMeta = document.getElementById("drawMeta");
const discardMeta = document.getElementById("discardMeta");
const actionHint = document.getElementById("actionHint");

const logEl = document.getElementById("log");
const endRow = document.getElementById("endRow");
const unlockBtn = document.getElementById("unlockBtn");

// =====================
// DOM - Valentine
// =====================
const subtitle = document.getElementById("subtitle");
const btnRow = document.getElementById("btnRow");
const yesBtn = document.getElementById("yesBtn");
const noBtn = document.getElementById("noBtn");

const reveal = document.getElementById("reveal");
const sweetLine = document.getElementById("sweetLine");
const track = document.getElementById("track");
const dots = document.getElementById("dots");
const audio = document.getElementById("bgAudio");
const audioCtl = document.getElementById("audioCtl");
const audioBtn = document.getElementById("audioBtn");
const audioStatus = document.getElementById("audioStatus");
const micdrop = document.getElementById("micdrop");

// =====================
// State
// =====================
let currentRoomId = null;
let state = null;

// Private drawn state (never leak to other turn)
let myDrawnCard = null;

// Power UI injected
let powerBar = null;
let modal = null;

// IMPORTANT: queue flips because room:update re-renders the grid
let pendingFlip = null;
// { grid: "my"|"opp", index, html, ms, ts }

// query param auto-join
const params = new URLSearchParams(location.search);
const roomFromUrl = params.get("room");
if (roomFromUrl) roomInput.value = roomFromUrl.toUpperCase();

// =====================
// Debug
// =====================
socket.onAny((event, ...args) => console.log("[socket]", event, args));

// =====================
// Helpers
// =====================
function setStatus(s) { gameStatus.textContent = s; }
function me() { return state?.players?.find(p => p.isMe); }
function opponent() { return state?.players?.find(p => !p.isMe); }
function isMyTurn() { return state?.turnSocketId === socket.id; }
function isHost() { return state?.players?.[0]?.socketId === socket.id; }

function renderLog(lines) {
  logEl.innerHTML = "";
  (lines || []).forEach(l => {
    const div = document.createElement("div");
    div.textContent = "• " + l;
    logEl.appendChild(div);
  });
}

function showRoomUI(roomId) {
  roomRow.style.display = "flex";
  roomCodeEl.textContent = roomId;
}

function setBoardVisible(v) {
  board.style.display = v ? "block" : "none";
}

function suitSym(s) {
  return ({S:"♠",H:"♥",D:"♦",C:"♣"})[s] ?? s;
}

function formatCard(c) {
  if (!c) return "—";
  return `${c.r}${suitSym(c.s)} (base ${c.base})`;
}

function clearDrawnUI() {
  myDrawnCard = null;
  if (powerBar) powerBar.style.display = "none";
}

function ensurePowerUI() {
  if (powerBar) return;

  powerBar = document.createElement("div");
  powerBar.style.marginTop = "10px";
  powerBar.style.display = "none";
  powerBar.style.gap = "10px";
  powerBar.style.justifyContent = "center";
  powerBar.style.flexWrap = "wrap";
  powerBar.style.display = "flex";

  const title = document.createElement("div");
  title.style.fontSize = "13px";
  title.style.opacity = "0.85";
  title.style.width = "100%";
  title.style.textAlign = "center";
  title.id = "drawnTitle";
  powerBar.appendChild(title);

  const useBtn = document.createElement("button");
  useBtn.id = "usePowerBtn";
  useBtn.textContent = "Use Power";
  powerBar.appendChild(useBtn);

  const discardBtn2 = document.createElement("button");
  discardBtn2.id = "discardPowerBtn";
  discardBtn2.textContent = "Discard drawn";
  powerBar.appendChild(discardBtn2);

  actionHint.parentElement.appendChild(powerBar);

  modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.display = "none";
  modal.style.placeItems = "center";
  modal.style.background = "rgba(0,0,0,.25)";
  modal.style.zIndex = "9999";

  const box = document.createElement("div");
  box.style.width = "min(520px, 92vw)";
  box.style.borderRadius = "18px";
  box.style.padding = "16px";
  box.style.background = "rgba(255,255,255,.92)";
  box.style.boxShadow = "0 18px 60px rgba(0,0,0,.18)";
  box.style.textAlign = "center";
  box.id = "modalBox";

  modal.appendChild(box);
  document.body.appendChild(modal);

  useBtn.addEventListener("click", runPowerFlow);
  discardBtn2.addEventListener("click", doDiscardDrawn);
}

function showModal(html) {
  ensurePowerUI();
  document.getElementById("modalBox").innerHTML = html;
  modal.style.display = "grid";
}
function closeModal() {
  if (modal) modal.style.display = "none";
}

// Flip a card cell for ms duration
function flipReveal(gridEl, index, frontHtml, ms = 3000) {
  const cell = gridEl.querySelector(`[data-idx="${index}"]`);
  if (!cell) return;

  const front = cell.querySelector(".cardFront");
  if (!front) return;

  front.innerHTML = frontHtml;
  cell.classList.add("flipped");
  setTimeout(() => cell.classList.remove("flipped"), ms);
}

// Queue flip because renderHands() will rebuild DOM on room:update
function queueFlip(grid, index, html, ms = 3000) {
  pendingFlip = { grid, index, html, ms, ts: Date.now() };
}

function applyPendingFlipIfAny() {
  if (!pendingFlip) return;
  // If it’s too late, skip
  if (Date.now() - pendingFlip.ts > 1200) {
    pendingFlip = null;
    return;
  }
  const gridEl = pendingFlip.grid === "my" ? myGrid : oppGrid;
  flipReveal(gridEl, pendingFlip.index, pendingFlip.html, pendingFlip.ms);
  pendingFlip = null;
}

// =====================
// Render hands (always hidden until END)
// =====================
function renderHands() {
  myGrid.innerHTML = "";
  oppGrid.innerHTML = "";

  const my = me();
  const opp = opponent();
  if (!my || !opp) return;

  for (let i = 0; i < 4; i++) {
    const endedCard = state.phase === "ENDED" ? my.hand[i] : null;

    const div = document.createElement("div");
    div.className = "cardCell";
    div.setAttribute("data-idx", i);

    div.innerHTML = `
      <div class="cardInner">
        <div class="cardFace cardBack">
          <div>${state.phase === "ENDED" ? `${endedCard.r}${suitSym(endedCard.s)} (score ${endedCard.score})` : "🂠"}</div>
          <div class="mini">#${i+1}</div>
        </div>
        <div class="cardFace cardFront"></div>
      </div>
    `;

    if (state.phase === "PEEK" && my.peeksLeft > 0) {
      div.classList.add("clickable");
      div.addEventListener("click", () => doPeek(i));
    }

    if (state.phase === "TURN_DECIDE" && isMyTurn() && myDrawnCard) {
      div.classList.add("clickable");
      div.addEventListener("click", () => doSwap(i));
    }

    myGrid.appendChild(div);
  }

  for (let i = 0; i < 4; i++) {
    const endedCard = state.phase === "ENDED" ? opp.hand[i] : null;

    const div = document.createElement("div");
    div.className = "cardCell";
    div.setAttribute("data-idx", i);

    div.innerHTML = `
      <div class="cardInner">
        <div class="cardFace cardBack">
          <div>${state.phase === "ENDED" ? `${endedCard.r}${suitSym(endedCard.s)} (score ${endedCard.score})` : "🂠"}</div>
          <div class="mini">#${i+1}</div>
        </div>
        <div class="cardFace cardFront"></div>
      </div>
    `;

    oppGrid.appendChild(div);
  }

  oppTitle.textContent = `Opponent: ${opp.name}`;
}

// =====================
// Game actions
// =====================
function doPeek(i) {
  socket.emit("game:peek", { roomId: currentRoomId, index: i }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Peek failed");
  });
}

function doDraw() {
  clearDrawnUI();
  socket.emit("turn:take", { roomId: currentRoomId, source: "draw" }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Draw failed");
  });
}

function doDiscardDrawn() {
  socket.emit("turn:discardDrawn", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Discard failed");
    clearDrawnUI();
    closeModal();
  });
}

function doSwap(i) {
  socket.emit("turn:swap", { roomId: currentRoomId, handIndex: i }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Swap failed");
    clearDrawnUI();
    closeModal();
  });
}

function doCabo() {
  socket.emit("turn:cabo", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) {
      actionHint.textContent = res?.error || "Cabo not allowed.";
      return setStatus(res?.error || "Cabo failed");
    }
    clearDrawnUI();
    closeModal();
  });
}

// =====================
// Power Flow (Option B)
// =====================
function runPowerFlow() {
  if (!myDrawnCard) return;
  const r = myDrawnCard.r;

  if (r === "7" || r === "8") {
    showModal(`
      <div style="font-weight:900;margin-bottom:10px;">Peek one of YOUR cards</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick a position:</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        ${[0,1,2,3].map(i => `<button data-i="${i}">Peek #${i+1}</button>`).join("")}
      </div>
      <div style="margin-top:12px;"><button id="closeM">Cancel</button></div>
    `);
    document.getElementById("closeM").onclick = closeModal;
    [...document.querySelectorAll("[data-i]")].forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-i"), 10);
        socket.emit("power:peekOwn", { roomId: currentRoomId, handIndex: idx }, (res) => {
          if (!res?.ok) return setStatus(res?.error || "Power failed");
          clearDrawnUI();
          closeModal();
        });
      };
    });
    return;
  }

  if (r === "9" || r === "10") {
    showModal(`
      <div style="font-weight:900;margin-bottom:10px;">Peek one OPPONENT card</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick a position:</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        ${[0,1,2,3].map(i => `<button data-i="${i}">Peek Opp #${i+1}</button>`).join("")}
      </div>
      <div style="margin-top:12px;"><button id="closeM">Cancel</button></div>
    `);
    document.getElementById("closeM").onclick = closeModal;
    [...document.querySelectorAll("[data-i]")].forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-i"), 10);
        socket.emit("power:peekOpp", { roomId: currentRoomId, oppIndex: idx }, (res) => {
          if (!res?.ok) return setStatus(res?.error || "Power failed");
          clearDrawnUI();
          closeModal();
        });
      };
    });
    return;
  }

  if (r === "J") {
    showModal(`
      <div style="font-weight:900;margin-bottom:10px;">Use Jack to skip opponent's next turn</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button id="doIt">Use Jack</button>
        <button id="cancel">Cancel</button>
      </div>
    `);
    document.getElementById("cancel").onclick = closeModal;
    document.getElementById("doIt").onclick = () => {
      socket.emit("power:jackSkip", { roomId: currentRoomId }, (res) => {
        if (!res?.ok) return setStatus(res?.error || "Power failed");
        clearDrawnUI();
        closeModal();
      });
    };
    return;
  }

  if (r === "Q") {
    showModal(`
      <div style="font-weight:900;margin-bottom:10px;">Queen: unseen swap</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick YOUR card + OPPONENT card:</div>
      <div style="display:grid;gap:12px;justify-content:center;">
        <div>
          <div style="opacity:.8;margin-bottom:6px;">Your card:</div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            ${[0,1,2,3].map(i => `<button class="myPick" data-i="${i}">#${i+1}</button>`).join("")}
          </div>
        </div>
        <div>
          <div style="opacity:.8;margin-bottom:6px;">Opponent card:</div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            ${[0,1,2,3].map(i => `<button class="oppPick" data-i="${i}">#${i+1}</button>`).join("")}
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button id="confirmQ" disabled>Swap</button>
          <button id="cancelQ">Cancel</button>
        </div>
      </div>
    `);

    let myI = null, oppI = null;
    const confirmBtn = document.getElementById("confirmQ");
    document.getElementById("cancelQ").onclick = closeModal;

    document.querySelectorAll(".myPick").forEach(b => b.onclick = () => {
      myI = parseInt(b.getAttribute("data-i"), 10);
      b.style.outline = "2px solid rgba(124,77,255,.4)";
      document.querySelectorAll(".myPick").forEach(x => { if (x !== b) x.style.outline = "none"; });
      confirmBtn.disabled = !(myI !== null && oppI !== null);
    });

    document.querySelectorAll(".oppPick").forEach(b => b.onclick = () => {
      oppI = parseInt(b.getAttribute("data-i"), 10);
      b.style.outline = "2px solid rgba(255,77,109,.35)";
      document.querySelectorAll(".oppPick").forEach(x => { if (x !== b) x.style.outline = "none"; });
      confirmBtn.disabled = !(myI !== null && oppI !== null);
    });

    confirmBtn.onclick = () => {
      socket.emit("power:queenUnseenSwap", { roomId: currentRoomId, myIndex: myI, oppIndex: oppI }, (res) => {
        if (!res?.ok) return setStatus(res?.error || "Power failed");
        clearDrawnUI();
        closeModal();
      });
    };
    return;
  }

  if (r === "K") {
    showModal(`
      <div style="font-weight:900;margin-bottom:10px;">King: seen swap (preview)</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick YOUR card + OPPONENT card:</div>
      <div style="display:grid;gap:12px;justify-content:center;">
        <div>
          <div style="opacity:.8;margin-bottom:6px;">Your card:</div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            ${[0,1,2,3].map(i => `<button class="myPick" data-i="${i}">#${i+1}</button>`).join("")}
          </div>
        </div>
        <div>
          <div style="opacity:.8;margin-bottom:6px;">Opponent card:</div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            ${[0,1,2,3].map(i => `<button class="oppPick" data-i="${i}">#${i+1}</button>`).join("")}
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button id="previewK" disabled>Preview</button>
          <button id="cancelK">Cancel</button>
        </div>
      </div>
    `);

    let myI = null, oppI = null;
    const previewBtn = document.getElementById("previewK");
    document.getElementById("cancelK").onclick = closeModal;

    document.querySelectorAll(".myPick").forEach(b => b.onclick = () => {
      myI = parseInt(b.getAttribute("data-i"), 10);
      b.style.outline = "2px solid rgba(124,77,255,.4)";
      document.querySelectorAll(".myPick").forEach(x => { if (x !== b) x.style.outline = "none"; });
      previewBtn.disabled = !(myI !== null && oppI !== null);
    });

    document.querySelectorAll(".oppPick").forEach(b => b.onclick = () => {
      oppI = parseInt(b.getAttribute("data-i"), 10);
      b.style.outline = "2px solid rgba(255,77,109,.35)";
      document.querySelectorAll(".oppPick").forEach(x => { if (x !== b) x.style.outline = "none"; });
      previewBtn.disabled = !(myI !== null && oppI !== null);
    });

    previewBtn.onclick = () => {
      socket.emit("power:kingPreview", { roomId: currentRoomId, myIndex: myI, oppIndex: oppI }, (res) => {
        if (!res?.ok) return setStatus(res?.error || "Power failed");
      });
    };
    return;
  }

  setStatus("No power for this card.");
}

// =====================
// Lobby buttons
// =====================
createBtn.addEventListener("click", () => {
  const name = (nameInput.value || "Player 1").trim();
  socket.emit("room:create", { name }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Create failed");
    currentRoomId = res.roomId;
    showRoomUI(currentRoomId);
    setStatus(`Room created. Share code ${currentRoomId} with your partner.`);
  });
});

joinBtn.addEventListener("click", () => {
  const name = (nameInput.value || "Player 2").trim();
  const roomId = (roomInput.value || "").trim().toUpperCase();
  if (!roomId) return setStatus("Enter room code");
  socket.emit("room:join", { roomId, name }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Join failed");
    currentRoomId = roomId;
    showRoomUI(currentRoomId);
    setStatus(`Joined room ${roomId}. Waiting for host to start.`);
  });
});

startBtn.addEventListener("click", () => {
  if (!currentRoomId) return;
  socket.emit("game:start", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Start failed");
  });
});

copyLinkBtn.addEventListener("click", async () => {
  if (!currentRoomId) return;
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(currentRoomId)}`;
  await navigator.clipboard.writeText(url);
  setStatus("Link copied. Send it to her.");
});

drawBtn.addEventListener("click", doDraw);
discardDrawnBtn.addEventListener("click", doDiscardDrawn);
caboBtn.addEventListener("click", doCabo);

// Host fallback unlock button
unlockBtn?.addEventListener("click", () => gotoValentine());

// =====================
// Socket events
// =====================
socket.on("room:update", (s) => {
  state = s;
  if (!currentRoomId) currentRoomId = s.id;

  showRoomUI(s.id);
  setBoardVisible(s.started);
  renderLog(s.log || []);

  const my = me();
  const opp = opponent();

  if (!opp) setStatus("Waiting for your partner to join…");
  else if (!s.started) setStatus("Both players in. Host can start.");
  else setStatus(s.phase === "PEEK" ? "Peek phase" : "Game in progress");

  drawMeta.textContent = `Cards left: ${s.drawCount}`;
  discardMeta.textContent = `Discarded: ${s.discardCount ?? 0} (not usable)`;

  startBtn.style.display =
    (!s.started && s.players[0]?.socketId === socket.id && s.players.length === 2)
      ? "inline-block"
      : "none";

  const myTurn = isMyTurn();

  // Safety: if not my turn, remove any drawn info
  if (!myTurn) {
    clearDrawnUI();
    closeModal();
  }

  if (s.phase === "PEEK") {
    peekHint.textContent = my ? `Peek remaining: ${my.peeksLeft}. Tap your cards (3s reveal).` : "";
    turnHint.textContent = "Opponent is peeking too.";
    actionHint.textContent = "";
    clearDrawnUI();
  } else if (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") {
    peekHint.textContent = "";
    turnHint.textContent = myTurn
      ? "Your turn: Draw a card, or call CABO (<10)."
      : "Opponent's turn.";
    actionHint.textContent = myTurn
      ? "CABO allowed only if your total is < 10 (K♥/K♦ count as -1)."
      : "";
    clearDrawnUI();
  } else if (s.phase === "TURN_DECIDE") {
    turnHint.textContent = myTurn
      ? "Decide: swap (tap your card), or discard, or use power."
      : "Opponent deciding.";
  } else if (s.phase === "ENDED") {
    turnHint.textContent = "Round ended (all cards revealed).";
    actionHint.textContent = "";
    clearDrawnUI();

    const ended = s.ended;
    if (ended) {
      const lines = ended.scores.map(x => `${x.name}: ${x.score}`).join(" | ");
      setStatus(`Winner: ${ended.winnerName} — ${lines}`);
    }

    // Host can see the bottom unlock button (optional)
    endRow.style.display = isHost() ? "flex" : "none";

    // Non-host gets a popup CTA to go to valentine page
    if (!isHost()) {
      showModal(`
        <div style="font-weight:900;font-size:18px;margin-bottom:8px;">Okay… that was cute 💜</div>
        <div style="opacity:.9;margin-bottom:14px;">Click to unlock the next page.</div>
        <button id="goVal" style="padding:12px 16px;border-radius:14px;font-weight:900;">Unlock Valentine 💜</button>
      `);
      document.getElementById("goVal").onclick = () => {
        closeModal();
        gotoValentine();
      };
    }
  }

  drawBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN"));
  discardDrawnBtn.disabled = !(myTurn && s.phase === "TURN_DECIDE" && !!myDrawnCard);
  caboBtn.disabled = !(myTurn && s.phase === "TURN_DRAW");

  renderHands();
  applyPendingFlipIfAny(); // ✅ FIX: apply flip after DOM is rebuilt
});

// Peek result: queue flip (because room:update may re-render immediately)
socket.on("peek:result", ({ index, card }) => {
  queueFlip(
    "my",
    index,
    `<div class="big">${card.r}${suitSym(card.s)}</div><div class="small">score ${card.score}</div>`,
    3000
  );
});

// Draw result (private): show action bar + allow swap/power
socket.on("turn:drawResult", ({ card, power }) => {
  if (!isMyTurn()) return;

  ensurePowerUI();
  myDrawnCard = card;

  actionHint.textContent = `You drew: ${formatCard(card)}. Tap one of your cards to swap OR discard OR use power.`;

  const title = document.getElementById("drawnTitle");
  title.textContent = power
    ? `You drew ${formatCard(card)} — Power available.`
    : `You drew ${formatCard(card)} — No power.`;

  document.getElementById("usePowerBtn").disabled = !power;
  powerBar.style.display = "flex";
  renderHands();
});

// Power reveals: queue flip for the correct grid
socket.on("power:reveal", ({ kind, index, card }) => {
  queueFlip(
    kind === "own" ? "my" : "opp",
    index,
    `<div class="big">${card.r}${suitSym(card.s)}</div><div class="small">score ${card.score}</div>`,
    3000
  );
});

// King preview: show modal confirm
socket.on("king:preview", ({ myIndex, oppIndex, myCard, oppCard }) => {
  showModal(`
    <div style="font-weight:900;margin-bottom:10px;">King Preview (K1)</div>
    <div style="opacity:.92;margin-bottom:10px;">Your #${myIndex+1}: <b>${formatCard(myCard)}</b> (score ${myCard.score})</div>
    <div style="opacity:.92;margin-bottom:14px;">Opponent #${oppIndex+1}: <b>${formatCard(oppCard)}</b> (score ${oppCard.score})</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button id="kYes">Confirm Swap</button>
      <button id="kNo">Cancel</button>
    </div>
  `);

  document.getElementById("kYes").onclick = () => {
    socket.emit("power:kingConfirm", { roomId: currentRoomId, confirm: true }, (res) => {
      if (!res?.ok) return setStatus(res?.error || "King confirm failed");
      clearDrawnUI();
      closeModal();
    });
  };

  document.getElementById("kNo").onclick = () => {
    socket.emit("power:kingConfirm", { roomId: currentRoomId, confirm: false }, (res) => {
      if (!res?.ok) return setStatus(res?.error || "King cancel failed");
      clearDrawnUI();
      closeModal();
    });
  };
});

// =====================
// Valentine page logic
// =====================
let yesScale = 1;
let noStep = 0;

const NO_LINES = [
  "No",
  "Come on please 😭",
  "For real??",
  "Pleaseeee 🥺",
  "Okay you’re just being dramatic 😌",
  "…fine, I’m out."
];

function gotoValentine() {
  gameScreen.style.display = "none";
  valScreen.style.display = "block";
  initValentine();
}

function initValentine() {
  subtitle.textContent = "Quick question…";
  audio.src = VAL_AUDIO;

  // Build carousel
  track.innerHTML = "";
  dots.innerHTML = "";

  VAL_PHOTOS.forEach((src, i) => {
    const slide = document.createElement("div");
    slide.className = "slide";
    slide.innerHTML = `<img src="${src}" alt="Photo ${i+1}">`;
    track.appendChild(slide);

    const dot = document.createElement("div");
    dot.className = "dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => goTo(i));
    dots.appendChild(dot);
  });

  goTo(0);
  startAutoCarousel();

  // audio control
  audioCtl.style.display = "inline-flex";
  audioStatus.textContent = "Tap to play our song 💜";
  audioBtn.onclick = async () => {
    try {
      audio.volume = 0.55;
      await audio.play();
      audioStatus.textContent = "Playing 🎶";
    } catch {
      audioStatus.textContent = "Autoplay blocked — tap again";
    }
  };

  // reset no/yes
  btnRow.style.display = "flex";
  reveal.classList.remove("show");

  yesScale = 1;
  noStep = 0;
  yesBtn.style.setProperty("--yesScale", "1");
  noBtn.textContent = "No";

  if (!noBtn.isConnected) btnRow.appendChild(noBtn);

  yesBtn.onclick = () => acceptValentine();
  noBtn.onclick = () => handleNo();
}

let carouselIndex = 0;
let carouselTimer = null;

function goTo(i) {
  carouselIndex = (i + VAL_PHOTOS.length) % VAL_PHOTOS.length;
  track.style.transform = `translateX(-${carouselIndex * 100}%)`;
  [...dots.children].forEach((d, k) => d.classList.toggle("active", k === carouselIndex));
}

function startAutoCarousel() {
  stopAutoCarousel();
  carouselTimer = setInterval(() => goTo(carouselIndex + 1), 2600);
}

function stopAutoCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = null;
}

function bumpYes() {
  yesScale = Math.min(yesScale + 0.18, 2.2);
  yesBtn.style.setProperty("--yesScale", yesScale.toFixed(2));
}

function handleNo() {
  bumpYes();
  noStep = Math.min(noStep + 1, NO_LINES.length - 1);
  noBtn.textContent = NO_LINES[noStep];

  subtitle.textContent = "Trying to say no? cute.";

  if (noStep >= NO_LINES.length - 1) {
    noBtn.remove();
    subtitle.textContent = "Good. Now press Yes like you mean it 💜";
  }
}

function acceptValentine() {
  subtitle.textContent = "Knew it 😌";
  btnRow.style.display = "none";

  reveal.classList.add("show");
  sweetLine.textContent = "Now come here… I have something for you 💜";
  micdrop.textContent = "So yes… it’s you. Always was.";

  // attempt play after user click
  (async () => {
    try {
      audio.volume = 0.55;
      await audio.play();
      audioStatus.textContent = "Playing 🎶";
    } catch {}
  })();
}
