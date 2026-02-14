// =====================
// CONFIG
// =====================
const SERVER_URL = "https://kabo-server-1.onrender.com"; // <-- replace with your Render server URL

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
const centerMeta = document.getElementById("centerMeta");
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

// Private turn state
let myDrawnCard = null;
let myDrawnIsPower = false;

let powerBar = null;
let modal = null;

// Temporary reveal state for flip
const tempReveal = { my: new Map(), opp: new Map() };

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

// query param auto-join
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
  return `${c.r}${suitSym(c.s)}`;
}

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
}

function setDrawnUI(card, power) {
  ensurePowerUI();
  myDrawnCard = card;
  myDrawnIsPower = !!power;

  const title = document.getElementById("drawnTitle");
  title.textContent = power
    ? `You drew ${formatCard(card)} — Power available. Choose: swap OR use power OR play to center.`
    : `You drew ${formatCard(card)} — Choose: swap OR play to center.`;

  document.getElementById("usePowerBtn").disabled = !power;
  powerBar.style.display = "flex";
  actionHint.textContent = `You drew: ${formatCard(card)}. Tap one of your cards to swap OR play to center OR use power.`;
}

// =====================
// Modal / Power UI
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

  const playCenterBtn = document.createElement("button");
  playCenterBtn.id = "playCenterBtn";
  playCenterBtn.textContent = "Play to center";
  powerBar.appendChild(playCenterBtn);

  actionHint.parentElement.appendChild(powerBar);

  modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.display = "none";
  modal.style.placeItems = "center";
  modal.style.background = "rgba(0,0,0,.25)";
  modal.style.zIndex = "9999";

  const box = document.createElement("div");
  box.style.width = "min(560px, 92vw)";
  box.style.borderRadius = "18px";
  box.style.padding = "16px";
  box.style.background = "rgba(255,255,255,.94)";
  box.style.boxShadow = "0 18px 60px rgba(0,0,0,.18)";
  box.style.textAlign = "center";
  box.id = "modalBox";

  modal.appendChild(box);
  document.body.appendChild(modal);

  useBtn.addEventListener("click", runPowerFlow);
  playCenterBtn.addEventListener("click", doDiscardDrawn);
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
// Render dynamic hands (flip peeks for 3s)
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
        <div class="flipInner">
          <div class="face backFace">
            <div class="big">🂠</div>
          </div>
          <div class="face frontFace">
            <div class="big">${label}</div>
          </div>
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

  // OPP HAND (optional: allow temporary reveal on your screen for power peek)
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
        <div class="flipInner">
          <div class="face backFace">
            <div class="big">🂠</div>
          </div>
          <div class="face frontFace">
            <div class="big">${label}</div>
          </div>
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
  if (!top) return flashPeek("Nothing to burn on yet.");

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

  // steal-burn
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
// Power Flow
// =====================
function runPowerFlow() {
  if (!myDrawnCard) return;

  // ✅ If we're in CENTER_POWER, emit centerPower:* events, else normal power:* events
  const isCenterPower = (state?.phase === "CENTER_POWER");
  const prefix = isCenterPower ? "centerPower:" : "power:";

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
      <div style="opacity:.85;margin-bottom:12px;">(2 players: it comes back to you)</div>
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
      socket.emit(prefix + "queenUnseenSwap", { roomId: currentRoomId, myIndex: myI, oppIndex: oppI }, (res) => {
        if (!res?.ok) return setStatus(res?.error || "Power failed");
        clearDrawnUI();
        closeModal();
      });
    };
    return;
  }

  // King (K1) — unchanged here:
  // Your current server uses power:kingPreview / power:kingConfirm and needs a separate CENTER version.
  // So for now, if you try to use King while in CENTER_POWER, show a helpful message.
  if (r === "K") {
    if (isCenterPower) {
      showModal(`
        <div style="font-weight:900;margin-bottom:10px;">King Center Power not wired yet</div>
        <div style="opacity:.85;margin-bottom:12px;">
          You played a King to the center. To support this, we need server events:
          <b>centerPower:kingPreview</b> and <b>centerPower:kingConfirm</b>.
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button id="closeOnly">Okay</button>
        </div>
      `);
      document.getElementById("closeOnly").onclick = closeModal;
      return;
    }

    // existing normal King flow (drawn-card power)
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
});

