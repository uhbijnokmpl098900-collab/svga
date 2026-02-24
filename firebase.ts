import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyA89cCavaGvK0R6TFiV8x3cP6lGEqsko8A",
    authDomain: "svga-7ad3e.firebaseapp.com",
    projectId: "svga-7ad3e",
    storageBucket: "svga-7ad3e.firebasestorage.app",
    messagingSenderId: "604602241409",
    appId: "1:604602241409:web:25442407e9e036f82a5880"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);