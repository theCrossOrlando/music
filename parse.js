import firebase from './src/firebaseInit.js'
import { collection, getFirestore, addDoc } from 'firebase/firestore'
import https from 'https';
import { load } from 'js-yaml';
const db = getFirestore(firebase)

const url = 'https://raw.githubusercontent.com/theCrossOrlando/thecrossorlando.github.io/master/_data/lyrics.yml'

https.get(url, response => {
  let output = ''
  response.on('data', (chunk) => output += chunk)
  response.on('end', () => {
    const lyrics = load(output)

    lyrics.map(l => {
      addDoc(collection(db, 'lyrics'), {
        song: l.song,
        artist: l.artist ? l.artist : '',
        // Coerced, not passed through: Firestore rejects undefined, and a song
        // stored without this field would be missed by any enabled== query.
        enabled: l.enabled === true,
        lyrics: l.lyrics
      });
    })
  })
});