// bypass
bypassBtn.addEventListener("click", () => {
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

  const my = me();
  const opp = opponent();

  if (!opp) setStatus("Waiting for your partner to join…");
  else if (!s.started) setStatus("Both players in. Host can start.");
  else setStatus(s.phase === "PEEK" ? "Peek phase" : "Game in progress");

  drawMeta.textContent = `Cards left: ${s.drawCount}`;
  centerMeta.textContent = s.discardTop ? `Top: ${formatCard(s.discardTop)}` : `Empty`;

  // show start only for host when 2 players
  startBtn.style.display = (!s.started && s.players[0]?.socketId === socket.id && s.players.length === 2)
    ? "inline-block" : "none";

  // host bypass visible once started OR even lobby (your choice)
  bypassBtn.style.display = (s.players[0]?.socketId === socket.id && s.players.length === 2) ? "inline-block" : "none";

  const myTurn = isMyTurn();

  // if not my turn, clear any drawn card UI
  if (!myTurn) {
    clearDrawnUI();
    closeModal();
  }

  if (s.phase === "PEEK") {
    peekHint.textContent = my ? `Peek remaining: ${my.peeksLeft}. Tap your cards (flip for 3s).` : "";
    turnHint.textContent = "Opponent is peeking too.";
    actionHint.textContent = "";
    clearDrawnUI();
  } else if (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") {
    peekHint.textContent = "";
    turnHint.textContent = myTurn
      ? "Your turn: Draw OR call CABO (< 10). Burn is always allowed."
      : "Opponent's turn.";
    actionHint.textContent = myTurn
      ? "CABO is allowed only if your total is < 10 (K♥/K♦ count as -1)."
      : "";
    clearDrawnUI();
  } else if (s.phase === "TURN_DECIDE") {
    turnHint.textContent = myTurn
      ? "Decide: swap the drawn card (tap your card), play to center, or use power."
      : "Opponent deciding.";
  } else if (s.phase === "ENDED") {
    turnHint.textContent = "Round ended (all cards revealed).";
    actionHint.textContent = "";
    endRow.style.display = "flex";
    clearDrawnUI();
    if (s.ended) {
      const lines = s.ended.scores.map(x => `${x.name}: ${x.score}`).join(" | ");
      setStatus(`Winner: ${s.ended.winnerName} — ${lines}`);
    }
  }

  // enable controls
  drawBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN"));
  discardDrawnBtn.disabled = !(myTurn && s.phase === "TURN_DECIDE" && !!myDrawnCard);
  caboBtn.disabled = !(myTurn && s.phase === "TURN_DRAW");
  burnBtn.disabled = !s.discardTop || ["LOBBY","PEEK","ENDED"].includes(s.phase);

  // show unlock if valentine unlocked (both can click)
  if (s.valentineUnlocked) {
    endRow.style.display = "flex";
  }

  renderHands();
});

// Peek -> flip card tile 3 seconds
socket.on("peek:result", ({ index, card }) => {
  revealMyCardFor3s(index, card);
});

// Draw result only to current player
socket.on("turn:drawResult", ({ card, power }) => {
  if (!isMyTurn()) return;
  setDrawnUI(card, power);
  renderHands();
});

// Power reveal -> flip for 3s
socket.on("power:reveal", ({ kind, index, card }) => {
  if (kind === "own") revealMyCardFor3s(index, card);
  else revealOppCardFor3s(index, card);
});

