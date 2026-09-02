import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, child, push, update, onValue, off, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7miLHSKdKK8CielNw-ZwU_V83Bg47Rho",
  authDomain: "jeugalo-e6be9.firebaseapp.com",
  databaseURL: "https://jeugalo-e6be9-default-rtdb.firebaseio.com", 
  projectId: "jeugalo-e6be9",
  storageBucket: "jeugalo-e6be9.firebasestorage.app",
  messagingSenderId: "442446594694",
  appId: "1:442446594694:web:2c5870ab10f96c163cc707",
  measurementId: "G-362GZR6MFR"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, child, push, update, onValue, off, remove };
