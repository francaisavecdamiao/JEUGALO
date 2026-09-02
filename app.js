import { db, ref, set, get, child, push, update, onValue } from './firebase-config.js';

// LISTA DE PERSONAGENS
const AVATARS = [
  "ADÈLE", "ANTOINE", "BASTIEN", "BÉATRICE", "CHARLOTTE", "CÉCILE", "FLORENCE", 
  "FRANÇOIS", "GASPARD", "GREGOIRE", "JULIE", "JULIEN", "LAURENT", "LOUISE", 
  "LÉO", "MARIE", "MATHIEU", "PIERRE", "RÉMI", "SOPHIE", "VALÉRIE", "ÉLISE"
];

// REGIONALISMO DA FRANÇA (10 FASES)
const FRANCE_STAGES = [
  "Île-de-France", "Normandie", "Bretagne", "Grand Est", "Occitanie", 
  "Provence-Alpes-Côte d'Azur", "Nouvelle-Aquitaine", "Auvergne-Rhône-Alpes", "Hauts-de-France", "Centre-Val de Loire"
];

let currentAvatarIdx = 0;
let currentGameData = { title: "", questions: [] };
let activeRoomCode = "";
let localPlayerKey = "";
let currentQIdx = 0;
let audioCache = {};
let questionStartTime = 0;
let previousScores = {};

// Sincronizador de Áudio Resiliente
function playAudio(path, loop = false) {
  if (!audioCache[path]) {
    audioCache[path] = new Audio(path);
  }
  const audio = audioCache[path];
  audio.loop = loop;
  audio.currentTime = 0;
  audio.play().catch(e => console.log("Áudio aguardando ação prévia:", e));
  return audio;
}

function stopAudio(path) {
  if (audioCache[path]) {
    audioCache[path].pause();
    audioCache[path].currentTime = 0;
  }
}

// CARROSSEL 3D LOGIC
window.moveCarousel = function(dir) {
  currentAvatarIdx = (currentAvatarIdx + dir + AVATARS.length) % AVATARS.length;
  updateCarouselUI();
};

function updateCarouselUI() {
  const prevIdx = (currentAvatarIdx - 1 + AVATARS.length) % AVATARS.length;
  const nextIdx = (currentAvatarIdx + 1) % AVATARS.length;

  document.getElementById('avatar-prev').src = `/personagens/${AVATARS[prevIdx]}.jpeg`;
  document.getElementById('avatar-active').src = `/personagens/${AVATARS[currentAvatarIdx]}.jpeg`;
  document.getElementById('avatar-next').src = `/personagens/${AVATARS[nextIdx]}.jpeg`;
  document.getElementById('avatar-name').innerText = AVATARS[currentAvatarIdx];
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('avatar-active')) updateCarouselUI();
  
  // URL Params Check para auto-fill room
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && document.getElementById('roomCode')) {
    document.getElementById('roomCode').value = roomParam;
  }
});

