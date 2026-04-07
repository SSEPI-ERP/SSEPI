// firebase-config.js - Configuración Centralizada SSEPI
// Versión Ironclad: expone auth y db globalmente para todo el sistema
const firebaseConfig = {
    apiKey: "AIzaSyDs21Fhk5l6Ktt2If7zmn4RX0Ghnd_qfRI",
    authDomain: "ssepi-control.firebaseapp.com",
    projectId: "ssepi-control",
    storageBucket: "ssepi-control.firebasestorage.app",
    messagingSenderId: "875289759744",
    appId: "1:875289759744:web:94ef290f08f1b5db6048e5"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Instancias locales
const auth = firebase.auth();
const db = firebase.firestore();

// 🌐 EXPOSICIÓN GLOBAL – requerido por VentasManager y el guardián
window.auth = auth;
window.db = db;
window.firebase = firebase; // ya global, se reasigna por claridad

console.log("🚀 SSEPI Core: Conectado a Firebase (auth global)");