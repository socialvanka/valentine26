// =====================
// CONFIG
// =====================
const SERVER_URL = "https://kabo-server-1.onrender.com"; // <-- your Render server URL

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
const burnBtn = document.getElementById("burnBtn");
const discardDrawnBtn = document.getElementById("discardDrawnBtn");
const caboBtn = document.getElementById("caboBtn");

const drawMeta = document.getElementById("drawMeta");
const centerMeta = document.getElementById("centerMeta"); // ✅ use this (not discardMeta)
const actionHint = document.getElementById("actionHint");

const logEl = document.getElementById("log");
const endRow = document.getElementById("endRow");
const unlockBtn = document.getElementById("unlockBtn");
const bypassBtn = document.getElementById("bypassBtn");

// =====================
// DOM - Valentine
// =====================
const subtitle = document.getElementById("subtitle");
const yesBtn = document.getElementById("yesBtn");
const noBtn = document.getElementById("noBtn");
const btnRow = document.getElementById("btnRow");
const reveal = document.getElementById("reveal");
const sweetLine = document.getElementById("sweetLine");
const micdrop = document.getElementById("micdrop");

const track = document.getElementById("track");
const dots = document.getElementById("dots");
const audio = document.getElementById("bgAudio");
const audioCtl = document.getElementById("audioCtl");
const audioBtn = document.getElementById("audioBtn");
const audioStatus = document.getElementById("audioStatus");

// =====================
// State
// =====================
let currentRoomId = null;
let state = null;

// "active power card" (either drawn OR center-power)
let myDrawnCard = null;
let myDrawnIsPower = false;

let powerBar = null;
let modal = null;

// Temporary reveal state for flip
const tempReveal = { my: new Map(), opp: new Map() };

// =====================
// Auto-join from URL
// =====================
const params = new URLSearchParams(location.search);
const roomFromUrl = params.get("room");
if (roomFromUrl) roomInput.value = roomFromUrl.toUpperCase();

// =====================
// Helpers
// =====================
function range(n){ return Array.from({ length: n }, (_, i) => i); }
function setStatus(s) { gameStatus.textContent = s; }
function me() { return state?.players?.find(p => p.isMe); }
function opponent() { return state?.players?.find(p => !p.isMe); }
function isMyTurn() { return state?.turnSocketId === socket.id; }

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
  return `${c.r}${suitSym(c.s)}`;
}

// ===== 3s flip reveal =====
function revealMyCardFor3s(index, card) {
  tempReveal.my.set(index, card);
  renderHands();
  setTimeout(() => {
    tempReveal.my.delete(index);
    renderHands();
  }, 3000);
}

function revealOppCardFor3s(index, card) {
  tempReveal.opp.set(index, card);
  renderHands();
  setTimeout(() => {
    tempReveal.opp.delete(index);
    renderHands();
  }, 3000);
}

// =====================
// Power UI / Modal
// =====================
function ensurePowerUI() {
  if (powerBar) return;

  powerBar = document.createElement("div");
  powerBar.style.marginTop = "10px";
  powerBar.style.display = "none";
  powerBar.style.gap = "10px";
  powerBar.style.justifyContent = "center";
  powerBar.style.flexWrap = "wrap";

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
  discardBtn2.textContent = "Play to center";
  powerBar.appendChild(discardBtn2);

  const skipBtn = document.createElement("button");
  skipBtn.id = "skipPowerBtn";
  skipBtn.textContent = "Skip power";
  powerBar.appendChild(skipBtn);

  // Put it on the board so it always exists
  board.appendChild(powerBar);

  // Modal overlay
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

  // Default wiring (drawn-card mode)
  useBtn.addEventListener("click", runPowerFlow);
  discardBtn2.addEventListener("click", doDiscardDrawn);

  // Default skip just hides UI (center-power will override onclick)
  skipBtn.addEventListener("click", () => {
    clearDrawnUI();
    closeModal();
  });
}