// HOST - CRIADOR DE JOGO
window.addQuestionCard = function(data = null) {
  const container = document.getElementById('questionsContainer');
  const qId = container.children.length;
  
  const qHtml = `
    <div class="card-duo question-card" style="width:100%; margin-bottom:15px; text-align:left;" id="qcard-${qId}">
      <h4>Pergunta ${qId + 1}</h4>
      <input type="text" class="q-title" placeholder="Texto da Pergunta" value="${data ? data.question : ''}" style="width:100%; padding:8px; margin:5px 0;">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
        <input type="text" class="opt-0" placeholder="Opção Vermelha" value="${data ? data.options[0] : ''}">
        <input type="text" class="opt-1" placeholder="Opção Azul" value="${data ? data.options[1] : ''}">
        <input type="text" class="opt-2" placeholder="Opção Amarela" value="${data ? data.options[2] : ''}">
        <input type="text" class="opt-3" placeholder="Opção Verde" value="${data ? data.options[3] : ''}">
      </div>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <select class="q-correct">
          <option value="0" ${data && data.correctIndex === 0 ? 'selected' : ''}>Correta: Vermelho</option>
          <option value="1" ${data && data.correctIndex === 1 ? 'selected' : ''}>Correta: Azul</option>
          <option value="2" ${data && data.correctIndex === 2 ? 'selected' : ''}>Correta: Amarelo</option>
          <option value="3" ${data && data.correctIndex === 3 ? 'selected' : ''}>Correta: Verde</option>
        </select>
        <select class="q-time">
          <option value="20" ${data && data.timeLimit === 20 ? 'selected' : ''}>20s</option>
          <option value="30" ${data && data.timeLimit === 30 || !data ? 'selected' : ''}>30s</option>
          <option value="45" ${data && data.timeLimit === 45 ? 'selected' : ''}>45s</option>
          <option value="60" ${data && data.timeLimit === 60 ? 'selected' : ''}>60s</option>
        </select>
        <select class="q-mode">
          <option value="NORMAL" ${data && data.mode === 'NORMAL' ? 'selected' : ''}>MODO NORMAL</option>
          <option value="DUPLO" ${data && data.mode === 'DUPLO' ? 'selected' : ''}>MODO DUPLO</option>
          <option value="RAPIDO" ${data && data.mode === 'RAPIDO' ? 'selected' : ''}>MODO RÁPIDO</option>
          <option value="DANO" ${data && data.mode === 'DANO' ? 'selected' : ''}>MODO DANO</option>
        </select>
        <button class="btn-duo btn-blue" onclick="duplicateQuestion(${qId})">Duplicar</button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', qHtml);
};

window.duplicateQuestion = function(qId) {
  const card = document.getElementById(`qcard-${qId}`);
  const data = {
    question: card.querySelector('.q-title').value,
    options: [card.querySelector('.opt-0').value, card.querySelector('.opt-1').value, card.querySelector('.opt-2').value, card.querySelector('.opt-3').value],
    correctIndex: parseInt(card.querySelector('.q-correct').value),
    timeLimit: parseInt(card.querySelector('.q-time').value),
    mode: card.querySelector('.q-mode').value
  };
  window.addQuestionCard(data);
};

function extractGameFromUI() {
  const title = document.getElementById('gameTitle').value || "JeuGalo Quiz";
  const cards = document.querySelectorAll('.question-card');
  const questions = [];

  cards.forEach((card, idx) => {
    questions.push({
      id: idx + 1,
      question: card.querySelector('.q-title').value,
      options: [
        card.querySelector('.opt-0').value,
        card.querySelector('.opt-1').value,
        card.querySelector('.opt-2').value,
        card.querySelector('.opt-3').value
      ],
      correctIndex: parseInt(card.querySelector('.q-correct').value),
      timeLimit: parseInt(card.querySelector('.q-time').value),
      mode: card.querySelector('.q-mode').value
    });
  });
  return { title, questions };
}

window.exportJSON = function() {
  const game = extractGameFromUI();
  const blob = new Blob([JSON.stringify(game, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${game.title.replace(/\s+/g, '_')}.json`;
  a.click();
};

window.loadJSON = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const data = JSON.parse(evt.target.result);
    document.getElementById('gameTitle').value = data.title;
    document.getElementById('questionsContainer').innerHTML = "";
    data.questions.forEach(q => window.addQuestionCard(q));
  };
  reader.readAsText(file);
};

// MULTIPLAYER REALTIME HOST
window.startLobby = async function() {
  currentGameData = extractGameFromUI();
  activeRoomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!activeRoomCode) return alert("Digite um código de sala!");

  document.getElementById('host-setup').style.display = 'none';
  document.getElementById('host-lobby').style.display = 'block';
  document.getElementById('displayRoomCode').innerText = activeRoomCode;

  // QR Code Generation
  document.getElementById('qrcode').innerHTML = "";
  new QRCode(document.getElementById('qrcode'), {
    text: `${window.location.origin}/player.html?room=${activeRoomCode}`,
    width: 160,
    height: 160
  });

  playAudio('/sounds/game-backsound.mp3', true);

  // Inicializar Sala no Firebase
  await set(ref(db, `rooms/${activeRoomCode}`), {
    state: "LOBBY",
    gameData: currentGameData,
    currentQuestion: 0,
    players: {}
  });

  // Ocultar e escutar Players
  onValue(ref(db, `rooms/${activeRoomCode}/players`), (snapshot) => {
    const players = snapshot.val() || {};
    const container = document.getElementById('playerList');
    container.innerHTML = "";
    document.getElementById('playerCount').innerText = Object.keys(players).length;

    Object.values(players).forEach(p => {
      container.insertAdjacentHTML('beforeend', `
        <div style="text-align:center;">
          <img src="/personagens/${p.avatar}.jpeg" style="width:60px; height:60px; border-radius:50%; border:2px solid var(--green-correct);">
          <p style="font-size:0.8rem; font-weight:bold;">${p.name}</p>
        </div>
      `);
    });
  });
};

