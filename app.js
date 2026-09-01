/* ============================================================
   JeuGalo — app.js
   Lógica principal do jogo: estado local, Firebase Realtime
   Database, fluxo da sala, pontuação e renderização de telas.

   Este arquivo é carregado em index.html, host.html e player.html.
   A página atual é identificada por `document.body.dataset.page`
   ("index" | "host" | "player"), e cada seção abaixo só roda
   na página correspondente.
   ============================================================ */

/* ------------------------------------------------------------
   0. CONSTANTES GLOBAIS
   ------------------------------------------------------------ */

const HOST_PASSWORD = "Aletei4f!los";

const CHARACTERS = [
  "ADÈLE", "ANTOINE", "BASTIEN", "BÉATRICE", "CHARLOTTE", "CÉCILE",
  "FLORENCE", "FRANÇOIS", "GASPARD", "GREGOIRE", "JULIE", "JULIEN",
  "LAURENT", "LOUISE", "LÉO", "MARIE", "MATHIEU", "PIERRE", "RÉMI",
  "SOPHIE", "VALÉRIE", "ÉLISE"
];

function charImg(name) {
  return `/personagens/${name}.jpeg`;
}

const MODE_INFO = {
  NORMAL: {
    cssClass: "mode-NORMAL",
    emoji: "🎯✅",
    title: "Modo Normal",
    desc: "Cada acerto vale 200 pontos fixos. Preste atenção e responda com calma!"
  },
  DUPLO: {
    cssClass: "mode-DUPLO",
    emoji: "⚡🔥",
    title: "Modo Duplo",
    desc: "Rodada em dobro! Cada acerto vale 400 pontos fixos."
  },
  RAPIDO: {
    cssClass: "mode-RAPIDO",
    emoji: "⏱️💨",
    title: "Modo Rápido",
    desc: "Quanto mais rápido responder, mais pontos ganha: até 200 pts nos primeiros 10s, caindo gradualmente até 50 pts no fim do tempo."
  },
  DANO: {
    cssClass: "mode-DANO",
    emoji: "💀⚠️",
    title: "Modo Dano",
    desc: "Cuidado! Acertar vale 200 pontos, mas errar custa -50 pontos."
  }
};

// 10 regiões da França usadas na mecânica de progresso do mapa
const MAP_REGIONS = [
  "Bretagne", "Normandie", "Hauts-de-France", "Île-de-France",
  "Grand Est", "Bourgogne-Franche-Comté", "Nouvelle-Aquitaine",
  "Auvergne-Rhône-Alpes", "Occitanie", "Provence-Alpes-Côte d'Azur"
];

const MODE_SCREEN_SECONDS = 10; // duração da tela de transição de modo
const RANKING_SCREEN_SECONDS = 6; // duração da tela de ranking intermediário
const REVEAL_SECONDS = 3; // tempo mostrando a resposta correta antes do ranking

const TIME_STEPS = [20, 30, 45, 60];

/* ------------------------------------------------------------
   1. HELPERS GERAIS
   ------------------------------------------------------------ */

function qs(id) { return document.getElementById(id); }

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function playSound(src, { loop = false, volume = 1 } = {}) {
  try {
    const audio = new Audio(src);
    audio.loop = loop;
    audio.volume = volume;
    audio.play().catch(() => { /* navegador pode bloquear até haver interação — ok, ignoramos */ });
    return audio;
  } catch (e) {
    console.warn("Não foi possível tocar áudio:", src, e);
    return null;
  }
}

// Calcula os pontos de uma resposta dado o modo da questão
function calculatePoints(mode, correct, timeMs, timeLimitSeconds) {
  if (!correct) {
    return mode === "DANO" ? -50 : 0;
  }
  switch (mode) {
    case "NORMAL": return 200;
    case "DUPLO": return 400;
    case "DANO": return 200;
    case "RAPIDO": {
      const tSec = timeMs / 1000;
      if (tSec <= 10) return 200;
      const decayWindow = Math.max(timeLimitSeconds - 10, 1);
      const progress = Math.min(1, (tSec - 10) / decayWindow);
      return Math.round(200 - progress * (200 - 50));
    }
    default: return 200;
  }
}

