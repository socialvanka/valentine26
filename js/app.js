// =====================
// CONFIG
// =====================
const SERVER_URL = "https://kabo-server.onrender.com"; // <-- change to your Render/Railway URL later

const photos = [
  "assets/photos/photo1.jpeg",
  "assets/photos/photo2.jpeg",
  "assets/photos/photo3.jpeg",
];
const audioFile = "assets/audio/orangrez.mp3";

const copy = {
  yesLine: "I was hoping you’d say that.",
  afterYes: "Now come here… I have something for you 💜",
  micdrop: "So yes… it’s you. Always was."
};

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

let currentRoomId = null;
let state = null;

// keep private peeked card reveals for self
const myKnown = [null, null, null, null];

// query param auto-join
const params = new URLSearchParams(location.search);
const roomFromUrl = params.get("room");
if (roomFromUrl) roomInput.value = roomFromUrl.toUpperCase();

// =====================
// DOM - Valentine
// =====================
const subtitle = document.getElementById("subtitle");
const yesBtn = document.getElementById("yesBtn");
const btnRow = document.getElementById("btnRow");
const reveal = document.getElementById("reveal");
const sweetLine = document.getElementById("sweetLine");
const micdrop = document.getElementById("micdrop");

const carousel = document.getElementById("carousel");
const track = document.getElementById("track");
const dots = document.getElementById("dots");

const audio = document.getElementById("bgAudio");
const audioCtl = document.getElementById("audioCtl");
const audioBtn = document.getElementById("audioBtn");
const audioStatus = document.getElementById("audioStatus");

audio.src = audioFile;

let index = 0;
let autoTimer = null;

// =====================
// Helpers
// =====================
function setStatus(s) { gameStatus.textContent = s; }
function me() {
  return state?.players?.find(p => p.isMe);
}
function opponent() {
  return state?.players?.find(p => !p.isMe);
}
function isMyTurn() {
  return state?.turnSocketId === socket.id;
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

function cellLabel(card, known) {
  if (!card && !known) return "🂠";
  if (known) return `${known.r}${known.s} (${known.v})`;
  // ended state: server provides revealed hand objects
  return `${card.r}${card.s} (${card.v})`;
}

function renderHands() {
  myGrid.innerHTML = "";
  oppGrid.innerHTML = "";

  const my = me();
  const opp = opponent();
  if (!my || !opp) return;

  // Determine what to display:
  // - During ENDED: state.players[].hand is revealed
  // - During game: state players hand = nulls; we show 🂠 except known peeks for self
  for (let i = 0; i < 4; i++) {
    const c = state.phase === "ENDED" ? my.hand[i] : null;
    const known = myKnown[i];
    const div = document.createElement("div");
    div.className = "cardCell";
    div.innerHTML = `<div>${cellLabel(c, known)}</div><div class="mini">#${i+1}</div>`;

    // click behaviors:
    // peek phase: click to peek
    if (state.phase === "PEEK" && my.peeksLeft > 0) {
      div.classList.add("clickable");
      div.addEventListener("click", () => doPeek(i));
    }

    // swap phase: click to swap
    if (state.phase === "TURN_DECIDE" && isMyTurn()) {
      div.classList.add("clickable");
      div.addEventListener("click", () => doSwap(i));
    }

    myGrid.appendChild(div);
  }

  for (let i = 0; i < 4; i++) {
    const c = state.phase === "ENDED" ? opp.hand[i] : null;
    const div = document.createElement("div");
    div.className = "cardCell";
    div.innerHTML = `<div>${state.phase === "ENDED" ? cellLabel(c, null) : "🂠"}</div><div class="mini">#${i+1}</div>`;
    oppGrid.appendChild(div);
  }

  oppTitle.textContent = opp ? `Opponent: ${opp.name}` : "Opponent";
}

// =====================
// Actions (emit to server)
// =====================
function doPeek(i) {
  socket.emit("game:peek", { roomId: currentRoomId, index: i }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Peek failed");
  });
}

function doTake(source) {
  socket.emit("turn:take", { roomId: currentRoomId, source }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Take failed");
    else if (source === "discard" && res.card) {
      actionHint.textContent = `You took: ${res.card.r}${res.card.s} (${res.card.v}). Now swap or discard.`;
    } else {
      actionHint.textContent = `You drew a mystery card. Swap or discard.`;
    }
  });
}

function doDiscardDrawn() {
  socket.emit("turn:discardDrawn", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Discard failed");
  });
}

function doSwap(i) {
  socket.emit("turn:swap", { roomId: currentRoomId, handIndex: i }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Swap failed");
  });
}

function doCabo() {
  socket.emit("turn:cabo", { roomId: currentRoomId }, (res) => {
    if (!res?.ok) setStatus(res?.error || "Cabo failed");
  });
}