window.startGameSession = function() {
  stopAudio('/sounds/game-backsound.mp3');
  currentQIdx = 0;
  runQuestionFlow();
};

async function runQuestionFlow() {
  const qData = currentGameData.questions[currentQIdx];
  if (!qData) {
    showFinalPodium();
    return;
  }

  // Atualizar Estado Geral para MODE_ANNOUNCE
  await update(ref(db, `rooms/${activeRoomCode}`), {
    state: "MODE_ANNOUNCE",
    currentQuestion: currentQIdx
  });

  // Mostrar Tela Modo Host
  document.getElementById('host-lobby').style.display = 'none';
  document.getElementById('host-ranking-screen').style.display = 'none';
  const modeScreen = document.getElementById('host-mode-screen');
  modeScreen.style.display = 'flex';
  modeScreen.className = `card-duo mode-${qData.mode}`;
  
  const descriptions = {
    NORMAL: "Pontuação fixa de 200 pontos por acerto! 🎯",
    DUPLO: "Pontuação dobrada! 400 pontos por acerto! ⚡🔥",
    RAPIDO: "Velocidade é tudo! Responda nos primeiros 10s para pontuação máxima! ⏱️",
    DANO: "Atenção! Erros custam 50 pontos! 💀⚠️"
  };

  document.getElementById('modeTitle').innerText = `MODO ${qData.mode}`;
  document.getElementById('modeDesc').innerText = descriptions[qData.mode];

  playAudio('/sounds/modo.mp3');

  let modeTimerVal = 10;
  const modeInterval = setInterval(() => {
    modeTimerVal--;
    document.getElementById('modeTimer').innerText = modeTimerVal;
    if (modeTimerVal <= 0) {
      clearInterval(modeInterval);
      launchQuestionGameplay(qData);
    }
  }, 1000);
}

async function launchQuestionGameplay(qData) {
  document.getElementById('host-mode-screen').style.display = 'none';
  document.getElementById('host-question-screen').style.display = 'flex';
  
  document.getElementById('displayQuestionTitle').innerText = qData.question;
  document.getElementById('optText0').innerText = qData.options[0];
  document.getElementById('optText1').innerText = qData.options[1];
  document.getElementById('optText2').innerText = qData.options[2];
  document.getElementById('optText3').innerText = qData.options[3];

  await update(ref(db, `rooms/${activeRoomCode}`), {
    state: "QUESTION_ACTIVE",
    answers: {}
  });

  questionStartTime = Date.now();
  let timeRemaining = qData.timeLimit;
  document.getElementById('questionTimer').innerText = timeRemaining;

  playAudio('/sounds/questionsound.mp3', true);

  const qTimer = setInterval(() => {
    timeRemaining--;
    document.getElementById('questionTimer').innerText = timeRemaining;

    if (timeRemaining === 10) {
      playAudio('/sounds/alert.mp3');
    }

    if (timeRemaining <= 0) {
      clearInterval(qTimer);
      stopAudio('/sounds/questionsound.mp3');
      processAnswersAndShowRanking();
    }
  }, 1000);
}

