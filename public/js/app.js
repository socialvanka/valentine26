// =====================
// CONFIG
// =====================
const SERVER_URL = "https://kabo-server.onrender.com"; // <-- your server URL
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
const swapBtn = document.getElementById("swapBtn");
const discardDrawnBtn = document.getElementById("discardDrawnBtn");
const caboBtn = document.getElementById("caboBtn");

const drawMeta = document.getElementById("drawMeta");
const centerMeta = document.getElementById("centerMeta");
const centerCardEl = document.getElementById("centerCard");
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
const track = document.getElementById("track");
const dots = document.getElementById("dots");
const audio = document.getElementById("bgAudio");
const audioCtl = document.getElementById("audioCtl");
const audioBtn = document.getElementById("audioBtn");
const audioStatus = document.getElementById("audioStatus");

const livePanel = document.getElementById("livePanel");
const liveFeed = document.getElementById("liveFeed");

// =====================
// State
// =====================
let currentRoomId = null;
let state = null;

// drawn card is PRIVATE to the current player
let myDrawnCard = null;
let myDrawnIsPower = false;

// used to prevent infinite echo loops during sync
let suppressValEmit = false;

// Valentine state (local)
let noStep = 0;
let yesScale = 1;

const noScript = [
  "No",
  "Come on please 😭",
  "Please for real 🥺",
  "You’re really doing this? 😤",
  "Last chance… 😳",
  "Okay fine… (but still yes) 💜"
];

// Photos + Audio (edit paths)
const photos = [
  "assets/photo1.jpeg",
  "assets/photo2.jpeg",
  "assets/photo3.jpeg"
];
const audioFile = "assets/orangrez.mp3";

// =====================
// Helpers
// =====================
function setStatus(s) { gameStatus.textContent = s; }
function me() { return state?.players?.find(p => p.isMe); }
function opponent() { return state?.players?.find(p => !p.isMe); }
function isMyTurn() { return state?.turnSocketId === socket.id; }
function isHost() { return state?.players?.[0]?.socketId === socket.id; }

function suitSym(s) {
  return ({S:"♠",H:"♥",D:"♦",C:"♣"})[s] ?? s;
}
function formatCardShort(c) {
  if (!c) return "—";
  return `${c.r}${suitSym(c.s)}`;
}
function formatCardFull(c) {
  if (!c) return "—";
  return `${c.r}${suitSym(c.s)} (base ${c.base})`;
}

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

function clearDrawn() {
  myDrawnCard = null;
  myDrawnIsPower = false;
  actionHint.textContent = "";
}

function pushLive(msg) {
  if (!liveFeed) return;
  const div = document.createElement("div");
  div.textContent = "• " + msg;
  liveFeed.prepend(div);
}

// =====================
// Card flip render (peek / power reveal)
// =====================
function makeCardCell(labelFront, labelBack, mini) {
  const cell = document.createElement("div");
  cell.className = "cardCell";

  const flip = document.createElement("div");
  flip.className = "flip";

  const front = document.createElement("div");
  front.className = "face front";
  front.textContent = labelFront;

  const back = document.createElement("div");
  back.className = "face back";
  back.textContent = labelBack;

  flip.appendChild(front);
  flip.appendChild(back);

  const miniEl = document.createElement("div");
  miniEl.className = "mini";
  miniEl.textContent = mini;

  cell.appendChild(flip);
  cell.appendChild(miniEl);

  return { cell, flip, back, front };
}

function flipForSeconds(cellFlip, backText, ms=3000) {
  // set back face text
  const backFace = cellFlip.querySelector(".face.back");
  if (backFace) backFace.textContent = backText;

  cellFlip.classList.add("flipped");
  setTimeout(() => cellFlip.classList.remove("flipped"), ms);
}

