import firebase from './src/firebaseInit.js'
import { collection, getFirestore, addDoc } from '@firebase/firestore'
import https from 'https';
import yaml from 'js-yaml';
const db = getFirestore(firebase)

const url = 'https://raw.githubusercontent.com/theCrossOrlando/thecrossorlando.github.io/master/_data/lyrics.yml'

https.get(url, response => {
  let output = ''
  response.on('data', (chunk) => output += chunk)
  response.on('end', () => {
    const lyrics = yaml.load(output)

    lyrics.map(l => {
      addDoc(collection(db, 'lyrics'), {
        song: l.song,
        artist: l.artist ? l.artist : '',
        enabled: l.enabled,
        lyrics: l.lyrics
      });
    })
  })
});
