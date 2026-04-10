import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDtT9MEwqFbkNrh08RQQa9nQnpJkG7QC14",
  authDomain: "lunch-order-6599a.firebaseapp.com",
  projectId: "lunch-order-6599a",
  storageBucket: "lunch-order-6599a.firebasestorage.app",
  messagingSenderId: "1068578277685",
  appId: "1:1068578277685:web:5b28c570ac71c0a25d647c",
  measurementId: "G-ZV589N0MNG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
