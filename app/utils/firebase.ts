import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBRkFcimlmQGYzblX_hKm0CCGsggzLKhYc',
  authDomain: 'hintbot-beta.firebaseapp.com',
  projectId: 'hintbot-beta',
  storageBucket: 'hintbot-beta.firebasestorage.app',
  messagingSenderId: '932397826138',
  appId: '1:932397826138:web:b650e4e235afdc0ff95863',
  measurementId: 'G-5JDKG2Q83N',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firestore
export const db = getFirestore(app)