function showModal(html) {
  ensurePowerUI();
  document.getElementById("modalBox").innerHTML = html;
  modal.style.display = "grid";
}

function closeModal() {
  if (modal) modal.style.display = "none";
}

function clearDrawnUI() {
  myDrawnCard = null;
  myDrawnIsPower = false;
  if (powerBar) powerBar.style.display = "none";
}

function setDrawnUI(card, power) {
  ensurePowerUI();

  // reset button visibility each time
  const title = document.getElementById("drawnTitle");
  const useBtn = document.getElementById("usePowerBtn");
  const discardBtn2 = document.getElementById("discardPowerBtn");
  const skipBtn = document.getElementById("skipPowerBtn");

  discardBtn2.style.display = "inline-block";
  skipBtn.style.display = "none"; // skip not used for drawn-card mode

  myDrawnCard = card;
  myDrawnIsPower = !!power;

  title.textContent = power
    ? `You drew ${formatCard(card)} — Power available. Swap OR use power OR play to center.`
    : `You drew ${formatCard(card)} — Swap OR play to center.`;

  useBtn.disabled = !power;

  powerBar.style.display = "flex";
  powerBar.style.opacity = "1";
  powerBar.style.pointerEvents = "auto";
  powerBar.style.visibility = "visible";

  actionHint.textContent = `You drew: ${formatCard(card)}. Tap your card to swap OR play to center OR use power.`;
}

