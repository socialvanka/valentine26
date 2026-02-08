// =====================
// CONFIG
// =====================
const SERVER_URL = "https://kabo-server.onrender.com"; // <-- replace

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
const discardBtn = document.getElementById("discardBtn");
const discardDrawnBtn = document.getElementById("discardDrawnBtn");
const caboBtn = document.getElementById("caboBtn");

const drawMeta = document.getElementById("drawMeta");
const discardMeta = document.getElementById("discardMeta");
const actionHint = document.getElementById("actionHint");

const logEl = document.getElementById("log");
const endRow = document.getElementById("endRow");
const unlockBtn = document.getElementById("unlockBtn");

// =====================
// State
// =====================
let currentRoomId = null;
let state = null;

// Private turn state (should NEVER be visible when not my turn)
let myDrawnCard = null;
let myDrawnIsPower = false;

// Power UI injected
let powerBar = null;
let modal = null;

// query param auto-join
const params = new URLSearchParams(location.search);
const roomFromUrl = params.get("room");
if (roomFromUrl) roomInput.value = roomFromUrl.toUpperCase();

// =====================
// Debug (leave ON while building)
// =====================
socket.onAny((event, ...args) => {
  console.log("[socket]", event, args);
});

// =====================
// Helpers
// =====================
function setStatus(s) { gameStatus.textContent = s; }
function me() { return state?.players?.find(p => p.isMe); }
function opponent() { return state?.players?.find(p => !p.isMe); }
function isMyTurn() { return state?.turnSocketId === socket.id; }

function renderLog(lines) {
  logEl.innerHTML = "";
  lines.forEach(l => {
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

// Memory flash overlay (auto disappears)
function flashPeek(text) {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.top = "18px";
  el.style.transform = "translateX(-50%)";
  el.style.padding = "12px 14px";
  el.style.borderRadius = "14px";
  el.style.background = "rgba(255,255,255,.92)";
  el.style.boxShadow = "0 14px 40px rgba(0,0,0,.18)";
  el.style.zIndex = "99999";
  el.style.fontWeight = "750";
  el.style.maxWidth = "min(520px, 92vw)";
  el.style.textAlign = "center";
  el.textContent = text;

  document.body.appendChild(el);

  setTimeout(() => {
    el.style.transition = "opacity 250ms ease, transform 250ms ease";
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(-6px)";
  }, 950);

  setTimeout(() => el.remove(), 1250);
}

function clearDrawnUI() {
  myDrawnCard = null;
  myDrawnIsPower = false;
  if (powerBar) powerBar.style.display = "none";
  // don't wipe hints aggressively; just remove drawn-specific hint if you want:
  // actionHint.textContent = "";
}

function setDrawnUI(card, power) {
  ensurePowerUI();
  myDrawnCard = card;
  myDrawnIsPower = !!power;

  actionHint.textContent = `You drew: ${formatCard(card)}. Tap one of your cards to swap OR discard OR use power.`;

  const title = document.getElementById("drawnTitle");
  title.textContent = power
    ? `You drew ${formatCard(card)} — Power available. Choose: swap OR use power OR discard.`
    : `You drew ${formatCard(card)} — Choose: swap OR discard.`;

  document.getElementById("usePowerBtn").disabled = !power;
  powerBar.style.display = "flex";
}

// =====================
// Power UI
// =====================
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

  // Insert after actionHint
  actionHint.parentElement.appendChild(powerBar);

  // Modal container
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

// =====================
// Render hands (memory game: always hidden until END)
// =====================
function renderHands() {
  myGrid.innerHTML = "";
  oppGrid.innerHTML = "";

  const my = me();
  const opp = opponent();
  if (!my || !opp) return;

  // My cards
  for (let i = 0; i < 4; i++) {
    const endedCard = state.phase === "ENDED" ? my.hand[i] : null;

    const div = document.createElement("div");
    div.className = "cardCell";

    const label = (state.phase === "ENDED")
      ? `${endedCard.r}${suitSym(endedCard.s)} (score ${endedCard.score})`
      : "🂠";

    div.innerHTML = `<div>${label}</div><div class="mini">#${i+1}</div>`;

    // Initial peek: click to request peek (flash only)
    if (state.phase === "PEEK" && my.peeksLeft > 0) {
      div.classList.add("clickable");
      div.addEventListener("click", () => doPeek(i));
    }

    // Swap drawn into hand: click to swap (Option B)
    if (state.phase === "TURN_DECIDE" && isMyTurn() && myDrawnCard) {
      div.classList.add("clickable");
      div.addEventListener("click", () => doSwap(i));
    }

    myGrid.appendChild(div);
  }

  // Opponent cards
  for (let i = 0; i < 4; i++) {
    const endedCard = state.phase === "ENDED" ? opp.hand[i] : null;

    const div = document.createElement("div");
    div.className = "cardCell";

    const label = (state.phase === "ENDED")
      ? `${endedCard.r}${suitSym(endedCard.s)} (score ${endedCard.score})`
      : "🂠";

    div.innerHTML = `<div>${label}</div><div class="mini">#${i+1}</div>`;
    oppGrid.appendChild(div);
  }

  oppTitle.textContent = `Opponent: ${opp.name}`;
}

// =====================
// Actions
// =====================
function doPeek(i) {
  socket.emit("game:peek", { roomId: currentRoomId, index: i }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Peek failed");
  });
}

function doTake(source) {
  // Always clear local drawn state before taking a new card
  clearDrawnUI();

  socket.emit("turn:take", { roomId: currentRoomId, source }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Take failed");
  });
}

function doDiscardDrawn() {
  socket.emit("turn:discardDrawn", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Discard failed");
    // IMPORTANT: clear right away on success
    clearDrawnUI();
    closeModal();
  });
}