// =====================
// UI Wiring
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

unlockBtn.addEventListener("click", () => {
  gameScreen.style.display = "none";
  valScreen.style.display = "block";
});

// =====================
// Socket events
// =====================
socket.on("room:update", (s) => {
  state = s;
  if (!currentRoomId) currentRoomId = s.id;

  roomRow.style.display = "flex";
  roomCodeEl.textContent = s.id;

  // board visible when game started
  setBoardVisible(s.started);

  renderLog(s.log || []);

  const my = me();
  const opp = opponent();

  if (!opp) {
    setStatus("Waiting for your partner to join…");
  } else if (!s.started) {
    setStatus("Both players in. Host can start.");
  } else {
    setStatus(s.phase === "PEEK" ? "Peek phase" : "Game in progress");
  }

  // update meta
  drawMeta.textContent = `Cards left: ${s.drawCount}`;
  discardMeta.textContent = s.discardTop ? `Top: ${s.discardTop.r}${s.discardTop.s}` : `Empty`;

  // hints & button enablement
  if (!s.started) {
    startBtn.style.display = (s.players[0]?.socketId === socket.id && s.players.length === 2) ? "inline-block" : "none";
  } else {
    startBtn.style.display = "none";
  }

  if (s.phase === "PEEK") {
    peekHint.textContent = my ? `Peek remaining: ${my.peeksLeft}. Tap your cards.` : "";
    turnHint.textContent = "Opponent is peeking too.";
    actionHint.textContent = "";
  } else if (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") {
    peekHint.textContent = "";
    turnHint.textContent = isMyTurn() ? "Your turn: take Draw or Discard." : "Opponent's turn.";
    actionHint.textContent = "";
  } else if (s.phase === "TURN_DECIDE") {
    turnHint.textContent = isMyTurn() ? "Choose: swap by tapping a card, or discard drawn." : "Opponent deciding.";
    actionHint.textContent ||= "Tap one of your 4 cards to swap.";
  } else if (s.phase === "ENDED") {
    turnHint.textContent = "Round ended.";
    actionHint.textContent = "";
    endRow.style.display = "flex";
    const ended = s.ended;
    if (ended) {
      const lines = ended.scores.map(x => `${x.name}: ${x.score}`).join(" | ");
      setStatus(`Winner: ${ended.winnerName} — ${lines}`);
    }
  }

  // enable/disable controls
  const myTurn = isMyTurn();
  drawBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN"));
  discardBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "LAST_TURN") && !!s.discardTop);
  discardDrawnBtn.disabled = !(myTurn && s.phase === "TURN_DECIDE");
  caboBtn.disabled = !(myTurn && (s.phase === "TURN_DRAW" || s.phase === "TURN_DECIDE"));

  renderHands();
});

socket.on("peek:result", ({ index, card, peeksLeft }) => {
  myKnown[index] = card;
  const my = me();
  if (my) my.peeksLeft = peeksLeft;
  renderHands();
});

// =====================
// Valentine screen logic (simple)
// =====================
function buildCarousel(){
  track.innerHTML = "";
  dots.innerHTML = "";
  photos.forEach((src, i) => {
    const slide = document.createElement("div");
    slide.className = "slide";
    const img = document.createElement("img");
    img.src = src;
    slide.appendChild(img);
    track.appendChild(slide);

    const dot = document.createElement("div");
    dot.className = "dot" + (i===0 ? " active" : "");
    dot.addEventListener("click", () => goTo(i));
    dots.appendChild(dot);
  });
}
function goTo(i){
  index = (i + photos.length) % photos.length;
  track.style.transform = `translateX(-${index * 100}%)`;
  [...dots.children].forEach((d,k)=>d.classList.toggle("active", k===index));
}
function startAutoCarousel(){
  stopAutoCarousel();
  autoTimer = setInterval(()=>goTo(index+1), 2600);
}
function stopAutoCarousel(){
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

async function tryPlayAudio(){
  try{
    audio.volume = 0.5;
    await audio.play();
    audioCtl.style.display = "none";
  } catch {
    audioCtl.style.display = "inline-flex";
    audioStatus.textContent = "Tap to play our song 💜";
  }
}
audioBtn.addEventListener("click", tryPlayAudio);

yesBtn.addEventListener("click", async () => {
  subtitle.textContent = copy.yesLine;
  btnRow.style.opacity = "0";
  btnRow.style.pointerEvents = "none";

  reveal.classList.add("show");
  sweetLine.textContent = copy.afterYes;
  micdrop.textContent = copy.micdrop;

  buildCarousel();
  goTo(0);
  startAutoCarousel();

  await tryPlayAudio();
});
