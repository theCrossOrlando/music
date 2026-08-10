# theCross Music

Admin console for theCross Orlando's worship set. Vue 3 + Vite on the front, Firebase
(Firestore + Google auth) behind it, deployed to Firebase Hosting.

- `/` — Google sign-in
- `/lyrics` — manage the song library, build and reorder the Sunday set list, edit the
  scripture verse
- `/data` — raw dump of the active set list

## Setup

```sh
npm install
npm run dev
```

The Firebase web config in `src/firebaseInit.js` is public by design — it identifies
the project, it does not grant access. Access is controlled by `firestore.rules`.

## Administrator access

Signing in with Google is not enough to change anything. A user is an administrator only
if `admins/<their-uid>` exists in Firestore.

Membership is deliberately **not** writable from the app — an admin cannot promote anyone
from inside the UI. To add someone:

1. Have them sign in once at the deployed site, so Firebase creates their account.
2. Find their UID in the Firebase console under **Authentication → Users**.
3. Create a document at `admins/<uid>` in Firestore. The document body is ignored; only
   its existence matters.

Everyone else sees a "not an administrator" notice on the home page.

> **Before deploying `firestore.rules` to a project for the first time, create your own
> `admins/<uid>` document.** The rules take effect immediately and there is no other way
> in.

## Deployment

Pushes to `main` deploy to live via `.github/workflows/firebase-hosting-merge.yml`.
Pull requests from the same repository get a preview channel. Rules are not deployed by
CI — push them by hand:

```sh
firebase deploy --only firestore:rules
```

## Importing the legacy library

`parse.js` is a one-shot import of the song library from the old Jekyll site's
`_data/lyrics.yml`. It appends, it does not reconcile, so running it twice duplicates
every song.

```sh
npm run import
```

## Notes

- Song order in the set list is stored as an `order` field and sorted client-side, which
  avoids needing a composite Firestore index.
- Local rules testing needs `firebase emulators:start`, which requires JDK 21 or newer.
