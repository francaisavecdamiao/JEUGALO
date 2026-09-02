/* ============================================================
   firebase-config.js
   Configuração e inicialização do Firebase Realtime Database
   para o JeuGalo.

   >>> SUBSTITUA os valores abaixo pelas credenciais do SEU
   projeto Firebase (Console Firebase > Configurações do projeto
   > Seus apps > Configuração do SDK).

   Este arquivo usa o Firebase SDK v9 "compat" (via CDN, sem
   bundler), o que permite usar `firebase.database()` direto no
   navegador com <script> tags simples — ideal para um projeto
   Jamstack estático hospedado no GitHub Pages / Vercel.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyA7miLHSKdKK8CielNw-ZwU_V83Bg47Rho",
  authDomain: "jeugalo-e6be9.firebaseapp.com",
  projectId: "jeugalo-e6be9",
  storageBucket: "jeugalo-e6be9.firebasestorage.app",
  messagingSenderId: "442446594694",
  appId: "1:442446594694:web:2c5870ab10f96c163cc707",
  measurementId: "G-362GZR6MFR"
};

// Evita reinicializar o app se este arquivo for carregado mais de uma vez
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Referência global para o Realtime Database, usada em todo o app.js
const db = firebase.database();

/* ------------------------------------------------------------
   Regras de segurança sugeridas (Firebase Console > Realtime
   Database > Regras) — ajuste conforme a necessidade de produção:

{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    },
    "mapProgress": {
      "$roomName": {
        ".read": true,
        ".write": true
      }
    }
  }
}
   ------------------------------------------------------------ */

// Estrutura de dados no Realtime Database:
//
// rooms/{roomCode}
//   ├─ roomName: string
//   ├─ status: "waiting" | "mode" | "question" | "reveal" | "ranking" | "podium"
//   ├─ createdAt: timestamp
//   ├─ hostConnected: boolean
//   ├─ game: { title, questions: [...] }
//   ├─ currentQuestionIndex: number
//   ├─ questionStartedAt: timestamp
//   ├─ mapPhaseAtStart: number
//   └─ players/{playerId}
//        ├─ nickname: string
//        ├─ character: string   (ex: "MARIE")
//        ├─ score: number
//        ├─ lastDelta: number
//        ├─ answers/{questionId}: { optionIndex, correct, timeMs, pointsEarned }
//
// mapProgress/{roomName}
//   └─ unlockedPhase: number  (0 a 10 — quantas regiões da França já foram conquistadas)