function shapeForIndex(i) {
  return ["▲", "◆", "●", "■"][i] || "";
}

/* ============================================================
   2. PÁGINA: index.html
   ============================================================ */

function initIndexPage() {
  const btnProfessor = qs("btn-professor");
  const btnAluno = qs("btn-aluno");
  const modalBackdrop = qs("password-modal");
  const passwordInput = qs("password-input");
  const passwordSubmit = qs("password-submit");
  const passwordCancel = qs("password-cancel");
  const passwordError = qs("password-error");

  const alunoModal = qs("aluno-modal");
  const alunoRoomInput = qs("aluno-room-input");
  const alunoNickInput = qs("aluno-nick-input");
  const alunoSubmit = qs("aluno-submit");
  const alunoCancel = qs("aluno-cancel");
  const alunoError = qs("aluno-error");

  // Se veio de um QR Code (?room=CODIGO), pula direto para o modal do aluno
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");

  btnProfessor.addEventListener("click", () => {
    passwordError.textContent = "";
    passwordInput.value = "";
    modalBackdrop.classList.remove("hidden");
    passwordInput.focus();
  });
  passwordCancel.addEventListener("click", () => modalBackdrop.classList.add("hidden"));
  passwordSubmit.addEventListener("click", () => {
    if (passwordInput.value === HOST_PASSWORD) {
      sessionStorage.setItem("jeugalo_host_auth", "1");
      window.location.href = "host.html";
    } else {
      passwordError.textContent = "Senha incorreta. Tente novamente.";
    }
  });
  passwordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") passwordSubmit.click(); });

  function openAlunoModal() {
    alunoError.textContent = "";
    alunoRoomInput.value = roomFromUrl || "";
    alunoNickInput.value = "";
    alunoModal.classList.remove("hidden");
    alunoNickInput.focus();
  }

  btnAluno.addEventListener("click", openAlunoModal);
  alunoCancel.addEventListener("click", () => alunoModal.classList.add("hidden"));

  alunoSubmit.addEventListener("click", async () => {
    const code = alunoRoomInput.value.trim().toUpperCase();
    const nick = alunoNickInput.value.trim();
    if (!code || !nick) {
      alunoError.textContent = "Preencha o código da sala e seu apelido.";
      return;
    }
    alunoError.textContent = "Verificando sala...";
    try {
      const snap = await db.ref(`rooms/${code}`).get();
      if (!snap.exists()) {
        alunoError.textContent = "Sala não encontrada. Confira o código.";
        return;
      }
      sessionStorage.setItem("jeugalo_nick", nick);
      window.location.href = `player.html?room=${encodeURIComponent(code)}&nick=${encodeURIComponent(nick)}`;
    } catch (e) {
      alunoError.textContent = "Erro ao conectar. Tente novamente.";
      console.error(e);
    }
  });

  if (roomFromUrl) openAlunoModal();
}

/* ============================================================
   3. PÁGINA: host.html
   ============================================================ */

let hostState = {
  roomCode: null,
  roomName: null,
  game: null,           // { title, questions: [...] }
  players: {},           // snapshot local dos players
  currentQuestionIndex: -1,
  ambientAudio: null,
  questionAudio: null,
  alertPlayed: false,
  timerInterval: null,
  mapPhaseAtStart: 0
};

let builderQuestions = []; // usado na tela do construtor de quiz