async function processAnswersAndShowRanking() {
  const qData = currentGameData.questions[currentQIdx];
  const roomSnap = await get(child(ref(db), `rooms/${activeRoomCode}`));
  const room = roomSnap.val();
  const answers = room.answers || {};
  const players = room.players || {};

  // Processamento de pontos
  for (let pKey in players) {
    const ans = answers[pKey];
    let scoreGained = 0;

    if (ans !== undefined) {
      if (ans.optionIndex === qData.correctIndex) {
        if (qData.mode === 'NORMAL') scoreGained = 200;
        else if (qData.mode === 'DUPLO') scoreGained = 400;
        else if (qData.mode === 'RAPIDO') {
          scoreGained = ans.responseTime <= 10 ? 200 : Math.max(50, 200 - Math.floor((ans.responseTime - 10) * 7.5));
        } else if (qData.mode === 'DANO') scoreGained = 200;
      } else {
        if (qData.mode === 'DANO') scoreGained = -50;
      }
    }

    const newScore = Math.max(0, (players[pKey].score || 0) + scoreGained);
    await update(ref(db, `rooms/${activeRoomCode}/players/${pKey}`), { score: newScore });
    
    // Atualizar Feedback Individual do Player
    await set(ref(db, `rooms/${activeRoomCode}/playerFeedback/${pKey}`), {
      isCorrect: ans && ans.optionIndex === qData.correctIndex
    });
  }

  // Notificar Fim da Pergunta
  await update(ref(db, `rooms/${activeRoomCode}`), { state: "QUESTION_END" });

  showIntermediateRanking();
}

async function showIntermediateRanking() {
  document.getElementById('host-question-screen').style.display = 'none';
  document.getElementById('host-ranking-screen').style.display = 'block';

  playAudio('/sounds/level.mp3');

  const roomSnap = await get(child(ref(db), `rooms/${activeRoomCode}`));
  const players = Object.entries(roomSnap.val().players || {}).map(([key, val]) => ({ key, ...val }));

  // Ordenar por Pontuação
  players.sort((a, b) => b.score - a.score);

  const container = document.getElementById('rankingContainer');
  container.innerHTML = "";

  players.slice(0, 5).forEach((p, idx) => {
    const prevScore = previousScores[p.key] || 0;
    const diff = p.score - prevScore;
    const arrow = diff > 0 ? `<span class="arrow-up">▲ +${diff}</span>` : (diff < 0 ? `<span class="arrow-down">▼ ${diff}</span>` : `<span>-</span>`);

    container.insertAdjacentHTML('beforeend', `
      <div class="ranking-item">
        <div style="display:flex; align-items:center; gap:10px;">
          <b>#${idx + 1}</b>
          <img src="/personagens/${p.avatar}.jpeg" style="width:40px; height:40px; border-radius:50%;">
          <span>${p.name}</span>
        </div>
        <div>
          ${arrow}
          <span style="font-family: Feather-Bold; margin-left:15px;">${p.score} pts</span>
        </div>
      </div>
    `);

    previousScores[p.key] = p.score;
  });
}

window.nextQuestion = function() {
  currentQIdx++;
  runQuestionFlow();
};

async function showFinalPodium() {
  document.getElementById('host-ranking-screen').style.display = 'none';
  document.getElementById('host-podium-screen').style.display = 'block';

  playAudio('/sounds/win01.mp3');
  await update(ref(db, `rooms/${activeRoomCode}`), { state: "GAME_OVER" });

  const roomSnap = await get(child(ref(db), `rooms/${activeRoomCode}`));
  const players = Object.values(roomSnap.val().players || {}).sort((a, b) => b.score - a.score);

  const podium = document.getElementById('podiumDisplay');
  podium.innerHTML = "";

  const heights = ["140px", "180px", "100px"];
  const order = [1, 0, 2]; // 2º, 1º, 3º

  order.forEach((posIdx) => {
    const p = players[posIdx];
    if (p) {
      podium.insertAdjacentHTML('beforeend', `
        <div style="display:flex; flex-direction:column; align-items:center;">
          <img src="/personagens/${p.avatar}.jpeg" style="width:50px; height:50px; border-radius:50%; border:3px solid var(--amarelo);">
          <b>${p.name}</b>
          <div style="height:${heights[posIdx]}; width:80px; background:var(--laranja-escuro); border-radius:12px 12px 0 0; display:flex; align-items:center; justify-content:center; color:white; font-family:Feather-Bold; font-size:1.5rem;">
            ${posIdx + 1}º
          </div>
        </div>
      `);
    }
  });

  // SISTEMA PROGRESSO MAPA DA FRANÇA
  const totalScoreRoom = players.reduce((sum, p) => sum + p.score, 0);
  const maxEstimated = currentGameData.questions.length * players.length * 200;
  const passedStage = totalScoreRoom > (maxEstimated * 0.5);

  const mapRef = ref(db, `mapProgress/${activeRoomCode}`);
  const mapSnap = await get(mapRef);
  let currentStage = mapSnap.exists() ? mapSnap.val().stage : 0;

  if (passedStage && currentStage < FRANCE_STAGES.length - 1) {
    currentStage++;
    await set(mapRef, { stage: currentStage });
  }

  document.getElementById('franceMapStatus').innerText = passedStage 
    ? `🎉 Conquista! A sala atingiu a meta e conquistou a região: ${FRANCE_STAGES[currentStage]}!` 
    : `Pontuação insuficiente para desbloquear a próxima região. Região atual: ${FRANCE_STAGES[currentStage]}`;

  const stagesGrid = document.getElementById('stagesGrid');
  stagesGrid.innerHTML = "";
  FRANCE_STAGES.forEach((st, idx) => {
    const isUnlocked = idx <= currentStage;
    stagesGrid.insertAdjacentHTML('beforeend', `
      <div style="padding: 8px 12px; border-radius: 12px; background: ${isUnlocked ? 'var(--green-correct)' : 'var(--light-gray)'}; color: ${isUnlocked ? 'white' : '#888'}; font-size: 0.8rem; font-family: Feather-Bold;">
        ${st} ${isUnlocked ? '✓' : '🔒'}
      </div>
    `);
  });
}