// =====================
// Render hands (always hidden unless END)
// + clickable during peek and swap
// =====================
function renderHands() {
  myGrid.innerHTML = "";
  oppGrid.innerHTML = "";

  const my = me();
  const opp = opponent();
  if (!my || !opp) return;

  // My cards (always hidden except ENDED)
  for (let i = 0; i < 4; i++) {
    const endedCard = state.phase === "ENDED" ? my.hand[i] : null;

    const { cell, flip } = makeCardCell(
      "🂠",
      state.phase === "ENDED" ? `${endedCard.r}${suitSym(endedCard.s)} (${endedCard.score})` : "🂠",
      `#${i+1}`
    );

    if (state.phase === "PEEK" && my.peeksLeft > 0) {
      cell.classList.add("clickable");
      cell.addEventListener("click", () => doPeek(i));
    }

    if (state.phase === "TURN_DECIDE" && isMyTurn() && myDrawnCard) {
      // swap option: user picks which card to replace
      cell.classList.add("clickable");
      cell.addEventListener("click", () => doSwap(i));
    }

    myGrid.appendChild(cell);
  }

  // Opponent cards
  for (let i = 0; i < 4; i++) {
    const endedCard = state.phase === "ENDED" ? opp.hand[i] : null;

    const { cell } = makeCardCell(
      "🂠",
      state.phase === "ENDED" ? `${endedCard.r}${suitSym(endedCard.s)} (${endedCard.score})` : "🂠",
      `#${i+1}`
    );

    oppGrid.appendChild(cell);
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

function doDraw() {
  clearDrawn();
  socket.emit("turn:draw", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Draw failed");
  });
}

function doSwap(i) {
  socket.emit("turn:swap", { roomId: currentRoomId, handIndex: i }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Swap failed");
    clearDrawn();
  });
}

function doDiscardDrawn() {
  socket.emit("turn:discardDrawn", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Play to center failed");
    clearDrawn();
  });
}

function doCabo() {
  socket.emit("turn:cabo", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) {
      actionHint.textContent = res?.error || "CABO not allowed.";
      return setStatus(res?.error || "CABO failed");
    }
    clearDrawn();
  });
}

