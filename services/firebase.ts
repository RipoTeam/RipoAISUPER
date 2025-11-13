// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration from the prompt
const firebaseConfig = {
  apiKey: "AIzaSyBpEVuenICvyH1-5Ni1h0wNrheTth5zfzc",
  authDomain: "ripoplay-e3a36.firebaseapp.com",
  projectId: "ripoplay-e3a36",
  storageBucket: "ripoplay-e3a36.firebasestorage.app",
  messagingSenderId: "899182543857",
  appId: "1:899182543857:web:a527d31451379a1c623a50",
  measurementId: "G-CN1W6TCQ5Z"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