function initHostPage() {
  if (sessionStorage.getItem("jeugalo_host_auth") !== "1") {
    window.location.href = "index.html";
    return;
  }

  showHostView("dashboard");

  qs("btn-upload-json").addEventListener("click", () => qs("json-file-input").click());
  qs("json-file-input").addEventListener("change", handleJsonUpload);
  qs("btn-create-quiz").addEventListener("click", () => {
    builderQuestions = [];
    renderBuilder();
    showHostView("builder");
  });
  qs("btn-add-card").addEventListener("click", () => addBuilderCard());
  qs("btn-download-json").addEventListener("click", downloadBuilderJson);
  qs("btn-play-direct").addEventListener("click", () => startRoomSetup(buildGameFromBuilder()));

  qs("btn-open-room").addEventListener("click", () => {
    const name = qs("room-name-input").value.trim();
    if (!name) { qs("room-name-error").textContent = "Digite um nome para a sala."; return; }
    openRoom(name);
  });

  qs("btn-start-game").addEventListener("click", startGameFlow);
}

function showHostView(view) {
  ["dashboard", "builder", "waiting-room", "game-projector"].forEach((v) => {
    qs(`view-${v}`).classList.toggle("hidden", v !== view);
  });
}

// --- 3.1 Upload de JSON existente -----------------------------------------
function handleJsonUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const game = JSON.parse(reader.result);
      if (!game.questions || !Array.isArray(game.questions)) throw new Error("JSON inválido");
      startRoomSetup(game);
    } catch (err) {
      alert("Não foi possível ler o arquivo JSON. Verifique o formato.");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

// --- 3.2 Construtor de quiz -------------------------------------------------
function addBuilderCard(copyFrom = null) {
  const card = copyFrom
    ? JSON.parse(JSON.stringify(copyFrom))
    : {
        id: builderQuestions.length + 1,
        question: "",
        options: ["", "", "", ""],
        correctIndex: 0,
        timeLimit: 30,
        mode: "NORMAL"
      };
  card.id = builderQuestions.length + 1;
  builderQuestions.push(card);
  renderBuilder();
}

function renderBuilder() {
  const wrap = qs("builder-cards");
  wrap.innerHTML = "";
  builderQuestions.forEach((card, idx) => {
    const el = document.createElement("div");
    el.className = "question-card";
    el.innerHTML = `
      <strong>Pergunta ${idx + 1}</strong>
      <input class="input" type="text" placeholder="Digite a pergunta" value="${escapeHtml(card.question)}" data-field="question" />
      <div class="options-editor">
        ${card.options.map((opt, i) => `
          <div class="option-row">
            <input type="radio" name="correct-${idx}" ${card.correctIndex === i ? "checked" : ""} data-field="correctIndex" data-index="${i}" />
            <input class="input" type="text" placeholder="Alternativa ${i + 1}" value="${escapeHtml(opt)}" data-field="option" data-index="${i}" />
          </div>
        `).join("")}
      </div>
      <div>
        <div style="margin-bottom:6px; font-weight:700;">Tempo:</div>
        <div class="pill-select" data-field="timeLimit">
          ${TIME_STEPS.map((t) => `<button data-value="${t}" class="${card.timeLimit === t ? "selected" : ""}">${t}s</button>`).join("")}
        </div>
      </div>
      <div>
        <div style="margin-bottom:6px; font-weight:700;">Modalidade:</div>
        <div class="pill-select" data-field="mode">
          ${Object.keys(MODE_INFO).map((m) => `<button data-value="${m}" class="${card.mode === m ? "selected" : ""}">${MODE_INFO[m].title}</button>`).join("")}
        </div>
      </div>
      <div class="card-toolbar">
        <button class="small-btn btn-secondary" data-action="duplicate">Duplicar Card</button>
        <button class="small-btn btn-danger" data-action="remove">Remover</button>
      </div>
    `;

    el.querySelector('[data-field="question"]').addEventListener("input", (e) => {
      builderQuestions[idx].question = e.target.value;
    });
    el.querySelectorAll('input[data-field="option"]').forEach((input) => {
      input.addEventListener("input", (e) => {
        builderQuestions[idx].options[Number(e.target.dataset.index)] = e.target.value;
      });
    });
    el.querySelectorAll('input[data-field="correctIndex"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        builderQuestions[idx].correctIndex = Number(e.target.dataset.index);
      });
    });
    el.querySelector('[data-field="timeLimit"]').addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      builderQuestions[idx].timeLimit = Number(e.target.dataset.value);
      renderBuilder();
    });
    el.querySelector('[data-field="mode"]').addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      builderQuestions[idx].mode = e.target.dataset.value;
      renderBuilder();
    });
    el.querySelector('[data-action="duplicate"]').addEventListener("click", () => addBuilderCard(card));
    el.querySelector('[data-action="remove"]').addEventListener("click", () => {
      builderQuestions.splice(idx, 1);
      renderBuilder();
    });

    wrap.appendChild(el);
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildGameFromBuilder() {
  const title = qs("builder-title-input").value.trim() || "JeuGalo";
  return { title, questions: builderQuestions };
}