// =====================
// Render hands (flip peeks for 3s)
// =====================
function renderHands() {
  myGrid.innerHTML = "";
  oppGrid.innerHTML = "";

  const my = me();
  const opp = opponent();
  if (!my || !opp) return;

  // MY HAND
  for (let i = 0; i < my.handCount; i++) {
    const endedCard = state.phase === "ENDED" ? my.hand[i] : null;

    const isRevealedNow =
      (state.phase !== "ENDED") && tempReveal.my.has(i);

    const shownCard = tempReveal.my.get(i) || endedCard;

    const label = (state.phase === "ENDED")
      ? `${shownCard.r}${suitSym(shownCard.s)} (score ${shownCard.score})`
      : isRevealedNow
        ? `${shownCard.r}${suitSym(shownCard.s)}`
        : "🂠";

    const div = document.createElement("div");
    div.className = "cardCell" + (isRevealedNow ? " revealed" : "");

    div.innerHTML = `
      <div class="flipCard">
        <div class="flipInner ${isRevealedNow ? "flipped" : ""}">
          <div class="face backFace"><div class="big">🂠</div></div>
          <div class="face frontFace"><div class="big">${label}</div></div>
        </div>
      </div>
      <div class="mini">#${i+1}</div>
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

  // OPP HAND
  for (let i = 0; i < opp.handCount; i++) {
    const endedCard = state.phase === "ENDED" ? opp.hand[i] : null;

    const isRevealedOppNow =
      (state.phase !== "ENDED") && tempReveal.opp.has(i);

    const shownOpp = tempReveal.opp.get(i) || endedCard;

    const label = (state.phase === "ENDED")
      ? `${shownOpp.r}${suitSym(shownOpp.s)} (score ${shownOpp.score})`
      : isRevealedOppNow
        ? `${shownOpp.r}${suitSym(shownOpp.s)}`
        : "🂠";

    const div = document.createElement("div");
    div.className = "cardCell" + (isRevealedOppNow ? " revealed" : "");

    div.innerHTML = `
      <div class="flipCard">
        <div class="flipInner ${isRevealedOppNow ? "flipped" : ""}">
          <div class="face backFace"><div class="big">🂠</div></div>
          <div class="face frontFace"><div class="big">${label}</div></div>
        </div>
      </div>
      <div class="mini">#${i+1}</div>
    `;

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

function doTakeDraw() {
  clearDrawnUI();
  socket.emit("turn:take", { roomId: currentRoomId, source: "draw" }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Draw failed");
  });
}

// "Play to center" (server event name: turn:discardDrawn)
function doDiscardDrawn() {
  socket.emit("turn:discardDrawn", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Play to center failed");
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
// Burn UI
// =====================
function openBurnModal() {
  const top = state?.discardTop;
  if (!top) return;

  showModal(`
    <div style="font-weight:900;margin-bottom:10px;">Burn (Top: ${formatCard(top)})</div>
    <div style="opacity:.85;margin-bottom:10px;">Choose what to burn:</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button id="burnMine">Burn from my cards</button>
      <button id="burnOpp">Steal-burn opponent</button>
      <button id="burnCancel">Cancel</button>
    </div>
  `);

  document.getElementById("burnCancel").onclick = closeModal;
  document.getElementById("burnMine").onclick = () => pickBurnIndex("self");
  document.getElementById("burnOpp").onclick = () => pickBurnIndex("opp");
}

function pickBurnIndex(target) {
  const myCount = me().handCount;
  const oppCount = opponent().handCount;

  if (target === "self") {
    showModal(`
      <div style="font-weight:900;margin-bottom:10px;">Burn from MY cards</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick one (blind):</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        ${range(myCount).map(i => `<button data-i="${i}">#${i+1}</button>`).join("")}
      </div>
      <div style="margin-top:12px;"><button id="burnCancel">Cancel</button></div>
    `);
    document.getElementById("burnCancel").onclick = closeModal;

    document.querySelectorAll("[data-i]").forEach(b => {
      b.onclick = () => {
        const idx = +b.getAttribute("data-i");
        socket.emit("burn:attempt", { roomId: currentRoomId, target: "self", index: idx }, (res) => {
          if (!res?.ok) setStatus(res?.error || "Burn failed");
          closeModal();
        });
      };
    });
    return;
  }

  showModal(`
    <div style="font-weight:900;margin-bottom:10px;">Steal-burn OPPONENT</div>
    <div style="opacity:.85;margin-bottom:10px;">Pick opponent card (blind):</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      ${range(oppCount).map(i => `<button data-o="${i}">Opp #${i+1}</button>`).join("")}
    </div>
    <div style="margin-top:12px;"><button id="burnCancel">Cancel</button></div>
  `);

  document.getElementById("burnCancel").onclick = closeModal;

  document.querySelectorAll("[data-o]").forEach(b => {
    b.onclick = () => {
      const oppIdx = +b.getAttribute("data-o");
      pickGiveIndex(oppIdx);
    };
  });
}

function pickGiveIndex(oppIdx) {
  const myCount = me().handCount;

  showModal(`
    <div style="font-weight:900;margin-bottom:10px;">Choose a card to GIVE (if burn succeeds)</div>
    <div style="opacity:.85;margin-bottom:10px;">Pick from your hand (blind):</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      ${range(myCount).map(i => `<button data-g="${i}">Give #${i+1}</button>`).join("")}
    </div>
    <div style="margin-top:12px;"><button id="burnCancel">Cancel</button></div>
  `);

  document.getElementById("burnCancel").onclick = closeModal;

  document.querySelectorAll("[data-g]").forEach(b => {
    b.onclick = () => {
      const giveIndex = +b.getAttribute("data-g");
      socket.emit("burn:attempt", {
        roomId: currentRoomId,
        target: "opp",
        index: oppIdx,
        giveIndex
      }, (res) => {
        if (!res?.ok) setStatus(res?.error || "Steal burn failed");
        closeModal();
      });
    };
  });
}

// =====================
// Power Flow (drawn OR center)
// =====================
function runPowerFlow() {
  if (!myDrawnCard) return;

  const isCenterPower = (state?.phase === "CENTER_POWER");
  const prefix = isCenterPower ? "centerPower:" : "power:";
  const r = myDrawnCard.r;

  // 7/8 peek own
  if (r === "7" || r === "8") {
    showModal(`
      <div style="font-weight:800;margin-bottom:10px;">Use ${formatCard(myDrawnCard)} → Peek one of YOUR cards</div>
      <div style="opacity:.85;margin-bottom:10px;">Pick a position:</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        ${[0,1,2,3].map(i => `<button data-i="${i}">Peek #${i+1}</button>`).join("")}
      </div>
      <div style="margin-top:12px;"><button id="closeM">Cancel</button></div>
    `);
    document.getElementById("closeM").onclick = closeModal;

    document.querySelectorAll("[data-i]").forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-i"), 10);
        socket.emit(prefix + "peekOwn", { roomId: currentRoomId, handIndex: idx }, (res) => {
          if (!res?.ok) return setStatus(res?.error || "Power failed");
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
      <div style="opacity:.85;margin-bottom:10px;">Pick a position:</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        ${[0,1,2,3].map(i => `<button data-i="${i}">Peek Opp #${i+1}</button>`).join("")}
      </div>
      <div style="margin-top:12px;"><button id="closeM">Cancel</button></div>
    `);
    document.getElementById("closeM").onclick = closeModal;

    document.querySelectorAll("[data-i]").forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-i"), 10);
        socket.emit(prefix + "peekOpp", { roomId: currentRoomId, oppIndex: idx }, (res) => {
          if (!res?.ok) return setStatus(res?.error || "Power failed");
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
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button id="doIt">Use Jack</button>
        <button id="cancel">Cancel</button>
      </div>
    `);
    document.getElementById("cancel").onclick = closeModal;
    document.getElementById("doIt").onclick = () => {
      socket.emit(prefix + "jackSkip", { roomId: currentRoomId }, (res) => {
        if (!res?.ok) return setStatus(res?.error || "Power failed");
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
      document.querySelectorAll(".myPick").forEach(x => x.style.outline = "none");
      b.style.outline = "2px solid rgba(124,77,255,.4)";
      confirmBtn.disabled = !(myI !== null && oppI !== null);
    });

    document.querySelectorAll(".oppPick").forEach(b => b.onclick = () => {
      oppI = parseInt(b.getAttribute("data-i"), 10);
      document.querySelectorAll(".oppPick").forEach(x => x.style.outline = "none");
      b.style.outline = "2px solid rgba(255,77,109,.35)";
      confirmBtn.disabled = !(myI !== null && oppI !== null);
    });

    confirmBtn.onclick = () => {
      socket.emit(prefix + "queenUnseenSwap", { roomId: currentRoomId, myIndex: myI, oppIndex: oppI }, (res) => {
        if (!res?.ok) return setStatus(res?.error || "Power failed");
        clearDrawnUI();
        closeModal();
      });
    };
    return;
  }

  // King center-power not wired unless server supports it
  if (r === "K" && isCenterPower) {
    showModal(`
      <div style="font-weight:900;margin-bottom:10px;">King center-power not enabled</div>
      <div style="opacity:.85;">Server needs centerPower:kingPreview + centerPower:kingConfirm.</div>
      <div style="margin-top:12px;"><button id="ok">Okay</button></div>
    `);
    document.getElementById("ok").onclick = closeModal;
    return;
  }

  setStatus("No power available for this card.");
}