// King preview -> confirm swap
socket.on("king:preview", ({ myIndex, oppIndex, myCard, oppCard }) => {
  showModal(`
    <div style="font-weight:900;margin-bottom:10px;">King Preview</div>
    <div style="opacity:.92;margin-bottom:10px;">Your #${myIndex+1}: <b>${formatCard(myCard)}</b></div>
    <div style="opacity:.92;margin-bottom:14px;">Opponent #${oppIndex+1}: <b>${formatCard(oppCard)}</b></div>
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

// Wrong steal burn reveal
socket.on("burn:revealWrong", ({ index, card }) => {
  flashPeek(`Wrong steal-burn → Opponent #${index+1} was ${formatCard(card)} (info gained).`);
  revealOppCardFor3s(index, card);
});

// Valentine unlock (both)
socket.on("val:unlocked", () => {
  endRow.style.display = "flex";
});

//public/assets/photos =====================
// Valentine UI (synced)
// =====================
const photos = ["assets/photo1.jpeg","assets/photo2.jpeg","assets/photo3.jpeg"];
const audioFile = "assets/orangrez.mp3";

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

let idx = 0;
function goTo(i) {
  idx = (i + photos.length) % photos.length;
  track.style.transform = `translateX(-${idx * 100}%)`;
  [...dots.children].forEach((d,k)=>d.classList.toggle("active", k===idx));
}

let autoTimer = null;
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

  // progressively annoy her into YES 😄
  const noTexts = [
    "No",
    "Come on…",
    "Please 😭",
    "For real?",
    "Okay stop 😤",
    "I’m getting shy now…",
    "Fine. Only Yes exists."
  ];
  const t = noTexts[Math.min(n, noTexts.length - 1)];
  noBtn.textContent = t;

  // grow yes button
  const scale = Math.min(1 + n * 0.12, 2.1);
  yesBtn.style.transform = `scale(${scale})`;

  // eventually hide no
  if (n >= 6) {
    noBtn.style.display = "none";
  } else {
    noBtn.style.display = "inline-block";
  }

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

// Mirror val actions live
socket.on("val:update", ({ valState }) => {
  applyValState(valState);
});

yesBtn.addEventListener("click", () => {
  socket.emit("val:yes", { roomId: currentRoomId }, () => {});
});
noBtn.addEventListener("click", () => {
  socket.emit("val:no", { roomId: currentRoomId }, () => {});
});

// When unlock button pressed -> switch to val page (both can do it)
unlockBtn.addEventListener("click", () => {
  gameScreen.style.display = "none";
  valScreen.style.display = "block";
  applyValState(state?.valState || { noClicks: 0, accepted: false });
});

// If host bypass unlocks, auto-show val page too (optional behavior)
socket.on("val:unlocked", () => {
  // auto-switch both users to val page if you want:
  gameScreen.style.display = "none";
  valScreen.style.display = "block";
  applyValState(state?.valState || { noClicks: 0, accepted: false });
});

socket.on("center:powerAvailable", ({ card }) => {
  // This is a power card that is ALREADY on center pile
  ensurePowerUI();
  myDrawnCard = card;          // reuse UI, but it's "center power"
  myDrawnIsPower = true;

  actionHint.textContent = `Center power: ${formatCard(card)}. Use power now or skip.`;

  const title = document.getElementById("drawnTitle");
  title.textContent = `CENTER POWER: ${formatCard(card)} — Use Power or Skip`;

  document.getElementById("usePowerBtn").disabled = false;

  // Replace "Play to center" button behavior in this mode:
  const playBtn = document.getElementById("playCenterBtn");
  playBtn.textContent = "Skip power";
  playBtn.onclick = () => {
    socket.emit("centerPower:skip", { roomId: currentRoomId }, (res) => {
      if (!res?.ok) setStatus(res?.error || "Skip failed");
      clearDrawnUI();
      closeModal();
    });
  };

  powerBar.style.display = "flex";
});