function downloadBuilderJson() {
  const game = buildGameFromBuilder();
  const blob = new Blob([JSON.stringify(game, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${game.title.replace(/\s+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- 3.3 Criação e abertura da sala -----------------------------------------
function startRoomSetup(game) {
  if (!game.questions || game.questions.length === 0) {
    alert("Adicione ao menos uma pergunta antes de continuar.");
    return;
  }
  hostState.game = game;
  showHostView("waiting-room");
  qs("waiting-room-title").textContent = "Digite o nome da sala para abri-la";
  qs("room-name-form").classList.remove("hidden");
  qs("room-open-info").classList.add("hidden");
}

async function openRoom(roomName) {
  const code = generateRoomCode();
  hostState.roomCode = code;
  hostState.roomName = roomName;

  // Recupera progresso de fase do mapa da França (se a sala já existiu antes)
  const mapSnap = await db.ref(`mapProgress/${roomName}`).get();
  hostState.mapPhaseAtStart = mapSnap.exists() ? (mapSnap.val().unlockedPhase || 0) : 0;

  await db.ref(`rooms/${code}`).set({
    roomName,
    status: "waiting",
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    game: hostState.game,
    currentQuestionIndex: -1,
    players: {}
  });

  qs("room-name-form").classList.add("hidden");
  qs("room-open-info").classList.remove("hidden");
  qs("room-code-display").textContent = code;

  const joinUrl = `${window.location.origin}${window.location.pathname.replace("host.html", "index.html")}?room=${code}`;
  qs("room-join-url").textContent = joinUrl;
  qs("qrcode-box").innerHTML = "";
  // eslint-disable-next-line no-undef
  new QRCode(qs("qrcode-box"), { text: joinUrl, width: 180, height: 180 });

  hostState.ambientAudio = playSound("/sounds/game-backsound.mp3", { loop: true, volume: 0.5 });

  db.ref(`rooms/${code}/players`).on("value", (snap) => {
    hostState.players = snap.val() || {};
    renderWaitingPlayers();
  });
}

function renderWaitingPlayers() {
  const wrap = qs("waiting-players-list");
  wrap.innerHTML = "";
  const list = Object.values(hostState.players || {});
  qs("waiting-players-count").textContent = list.length;
  list.forEach((p) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.innerHTML = `<img src="${charImg(p.character)}" alt="${p.character}" /><span>${escapeHtml(p.nickname)}</span>`;
    wrap.appendChild(chip);
  });
  qs("btn-start-game").disabled = list.length === 0;
}

/* --- 3.4 Fluxo do jogo (host controla o estado da sala) ------------------ */

async function startGameFlow() {
  if (hostState.ambientAudio) hostState.ambientAudio.pause();
  showHostView("game-projector");
  hostState.currentQuestionIndex = -1;
  await advanceToNextQuestion();
}

async function advanceToNextQuestion() {
  hostState.currentQuestionIndex += 1;
  const questions = hostState.game.questions;

  if (hostState.currentQuestionIndex >= questions.length) {
    await finishGame();
    return;
  }

  const question = questions[hostState.currentQuestionIndex];
  await showModeScreen(question);
}

function showModeScreen(question) {
  return new Promise((resolve) => {
    db.ref(`rooms/${hostState.roomCode}`).update({
      status: "mode",
      currentQuestionIndex: hostState.currentQuestionIndex
    });

    const info = MODE_INFO[question.mode] || MODE_INFO.NORMAL;
    const el = qs("mode-screen");
    el.className = `screen mode-screen ${info.cssClass}`;
    qs("mode-emoji").textContent = info.emoji;
    qs("mode-title").textContent = info.title;
    qs("mode-desc").textContent = info.desc;
    showProjectorPanel("mode-screen");

    playSound("/sounds/modo.mp3");

    let remaining = MODE_SCREEN_SECONDS;
    qs("mode-timer").textContent = remaining;
    const interval = setInterval(() => {
      remaining -= 1;
      qs("mode-timer").textContent = Math.max(remaining, 0);
      if (remaining <= 0) {
        clearInterval(interval);
        resolve(runQuestion(question));
      }
    }, 1000);
  });
}

function runQuestion(question) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    db.ref(`rooms/${hostState.roomCode}`).update({
      status: "question",
      questionStartedAt: startedAt,
      "currentQuestion": question
    });

    renderProjectorQuestion(question);
    showProjectorPanel("question-screen");

    hostState.questionAudio = playSound("/sounds/questionsound.mp3", { loop: true, volume: 0.4 });
    hostState.alertPlayed = false;

    let remaining = question.timeLimit;
    qs("question-timer").textContent = remaining;
    qs("question-timer").classList.remove("low-time");

    hostState.timerInterval = setInterval(() => {
      remaining -= 1;
      qs("question-timer").textContent = Math.max(remaining, 0);
      if (remaining <= 10 && !hostState.alertPlayed) {
        hostState.alertPlayed = true;
        qs("question-timer").classList.add("low-time");
        playSound("/sounds/alert.mp3");
      }
      if (remaining <= 0) {
        clearInterval(hostState.timerInterval);
        if (hostState.questionAudio) hostState.questionAudio.pause();
        resolve(finishQuestion(question, startedAt));
      }
    }, 1000);
  });
}

function renderProjectorQuestion(question) {
  qs("question-title").textContent = question.question;
  const grid = qs("options-grid");
  grid.innerHTML = "";
  question.options.forEach((opt, i) => {
    const tile = document.createElement("div");
    tile.className = `option-tile opt-${i}`;
    tile.innerHTML = `<span class="shape">${shapeForIndex(i)}</span><span>${escapeHtml(opt)}</span>`;
    grid.appendChild(tile);
  });
}

async function finishQuestion(question, startedAt) {
  // Marca visualmente a resposta correta no projetor
  document.querySelectorAll(".option-tile").forEach((tile, i) => {
    tile.classList.add(i === question.correctIndex ? "correct-reveal" : "wrong-reveal");
  });

  // Calcula pontuação de cada jogador com base nas respostas registradas
  const playersSnap = await db.ref(`rooms/${hostState.roomCode}/players`).get();
  const players = playersSnap.val() || {};
  const updates = {};

  Object.entries(players).forEach(([pid, p]) => {
    const answer = p.answers && p.answers[question.id];
    const correct = answer ? answer.optionIndex === question.correctIndex : false;
    const timeMs = answer ? (answer.answeredAt - startedAt) : question.timeLimit * 1000;
    const points = answer
      ? calculatePoints(question.mode, correct, timeMs, question.timeLimit)
      : (question.mode === "DANO" ? -50 : 0); // não respondeu = considerado erro

    const newScore = (p.score || 0) + points;
    updates[`${pid}/score`] = newScore;
    updates[`${pid}/lastDelta`] = points;
    if (answer) {
      updates[`${pid}/answers/${question.id}/correct`] = correct;
      updates[`${pid}/answers/${question.id}/pointsEarned`] = points;
    } else {
      updates[`${pid}/answers/${question.id}`] = { optionIndex: -1, correct: false, pointsEarned: points };
    }
  });

  await db.ref(`rooms/${hostState.roomCode}/players`).update(updates);
  await db.ref(`rooms/${hostState.roomCode}`).update({ status: "reveal" });

  await new Promise((r) => setTimeout(r, REVEAL_SECONDS * 1000));
  return showRankingScreen();
}

async function showRankingScreen() {
  await db.ref(`rooms/${hostState.roomCode}`).update({ status: "ranking" });
  playSound("/sounds/level.mp3");
  showProjectorPanel("ranking-screen");

  const playersSnap = await db.ref(`rooms/${hostState.roomCode}/players`).get();
  const players = Object.entries(playersSnap.val() || {}).map(([id, p]) => ({ id, ...p }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));
  const top5 = players.slice(0, 5);

  const list = qs("ranking-list");
  list.innerHTML = "";
  top5.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "ranking-row";
    const arrow = (p.lastDelta || 0) > 0
      ? '<span class="rank-arrow-up">▲</span>'
      : (p.lastDelta || 0) < 0
        ? '<span class="rank-arrow-down">▼</span>'
        : "";
    row.innerHTML = `
      <span class="ranking-pos">${i + 1}º</span>
      <img src="${charImg(p.character)}" alt="${p.character}" />
      <span class="ranking-name">${escapeHtml(p.nickname)}</span>
      ${arrow}
      <span class="ranking-score">${p.score || 0} pts</span>
    `;
    list.appendChild(row);
  });

  await new Promise((r) => setTimeout(r, RANKING_SCREEN_SECONDS * 1000));
  return advanceToNextQuestion();
}