// =====================
// Buttons
// =====================
createBtn.addEventListener("click", () => {
  const name = (nameInput.value || "Host").trim();
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

drawBtn.addEventListener("click", doTakeDraw);
discardDrawnBtn.addEventListener("click", doDiscardDrawn);
caboBtn.addEventListener("click", doCabo);
burnBtn.addEventListener("click", openBurnModal);

unlockBtn?.addEventListener("click", () => {
  gameScreen.style.display = "none";
  valScreen.style.display = "block";
  applyValState(state?.valState || { noClicks: 0, accepted: false });
});

bypassBtn?.addEventListener("click", () => {
  if (!currentRoomId) return;
  socket.emit("room:bypass", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Bypass failed");
  });
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

  drawMeta.textContent = `Cards left: ${s.drawCount}`;
  centerMeta.textContent = `Center pile: ${s.discardCount || 0}`;

  // If your server also sends discardTop for burn:
  if (s.discardTop) {
    // keep for burn UI
  }

  startBtn.style.display =
    (!s.started && s.players[0]?.socketId === socket.id && s.players.length === 2)
      ? "inline-block"
      : "none";

  const myTurn = isMyTurn();

  // ✅ Clear private UI ONLY when appropriate
  if (!myTurn) {
    clearDrawnUI();
    closeModal();
  } else {
    if (!["TURN_DECIDE", "CENTER_POWER"].includes(s.phase)) {
      clearDrawnUI();
      closeModal();
    }
  }

  // Phase text
  const myP = me();
  const oppP = opponent();
  if (!oppP) setStatus("Waiting for your partner to join…");
  else if (!s.started) setStatus("Both players in. Host can start.");
  else setStatus("Game in progress");

  if (s.phase === "PEEK") {
    peekHint.textContent = myP ? `Peek remaining: ${myP.peeksLeft}. Tap your cards (3s flip).` : "";
    turnHint.textContent = "Opponent is peeking too.";
    actionHint.textContent = "";
  } else if (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") {
    peekHint.textContent = "";
    turnHint.textContent = myTurn ? "Your turn: Draw / Burn / CABO" : "Opponent's turn.";
    actionHint.textContent = myTurn ? "CABO allowed only if total ≤ 9 (K♥/K♦ = -1)." : "";
  } else if (s.phase === "TURN_DECIDE") {
    peekHint.textContent = "";
    turnHint.textContent = myTurn
      ? "Decide: swap (tap your card), or play to center, or use power."
      : "Opponent deciding…";
  } else if (s.phase === "CENTER_POWER") {
    peekHint.textContent = "";
    turnHint.textContent = myTurn ? "Center power: Use it now or Skip." : "Opponent is using center power…";
    actionHint.textContent = myTurn ? "Use Power or Skip power." : "";
  } else if (s.phase === "ENDED") {
    peekHint.textContent = "";
    turnHint.textContent = "Round ended.";
    actionHint.textContent = "";
    endRow.style.display = "flex";
  }

  // Buttons enabled/disabled
  drawBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN"));
  burnBtn.disabled = !(s.phase !== "PEEK" && s.phase !== "ENDED"); // you can tighten this based on server rules
  discardDrawnBtn.disabled = !(myTurn && s.phase === "TURN_DECIDE" && !!myDrawnCard);
  caboBtn.disabled = !(myTurn && s.phase === "TURN_DRAW");

  renderHands();
});

// Peek result => flip tile 3 seconds
socket.on("peek:result", ({ index, card }) => {
  revealMyCardFor3s(index, card);
});

// Draw result => only to current player
socket.on("turn:drawResult", ({ card, power }) => {
  if (!isMyTurn()) return;
  setDrawnUI(card, power);
  renderHands();
});

// Power reveal => flip tile 3 seconds
socket.on("power:reveal", ({ kind, index, card }) => {
  if (kind === "own") revealMyCardFor3s(index, card);
  else revealOppCardFor3s(index, card);
});

// Burn wrong reveal (optional)
socket.on("burn:revealWrong", ({ index, card }) => {
  revealOppCardFor3s(index, card);
});

// ✅ Center power available => show Use Power + Skip
socket.on("center:powerAvailable", ({ card }) => {
  ensurePowerUI();

  myDrawnCard = card;
  myDrawnIsPower = true;

  const title = document.getElementById("drawnTitle");
  const useBtn = document.getElementById("usePowerBtn");
  const discardBtn2 = document.getElementById("discardPowerBtn");
  const skipBtn = document.getElementById("skipPowerBtn");

  title.textContent = `CENTER POWER: ${formatCard(card)} — Use Power or Skip`;
  actionHint.textContent = `Center power: ${formatCard(card)}. Use power now or skip.`;

  // center-power mode controls
  discardBtn2.style.display = "none";          // not applicable
  skipBtn.style.display = "inline-block";      // ✅ show
  useBtn.style.display = "inline-block";       // ✅ show
  useBtn.disabled = false;

  skipBtn.onclick = () => {
    socket.emit("centerPower:skip", { roomId: currentRoomId }, (res) => {
      if (!res?.ok) return setStatus(res?.error || "Skip failed");
      clearDrawnUI();
      closeModal();
    });
  };

  powerBar.style.display = "flex";
  powerBar.style.opacity = "1";
  powerBar.style.pointerEvents = "auto";
  powerBar.style.visibility = "visible";
});

// Valentine unlock => show unlock button
socket.on("val:unlocked", () => {
  endRow.style.display = "flex";
});

// =====================
// Valentine UI (synced)
// =====================
const photos = ["assets/photo1.jpeg","assets/photo2.jpeg","assets/photo3.jpeg"];
const audioFile = "assets/orangrez.mp3";

let idx = 0;
let autoTimer = null;

function buildCarousel() {
  track.innerHTML = "";
  dots.innerHTML = "";
  photos.forEach((src, i) => {
    const slide = document.createElement("div");
    slide.className = "slide";
    slide.innerHTML = `<img src="${src}" alt="Photo ${i+1}"/>`;
    track.appendChild(slide);

    const dot = document.createElement("div");
    dot.className = "dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => goTo(i));
    dots.appendChild(dot);
  });
}

function goTo(i) {
  idx = (i + photos.length) % photos.length;
  track.style.transform = `translateX(-${idx * 100}%)`;
  [...dots.children].forEach((d,k)=>d.classList.toggle("active", k===idx));
}

function startAutoCarousel() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = setInterval(() => goTo(idx + 1), 2600);
}

