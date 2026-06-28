import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
  projectId: "gen-lang-client-0465392569",
  appId: "1:396432073551:web:ab1e2d4274e725ea055b3a",
  apiKey: "AIzaSyBt8o5V9pWOS5NUtemIQx_89Z2cUUBzJyo",
  authDomain: "gen-lang-client-0465392569.firebaseapp.com",
  storageBucket: "gen-lang-client-0465392569.firebasestorage.app",
  messagingSenderId: "396432073551",
};

// Use specific databaseId if provided (like in ai studio)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-rankdashcontrole-af875a37-09c5-40f5-a028-32f1c710f557");
const auth = getAuth(app);

export { app, db, auth };