function showProjectorPanel(panelId) {
  ["mode-screen", "question-screen", "ranking-screen", "podium-screen"].forEach((id) => {
    qs(id).classList.toggle("hidden", id !== panelId);
  });
}

async function finishGame() {
  await db.ref(`rooms/${hostState.roomCode}`).update({ status: "podium" });
  playSound("/sounds/win01.mp3");
  showProjectorPanel("podium-screen");

  const playersSnap = await db.ref(`rooms/${hostState.roomCode}/players`).get();
  const players = Object.entries(playersSnap.val() || {}).map(([id, p]) => ({ id, ...p }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));
  const [first, second, third] = players;

  const podiumEl = qs("podium-bars");
  podiumEl.innerHTML = "";
  [
    { p: second, cls: "podium-2", pos: "2º" },
    { p: first, cls: "podium-1", pos: "1º" },
    { p: third, cls: "podium-3", pos: "3º" }
  ].forEach(({ p, cls, pos }) => {
    if (!p) return;
    const slot = document.createElement("div");
    slot.className = `podium-slot ${cls}`;
    slot.innerHTML = `
      <img class="avatar" src="${charImg(p.character)}" alt="${p.character}" />
      <strong>${escapeHtml(p.nickname)}</strong>
      <span>${p.score || 0} pts</span>
      <div class="podium-bar">${pos}</div>
    `;
    podiumEl.appendChild(slot);
  });

  // --- Mecânica de progresso do Mapa da França ---
  const questions = hostState.game.questions;
  const maxPossiblePerQuestion = questions.map((q) => (q.mode === "DUPLO" ? 400 : 200));
  const maxPossibleTotal = maxPossiblePerQuestion.reduce((a, b) => a + b, 0) * Math.max(players.length, 1);
  const totalRoomScore = players.reduce((sum, p) => sum + (p.score || 0), 0);
  const wonPhase = maxPossibleTotal > 0 && totalRoomScore > maxPossibleTotal * 0.5;

  let newPhase = hostState.mapPhaseAtStart;
  if (wonPhase && newPhase < MAP_REGIONS.length) newPhase += 1;

  await db.ref(`mapProgress/${hostState.roomName}`).set({ unlockedPhase: newPhase });
  renderMap(newPhase, wonPhase);
}