function doSwap(i) {
  socket.emit("turn:swap", { roomId: currentRoomId, handIndex: i }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Swap failed");
    // IMPORTANT: clear right away on success
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
// Power Flow
// =====================
function runPowerFlow() {
  if (!myDrawnCard) return;
  const r = myDrawnCard.r;

  // 7/8 peek own
  if (r === "7" || r === "8") {
    showModal(`
      <div style="font-weight:800;margin-bottom:10px;">Use ${formatCard(myDrawnCard)} → Peek one of YOUR cards</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick a position (flash reveal):</div>
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
          // IMPORTANT
          clearDrawnUI();
          closeModal();
        });
      };
    });
    return;
  }

  // 9/10 peek opponent
  if (r === "9" || r === "10") {
    showModal(`
      <div style="font-weight:800;margin-bottom:10px;">Use ${formatCard(myDrawnCard)} → Peek one OPPONENT card</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick a position (flash reveal):</div>
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
          // IMPORTANT
          clearDrawnUI();
          closeModal();
        });
      };
    });
    return;
  }

  // Jack skip
  if (r === "J") {
    showModal(`
      <div style="font-weight:800;margin-bottom:10px;">Use ${formatCard(myDrawnCard)} → Skip opponent's next turn</div>
      <div style="opacity:.85;margin-bottom:12px;">(2 players: it comes back to you)</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button id="doIt">Use Jack</button>
        <button id="cancel">Cancel</button>
      </div>
    `);
    document.getElementById("cancel").onclick = closeModal;
    document.getElementById("doIt").onclick = () => {
      socket.emit("power:jackSkip", { roomId: currentRoomId }, (res) => {
        if (!res?.ok) return setStatus(res?.error || "Power failed");
        // IMPORTANT
        clearDrawnUI();
        closeModal();
      });
    };
    return;
  }

  // Queen unseen swap
  if (r === "Q") {
    showModal(`
      <div style="font-weight:800;margin-bottom:10px;">Use ${formatCard(myDrawnCard)} → Unseen swap</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick YOUR card + OPPONENT card (no reveals):</div>
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
        // IMPORTANT
        clearDrawnUI();
        closeModal();
      });
    };
    return;
  }

  // King seen swap (K1): preview both, then confirm
  if (r === "K") {
    showModal(`
      <div style="font-weight:800;margin-bottom:10px;">Use ${formatCard(myDrawnCard)} → Seen swap (preview both)</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick YOUR card + OPPONENT card to preview:</div>
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

  setStatus("No power available for this card.");
}

// =====================
// Buttons
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

drawBtn.addEventListener("click", () => doTake("draw"));
discardBtn.addEventListener("click", () => doTake("discard"));
discardDrawnBtn.addEventListener("click", doDiscardDrawn);
caboBtn.addEventListener("click", doCabo);

unlockBtn?.addEventListener("click", () => {
  gameScreen.style.display = "none";
  valScreen.style.display = "block";
});

// =====================
// Socket events
// =====================
socket.on("room:update", (s) => {
  state = s;
  if (!currentRoomId) currentRoomId = s.id;

  showRoomUI(s.id);
  setBoardVisible(s.started);
  renderLog(s.log || []);

  // Debug snapshot
  console.log("STATE", { phase: s.phase, turn: s.turnSocketId, me: socket.id, drawCount: s.drawCount, discardTop: s.discardTop });

  const my = me();
  const opp = opponent();

  if (!opp) setStatus("Waiting for your partner to join…");
  else if (!s.started) setStatus("Both players in. Host can start.");
  else setStatus(s.phase === "PEEK" ? "Peek phase" : "Game in progress");

  drawMeta.textContent = `Cards left: ${s.drawCount}`;
  discardMeta.textContent = s.discardTop ? `Top: ${formatCard(s.discardTop)}` : `Empty`;

  startBtn.style.display = (!s.started && s.players[0]?.socketId === socket.id && s.players.length === 2) ? "inline-block" : "none";

  const myTurn = isMyTurn();

  // CRITICAL: if it's not my turn, I must not keep any drawn-card UI
  if (!myTurn) {
    clearDrawnUI();
    closeModal();
  }

  if (s.phase === "PEEK") {
    peekHint.textContent = my ? `Peek remaining: ${my.peeksLeft}. Tap your cards (flash only).` : "";
    turnHint.textContent = "Opponent is peeking too.";
    actionHint.textContent = "";
    clearDrawnUI();
  } else if (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") {
    peekHint.textContent = "";
    turnHint.textContent = myTurn
      ? "Your turn: Draw / Take Discard, or call CABO (≤ 5)."
      : "Opponent's turn.";
    actionHint.textContent = myTurn
      ? "CABO is only allowed if your total is ≤ 5 (K♥/K♦ count as -1)."
      : "";
    clearDrawnUI();
  } else if (s.phase === "TURN_DECIDE") {
    turnHint.textContent = myTurn
      ? "Decide: swap the drawn card (tap your card), or discard, or use power."
      : "Opponent deciding.";
  } else if (s.phase === "ENDED") {
    turnHint.textContent = "Round ended (all cards revealed).";
    actionHint.textContent = "";
    endRow.style.display = "flex";
    clearDrawnUI();
    const ended = s.ended;
    if (ended) {
      const lines = ended.scores.map(x => `${x.name}: ${x.score}`).join(" | ");
      setStatus(`Winner: ${ended.winnerName} — ${lines}`);
    }
  }

  // Enable/disable controls
  drawBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN"));
  discardBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") && !!s.discardTop);

  discardDrawnBtn.disabled = !(myTurn && s.phase === "TURN_DECIDE" && !!myDrawnCard);
  caboBtn.disabled = !(myTurn && s.phase === "TURN_DRAW");

  renderHands();
});

// Initial peek flash only
socket.on("peek:result", ({ index, card }) => {
  flashPeek(`Peeked your #${index + 1}: ${formatCard(card)} (score ${card.score})`);
});

// Draw result (private): show card + enable power UI
socket.on("turn:drawResult", ({ card, power }) => {
  // This event should only come to the current player.
  // Extra safety: if server says it's not my turn (race), ignore.
  if (!isMyTurn()) return;

  setDrawnUI(card, power);
  renderHands(); // enables swapping by clicking your card
});

// Power reveals flash only (memory)
socket.on("power:reveal", ({ kind, index, card }) => {
  if (kind === "own") flashPeek(`Peeked your #${index + 1}: ${formatCard(card)} (score ${card.score})`);
  else flashPeek(`Peeked opponent #${index + 1}: ${formatCard(card)} (score ${card.score})`);
});

// King preview confirm modal
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
