// Firebase client configuration for frontend
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
let app;
let auth;
let firestore;

// Make sure Firebase is initialized only on the client side and only once
if (typeof window !== 'undefined') {
  try {
    // Initialize Firebase app if it hasn't been initialized already
    if (!global.firebase) {
      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      firestore = getFirestore(app);
      global.firebase = { app, auth, firestore };
    } else {
      app = global.firebase.app;
      auth = global.firebase.auth;
      firestore = global.firebase.firestore;
    }
    
    console.log('Firebase initialized successfully in firebase.js');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

export { app, auth, firestore }; 