function renderMap(unlockedPhase, wonThisRound) {
  const wrap = qs("map-regions");
  wrap.innerHTML = "";
  MAP_REGIONS.forEach((region, i) => {
    const dot = document.createElement("div");
    const unlocked = i < unlockedPhase;
    const current = i === unlockedPhase - 1 && wonThisRound;
    dot.className = `map-region ${unlocked ? "unlocked" : ""} ${current ? "current" : ""}`;
    dot.title = region;
    dot.textContent = i + 1;
    wrap.appendChild(dot);
  });
  qs("map-status-text").textContent = wonThisRound
    ? `Parabéns! A turma conquistou a região "${MAP_REGIONS[unlockedPhase - 1] || ""}" 🎉`
    : "A turma ainda não atingiu 50% da pontuação total desta fase. Tentem novamente!";
}

/* ============================================================
   4. PÁGINA: player.html
   ============================================================ */

let playerState = {
  roomCode: null,
  playerId: null,
  nickname: null,
  character: CHARACTERS[Math.floor(CHARACTERS.length / 2)],
  carouselIndex: Math.floor(CHARACTERS.length / 2),
  currentQuestion: null,
  hasAnswered: false,
  lastStatus: null
};

function initPlayerPage() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = (params.get("room") || "").toUpperCase();
  const nickname = params.get("nick") || sessionStorage.getItem("jeugalo_nick") || "";

  if (!roomCode || !nickname) {
    window.location.href = "index.html";
    return;
  }

  playerState.roomCode = roomCode;
  playerState.nickname = nickname;
  playerState.playerId = uid();

  renderCarousel();
  qs("carousel-prev").addEventListener("click", () => moveCarousel(-1));
  qs("carousel-next").addEventListener("click", () => moveCarousel(1));
  qs("btn-confirm-character").addEventListener("click", confirmJoin);

  showPlayerScreen("screen-carousel");
}