// MULTIPLAYER REALTIME PLAYER LOGIC
window.joinRoom = async function() {
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  const name = document.getElementById('nickname').value.trim();
  const avatar = AVATARS[currentAvatarIdx];

  if (!code || !name) return alert("Preencha todos os campos!");

  const roomSnap = await get(child(ref(db), `rooms/${code}`));
  if (!roomSnap.exists()) return alert("Sala não encontrada!");

  activeRoomCode = code;
  const playerRef = push(ref(db, `rooms/${code}/players`));
  localPlayerKey = playerRef.key;

  await set(playerRef, {
    name: name,
    avatar: avatar,
    score: 0
  });

  document.getElementById('player-login').style.display = 'none';
  document.getElementById('player-wait').style.display = 'block';

  // Escutar Mudança de Estados da Sala
  onValue(ref(db, `rooms/${code}/state`), (snapshot) => {
    const state = snapshot.val();
    if (state === "QUESTION_ACTIVE") {
      document.getElementById('player-wait').style.display = 'none';
      document.getElementById('player-feedback').style.display = 'none';
      document.getElementById('player-gameplay').style.display = 'block';
    } else if (state === "QUESTION_END") {
      document.getElementById('player-gameplay').style.display = 'none';
      checkPlayerFeedback();
    } else if (state === "GAME_OVER") {
      document.getElementById('player-gameplay').style.display = 'none';
      document.getElementById('player-wait').style.display = 'block';
      document.getElementById('player-wait').innerHTML = "<h1>Jogo Finalizado! Confira o Pódio no Projetor.</h1>";
    }
  });
};

window.sendAnswer = async function(optionIdx) {
  playAudio('/sounds/click.mp3');
  const responseTime = (Date.now() - questionStartTime) / 1000;
  
  await set(ref(db, `rooms/${activeRoomCode}/answers/${localPlayerKey}`), {
    optionIndex: optionIdx,
    responseTime: responseTime
  });

  document.getElementById('player-gameplay').style.display = 'none';
  document.getElementById('player-wait').style.display = 'block';
};

async function checkPlayerFeedback() {
  const fbSnap = await get(child(ref(db), `rooms/${activeRoomCode}/playerFeedback/${localPlayerKey}`));
  const feedback = fbSnap.val();

  document.getElementById('player-wait').style.display = 'none';
  const fbScreen = document.getElementById('player-feedback');
  fbScreen.style.display = 'block';

  if (feedback && feedback.isCorrect) {
    playAudio('/sounds/ok.mp3');
    document.getElementById('feedbackText').innerText = "Você Acertou! 🎉";
    document.getElementById('feedbackText').style.color = "var(--green-correct)";
    document.getElementById('feedbackImg').src = "/images/happygalo.png";
  } else {
    playAudio('/sounds/falha.mp3');
    document.getElementById('feedbackText').innerText = "Que pena, errou! 😢";
    document.getElementById('feedbackText').style.color = "var(--vermelho)";
    document.getElementById('feedbackImg').src = "/images/sadgalo.png";
  }
}