audio.src = audioFile;

async function tryPlayAudio() {
  try {
    audio.volume = 0.5;
    await audio.play();
    audioCtl.style.display = "none";
  } catch {
    audioCtl.style.display = "inline-flex";
    audioStatus.textContent = "Tap to play our song 💜";
    audioBtn.textContent = "Play";
  }
}
audioBtn.addEventListener("click", tryPlayAudio);

function applyValState(valState) {
  const n = valState?.noClicks || 0;
  const accepted = !!valState?.accepted;

  const noTexts = [
    "No",
    "Come on bebo…",
    "Please? 🥺",
    "Okay stop being cute 😭",
    "Last chance…",
    "Nahi chalega 😌",
    "Fine. Only YES exists now."
  ];

  const t = noTexts[Math.min(n, noTexts.length - 1)];
  noBtn.textContent = t;

  const scale = Math.min(1 + n * 0.12, 2.1);
  yesBtn.style.transform = `scale(${scale})`;

  if (n >= 6) noBtn.style.display = "none";
  else noBtn.style.display = "inline-block";

  if (accepted) {
    subtitle.textContent = "I knew it 💜";
    btnRow.style.display = "none";
    reveal.classList.add("show");
    sweetLine.textContent = "Now come here… I have something for you 💜";
    buildCarousel();
    goTo(0);
    startAutoCarousel();
    tryPlayAudio();
  }
}

socket.on("val:update", ({ valState }) => {
  applyValState(valState);
});

yesBtn.addEventListener("click", () => {
  socket.emit("val:yes", { roomId: currentRoomId }, () => {});
});

noBtn.addEventListener("click", () => {
  socket.emit("val:no", { roomId: currentRoomId }, () => {});
});

socket.on("val:unlocked", () => {
  gameScreen.style.display = "none";
  valScreen.style.display = "block";
  applyValState(state?.valState || { noClicks: 0, accepted: false });
});