function moveCarousel(dir) {
  playerState.carouselIndex = (playerState.carouselIndex + dir + CHARACTERS.length) % CHARACTERS.length;
  renderCarousel();
}

function renderCarousel() {
  const track = qs("carousel-track");
  track.innerHTML = "";
  const idx = playerState.carouselIndex;
  const order = [idx - 2, idx - 1, idx, idx + 1, idx + 2].map((i) => (i + CHARACTERS.length) % CHARACTERS.length);

  order.forEach((charIdx, pos) => {
    const name = CHARACTERS[charIdx];
    const card = document.createElement("div");
    let cls = "char-card";
    if (pos === 2) cls += " active";
    else if (pos === 0 || pos === 4) cls += " side-far";
    card.className = cls;
    card.innerHTML = `<img src="${charImg(name)}" alt="${name}" />`;
    track.appendChild(card);
  });

  qs("char-name-display").textContent = CHARACTERS[idx];
  playerState.character = CHARACTERS[idx];
}

async function confirmJoin() {
  await db.ref(`rooms/${playerState.roomCode}/players/${playerState.playerId}`).set({
    nickname: playerState.nickname,
    character: playerState.character,
    score: 0,
    lastDelta: 0,
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  });

  db.ref(`rooms/${playerState.roomCode}/players/${playerState.playerId}`).onDisconnect().remove();

  listenToRoom();
}

function listenToRoom() {
  db.ref(`rooms/${playerState.roomCode}`).on("value", (snap) => {
    const room = snap.val();
    if (!room) return;

    if (room.status !== playerState.lastStatus) {
      playerState.lastStatus = room.status;
      handleRoomStatusChange(room);
    }

    if (room.status === "ranking" || room.status === "reveal") {
      updateMyScoreDisplay(room);
    }
  });
}