// =====================
// Controls
// =====================
createBtn.addEventListener("click", () => {
  const name = (nameInput.value || "Player 1").trim();
  socket.emit("room:create", { name }, (res) => {
    if (!res?.ok) return setStatus(res?.error || "Create failed");
    currentRoomId = res.roomId;
    showRoomUI(currentRoomId);
    setStatus(`Room created. Share code ${currentRoomId} with her.`);
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

// swap button is just a hint; actual swap is clicking a card
swapBtn.addEventListener("click", () => {
  if (!myDrawnCard) return;
  actionHint.textContent = "Tap one of your cards to swap the drawn card into that position.";
});

unlockBtn?.addEventListener("click", () => {
  if (!currentRoomId) return gotoValentine();
  socket.emit("nav:unlockValentine", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Unlock failed");
  });
});

bypassBtn?.addEventListener("click", () => {
  if (!currentRoomId) return;
  socket.emit("nav:bypass", { roomId: currentRoomId }, (res) => {
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

  if (!opp) setStatus("Waiting for her to join…");
  else if (!s.started) setStatus("Both players in. Host can start.");
  else setStatus(s.phase === "PEEK" ? "Peek phase" : "Game in progress");

  drawMeta.textContent = `Cards left: ${s.drawCount}`;
  centerMeta.textContent = s.centerTop ? `Top: ${formatCardShort(s.centerTop)}` : "Empty";
  centerCardEl.textContent = s.centerTop ? `${formatCardShort(s.centerTop)}` : "—";

  // host-only bypass button visible once room exists
  bypassBtn.style.display = (isHost() && currentRoomId) ? "inline-flex" : "none";

  startBtn.style.display = (!s.started && isHost() && s.players.length === 2) ? "inline-block" : "none";

  // If it's not my turn, ensure drawn UI cleared
  if (!isMyTurn()) clearDrawn();

  // Phase hints
  if (s.phase === "PEEK") {
    peekHint.textContent = my ? `Peek remaining: ${my.peeksLeft}. Tap your cards (they flip for 3s).` : "";
    turnHint.textContent = "Opponent is peeking too.";
    actionHint.textContent = "";
    clearDrawn();
  } else if (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") {
    peekHint.textContent = "";
    turnHint.textContent = isMyTurn()
      ? "Your turn: Draw, or call CABO (< 10)."
      : "Opponent's turn.";
    actionHint.textContent = isMyTurn()
      ? "CABO allowed only if your total is < 10 (K♥/K♦ count as -1)."
      : "";
    clearDrawn();
  } else if (s.phase === "TURN_DECIDE") {
    turnHint.textContent = isMyTurn()
      ? "Decide: swap the drawn card (tap your card) or play drawn to center."
      : "Opponent deciding.";
  } else if (s.phase === "ENDED") {
    turnHint.textContent = "Round ended (all cards revealed).";
    actionHint.textContent = "";
    endRow.style.display = "flex";
    clearDrawn();

    // Non-host ALWAYS gets unlock
    if (!isHost()) {
      unlockBtn.textContent = "Unlock Valentine 💜";
      unlockBtn.disabled = false;
    }

    const ended = s.ended;
    if (ended) {
      const lines = ended.scores.map(x => `${x.name}: ${x.score}`).join(" | ");
      setStatus(`Winner: ${ended.winnerName} — ${lines}`);
    }
  } else {
    endRow.style.display = "none";
  }

  // Enable/disable controls
  drawBtn.disabled = !(isMyTurn() && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN"));
  caboBtn.disabled = !(isMyTurn() && s.phase === "TURN_DRAW");
  discardDrawnBtn.disabled = !(isMyTurn() && s.phase === "TURN_DECIDE" && !!myDrawnCard);
  swapBtn.disabled = !(isMyTurn() && s.phase === "TURN_DECIDE" && !!myDrawnCard);

  renderHands();
});

// Peek result: flip that specific card for 3 seconds
socket.on("peek:result", ({ index, card }) => {
  // Find my grid cell at index
  const cell = myGrid.children[index];
  if (!cell) return;
  const flip = cell.querySelector(".flip");
  if (!flip) return;
  flipForSeconds(flip, `${formatCardShort(card)} (${card.score})`, 3000);
});

// Draw result (private)
socket.on("turn:drawResult", ({ card, power }) => {
  if (!isMyTurn()) return;
  myDrawnCard = card;
  myDrawnIsPower = !!power;

  actionHint.textContent = power
    ? `You drew ${formatCardFull(card)} — you can swap OR play to center OR use its power.`
    : `You drew ${formatCardFull(card)} — swap OR play to center.`;

  // Enable click-to-swap
  renderHands();

  // If power, show a small inline prompt via confirm-style buttons
  if (myDrawnIsPower) showPowerInline(card);
});

// Power reveal: flip chosen card for 3 seconds (PRIVATE)
socket.on("power:reveal", ({ kind, index, card }) => {
  if (kind === "own") {
    const cell = myGrid.children[index];
    if (!cell) return;
    const flip = cell.querySelector(".flip");
    if (!flip) return;
    flipForSeconds(flip, `${formatCardShort(card)} (${card.score})`, 3000);
  } else {
    const cell = oppGrid.children[index];
    if (!cell) return;
    const flip = cell.querySelector(".flip");
    if (!flip) return;
    flipForSeconds(flip, `${formatCardShort(card)} (${card.score})`, 3000);
  }
});

// King preview modal
socket.on("king:preview", ({ myIndex, oppIndex, myCard, oppCard }) => {
  const ok = confirm(
    `KING PREVIEW:\nYour #${myIndex+1}: ${formatCardFull(myCard)}\nOpp #${oppIndex+1}: ${formatCardFull(oppCard)}\n\nConfirm swap?`
  );

  socket.emit("power:kingConfirm", { roomId: currentRoomId, confirm: !!ok }, (res) => {
    if (!res?.ok) setStatus(res?.error || "King confirm failed");
    clearDrawn();
  });
});

// =====================
// Power inline UI (simple, no heavy modal)
// =====================
function showPowerInline(card) {
  // Minimal: append a row of power buttons under actionHint
  // Remove any old
  const old = document.getElementById("powerInline");
  if (old) old.remove();

  const wrap = document.createElement("div");
  wrap.id = "powerInline";
  wrap.style.marginTop = "10px";
  wrap.style.display = "flex";
  wrap.style.gap = "10px";
  wrap.style.justifyContent = "center";
  wrap.style.flexWrap = "wrap";

  const mk = (txt, fn) => {
    const b = document.createElement("button");
    b.textContent = txt;
    b.className = "soft";
    b.onclick = fn;
    return b;
  };

  const r = card.r;

  if (r === "7" || r === "8") {
    wrap.appendChild(mk("Use 7/8 (peek my card)", () => {
      const idx = prompt("Peek which of YOUR cards? (1-4)") || "";
      const i = parseInt(idx, 10) - 1;
      if (![0,1,2,3].includes(i)) return;
      socket.emit("power:peekOwn", { roomId: currentRoomId, handIndex: i }, (res) => {
        if (!res?.ok) setStatus(res?.error || "Power failed");
        clearDrawn();
        wrap.remove();
      });
    }));
  }

  if (r === "9" || r === "10") {
    wrap.appendChild(mk("Use 9/10 (peek opp card)", () => {
      const idx = prompt("Peek which OPPONENT card? (1-4)") || "";
      const i = parseInt(idx, 10) - 1;
      if (![0,1,2,3].includes(i)) return;
      socket.emit("power:peekOpp", { roomId: currentRoomId, oppIndex: i }, (res) => {
        if (!res?.ok) setStatus(res?.error || "Power failed");
        clearDrawn();
        wrap.remove();
      });
    }));
  }

  if (r === "J") {
    wrap.appendChild(mk("Use Jack (skip)", () => {
      socket.emit("power:jackSkip", { roomId: currentRoomId }, (res) => {
        if (!res?.ok) setStatus(res?.error || "Power failed");
        clearDrawn();
        wrap.remove();
      });
    }));
  }

  if (r === "Q") {
    wrap.appendChild(mk("Use Queen (unseen swap)", () => {
      const mi = parseInt(prompt("Your card index (1-4)") || "", 10) - 1;
      const oi = parseInt(prompt("Opponent index (1-4)") || "", 10) - 1;
      if (![0,1,2,3].includes(mi) || ![0,1,2,3].includes(oi)) return;
      socket.emit("power:queenUnseenSwap", { roomId: currentRoomId, myIndex: mi, oppIndex: oi }, (res) => {
        if (!res?.ok) setStatus(res?.error || "Power failed");
        clearDrawn();
        wrap.remove();
      });
    }));
  }

  if (r === "K") {
    wrap.appendChild(mk("Use King (preview+confirm)", () => {
      const mi = parseInt(prompt("Your card index (1-4)") || "", 10) - 1;
      const oi = parseInt(prompt("Opponent index (1-4)") || "", 10) - 1;
      if (![0,1,2,3].includes(mi) || ![0,1,2,3].includes(oi)) return;
      socket.emit("power:kingPreview", { roomId: currentRoomId, myIndex: mi, oppIndex: oi }, (res) => {
        if (!res?.ok) setStatus(res?.error || "Power failed");
      });
    }));
  }

  // Always allow “discard drawn to use power”
  wrap.appendChild(mk("Cancel power", () => wrap.remove()));

  actionHint.parentElement.appendChild(wrap);
}

// =====================
// NAV → Valentine screen
// =====================
socket.on("nav:valentine", ({ reason }) => {
  gotoValentine();
  if (isHost()) {
    livePanel.style.display = "block";
    pushLive(`Valentine opened (${reason})`);
  }
});

// Sync Valentine actions
socket.on("val:update", ({ action }) => {
  if (!action) return;

  // Host wants to mirror her actions
  if (isHost()) livePanel.style.display = "block";

  suppressValEmit = true;

  if (action.type === "NO_STEP") {
    noStep = action.noStep;
    yesScale = action.yesScale;
    document.documentElement.style.setProperty("--yesScale", String(yesScale));
    if (noBtn) noBtn.textContent = action.label;
    if (isHost()) pushLive(`She pressed: "${action.label}"`);
  }

  if (action.type === "YES_ACCEPT") {
    if (isHost()) pushLive("She clicked YES 💜");
    acceptValentine(false);
  }

  suppressValEmit = false;
});

// =====================
// Valentine Logic
// =====================
function gotoValentine() {
  gameScreen.style.display = "none";
  valScreen.style.display = "block";

  // reset UI
  subtitle.textContent = "You’re here. Now answer honestly. 😌";
  reveal.classList.remove("show");
  noStep = 0;
  yesScale = 1;
  document.documentElement.style.setProperty("--yesScale", "1");
  noBtn.style.display = "inline-block";
  noBtn.textContent = noScript[0];

  setupCarousel();
  setupAudio();
}

function handleNo() {
  noStep += 1;
  yesScale = Math.min(1 + noStep * 0.18, 2.2);
  document.documentElement.style.setProperty("--yesScale", String(yesScale));

  const nextText = noScript[Math.min(noStep, noScript.length - 1)];
  noBtn.textContent = nextText;

  // Eventually remove NO
  if (noStep >= noScript.length - 1) {
    noBtn.style.display = "none";
    subtitle.textContent = "Good. That’s better. 😌💜";
  } else {
    subtitle.textContent = "Trying to say no? cute.";
  }

  if (!suppressValEmit && currentRoomId) {
    socket.emit("val:action", {
      roomId: currentRoomId,
      action: { type:"NO_STEP", noStep, yesScale, label: noBtn.textContent }
    });
  }
}

function acceptValentine(emit = true) {
  subtitle.textContent = "I knew it. 💜";
  reveal.classList.add("show");
  sweetLine.textContent = "Now come here… I have something for you 💜";

  if (emit && !suppressValEmit && currentRoomId) {
    socket.emit("val:action", {
      roomId: currentRoomId,
      action: { type:"YES_ACCEPT" }
    });
  }

  tryPlayAudio();
}

yesBtn.addEventListener("click", () => acceptValentine(true));
noBtn.addEventListener("click", handleNo);

// =====================
// Carousel (auto slide)
// =====================
let slideIndex = 0;
let slideTimer = null;

function setupCarousel() {
  track.innerHTML = "";
  dots.innerHTML = "";

  photos.forEach((src, i) => {
    const slide = document.createElement("div");
    slide.className = "slide";
    const img = document.createElement("img");
    img.src = src;
    img.alt = `Photo ${i+1}`;
    slide.appendChild(img);
    track.appendChild(slide);

    const dot = document.createElement("div");
    dot.className = "dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => goTo(i));
    dots.appendChild(dot);
  });

  slideIndex = 0;
  goTo(0);

  // Auto carousel
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = setInterval(() => goTo(slideIndex + 1), 2600);
}

function goTo(i) {
  slideIndex = (i + photos.length) % photos.length;
  track.style.transform = `translateX(-${slideIndex * 100}%)`;
  [...dots.children].forEach((d, k) => d.classList.toggle("active", k === slideIndex));
}

// =====================
// Audio
// =====================
function setupAudio() {
  audio.src = audioFile;
  audioCtl.style.display = "inline-flex";
  audioStatus.textContent = "Tap to play our song 💜";
}

async function tryPlayAudio() {
  try {
    audio.volume = 0.5;
    await audio.play();
    audioCtl.style.display = "none";
  } catch {
    audioCtl.style.display = "inline-flex";
  }
}

audioBtn.addEventListener("click", tryPlayAudio);

// =====================
// Auto join via ?room=XXXX
// =====================
const params = new URLSearchParams(location.search);
const roomFromUrl = params.get("room");
if (roomFromUrl) roomInput.value = roomFromUrl.toUpperCase();
