/**
 * Firebase project configuration.
 *
 * NOT A SECRET, and committed on purpose. Every value here ships inside the
 * JavaScript bundle and can be read by anyone who opens the site; Firebase is
 * designed around that. The apiKey identifies the project, it does not grant
 * access. What grants or refuses access is firestore.rules — which is why the
 * rules have a test suite of their own.
 *
 * Hiding these in CI secrets would add no protection, since they end up in
 * the public bundle either way, and would only make the build harder to run.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyB8D9q__2ju2CbzEwRK_fdl3lVR3k75pf4',
  authDomain: 'tripsplit-94f5e.firebaseapp.com',
  projectId: 'tripsplit-94f5e',
  storageBucket: 'tripsplit-94f5e.firebasestorage.app',
  messagingSenderId: '47918223945',
  appId: '1:47918223945:web:be2f35a12c69968dd0e598',
} as const