function handleRoomStatusChange(room) {
  switch (room.status) {
    case "waiting":
      showPlayerScreen("screen-waiting");
      break;
    case "mode": {
      const q = room.game.questions[room.currentQuestionIndex];
      const info = MODE_INFO[q.mode] || MODE_INFO.NORMAL;
      const el = qs("screen-mode");
      el.className = `screen mode-screen ${info.cssClass}`;
      qs("player-mode-title").textContent = info.title;
      qs("player-mode-desc").textContent = "Prepare-se!";
      showPlayerScreen("screen-mode");
      playerState.hasAnswered = false;
      break;
    }
    case "question": {
      playerState.currentQuestion = room.currentQuestion;
      playerState.hasAnswered = false;
      playerState.questionStartedAt = room.questionStartedAt;
      renderPlayerAnswerButtons();
      showPlayerScreen("screen-answer");
      break;
    }
    case "reveal": {
      showFeedbackScreen();
      break;
    }
    case "ranking": {
      showPlayerScreen("screen-ranking-wait");
      break;
    }
    case "podium": {
      showPlayerFinalScreen(room);
      break;
    }
    default:
      break;
  }
}

function renderPlayerAnswerButtons() {
  const grid = qs("answer-grid");
  grid.innerHTML = "";
  playerState.currentQuestion.options.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.className = `answer-tile opt-${i}`;
    btn.textContent = shapeForIndex(i);
    btn.addEventListener("click", () => submitAnswer(i, btn));
    grid.appendChild(btn);
  });
  qs("waiting-answer-msg").classList.add("hidden");
}

async function submitAnswer(optionIndex, btnEl) {
  if (playerState.hasAnswered) return;
  playerState.hasAnswered = true;

  playSound("/sounds/click.mp3");

  document.querySelectorAll(".answer-tile").forEach((b) => (b.disabled = true));
  btnEl.classList.add("selected");
  qs("waiting-answer-msg").classList.remove("hidden");

  await db.ref(`rooms/${playerState.roomCode}/players/${playerState.playerId}/answers/${playerState.currentQuestion.id}`).set({
    optionIndex,
    answeredAt: Date.now()
  });
}

async function showFeedbackScreen() {
  const snap = await db.ref(`rooms/${playerState.roomCode}/players/${playerState.playerId}`).get();
  const p = snap.val() || {};
  const answer = (p.answers && p.answers[playerState.currentQuestion.id]) || {};
  const correct = !!answer.correct;

  const el = qs("screen-feedback");
  el.className = `screen feedback-screen ${correct ? "feedback-correct" : "feedback-wrong"}`;
  qs("feedback-img").src = correct ? "/images/happygalo.png" : "/images/sadgalo.png";
  qs("feedback-title").textContent = correct ? "Você acertou!" : "Você errou!";
  qs("feedback-points").textContent = `${answer.pointsEarned >= 0 ? "+" : ""}${answer.pointsEarned || 0} pontos`;

  playSound(correct ? "/sounds/ok.mp3" : "/sounds/falha.mp3");
  showPlayerScreen("screen-feedback");
}

async function updateMyScoreDisplay(room) {
  const snap = await db.ref(`rooms/${playerState.roomCode}/players/${playerState.playerId}`).get();
  const p = snap.val();
  if (p && qs("ranking-wait-score")) {
    qs("ranking-wait-score").textContent = `${p.score || 0} pontos`;
  }
}

function showPlayerFinalScreen(room) {
  showPlayerScreen("screen-podium-player");
  db.ref(`rooms/${playerState.roomCode}/players`).get().then((snap) => {
    const players = Object.entries(snap.val() || {}).map(([id, p]) => ({ id, ...p }));
    players.sort((a, b) => (b.score || 0) - (a.score || 0));
    const myIndex = players.findIndex((p) => p.id === playerState.playerId);
    qs("player-final-position").textContent = myIndex >= 0 ? `${myIndex + 1}º lugar` : "";
    qs("player-final-score").textContent = `${players[myIndex] ? players[myIndex].score || 0 : 0} pontos`;
  });
}

function showPlayerScreen(screenId) {
  [
    "screen-carousel", "screen-waiting", "screen-mode", "screen-answer",
    "screen-feedback", "screen-ranking-wait", "screen-podium-player"
  ].forEach((id) => qs(id).classList.toggle("hidden", id !== screenId));
}

/* ============================================================
   5. BOOTSTRAP — decide qual página inicializar
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "index") initIndexPage();
  else if (page === "host") initHostPage();
  else if (page === "player") initPlayerPage();
});
