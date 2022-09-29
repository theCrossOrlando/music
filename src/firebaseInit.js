import { initializeApp } from "@firebase/app"

const firebaseConfig = {
  apiKey: "AIzaSyAb3tuVXmuobrVZr_n1JuKYoapmocCx078",
  authDomain: "thecross-music.firebaseapp.com",
  projectId: "thecross-music",
  storageBucket: "thecross-music.appspot.com",
  messagingSenderId: "318539621394",
  appId: "1:318539621394:web:fc8f59c90ff04c85cb24cb"
};

// Initialize Firebase
export default initializeApp(firebaseConfig)
