import { initializeApp } from "firebase/app";
import { logThirdPartyStatus } from './third-party-debug';
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail, 
    sendSignInLinkToEmail,
    confirmPasswordReset,
    checkActionCode,
    updatePassword,
    signInWithPopup
} from "firebase/auth";

const firebaseConfigured = Boolean(
    process.env.REACT_APP_FIREBASE_API_KEY &&
    process.env.REACT_APP_FIREBASE_AUTH_DOMAIN
);

export const app = firebaseConfigured ? initializeApp({
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: 'linemate-321320',
    appId: '1:869193450072:web:66c378da0e41d9d9e5802d'
}) : null;

// Adapter class to allow for the use of the auth object in the old format of the firebase app rather than passing it into functions all the time
// This will allow us not to have to change all the existing code relying on the auth object during the upgrade from firebase 8.x to 10.x
class AuthAdapter {

    constructor(auth) {
        this.auth = auth;
    }

    get currentUser() {
        return this.auth.currentUser;
    }

    signInWithEmailAndPassword(email, password) {
        return signInWithEmailAndPassword(this.auth, email, password);
    }

    signInWithProvider(provider) {
        return signInWithPopup(this.auth, provider)
    }

    createUserWithEmailAndPassword(email, password) {
        return createUserWithEmailAndPassword(this.auth, email, password);
    }

    signOut() {
        return signOut(this.auth);
    }

    onAuthStateChanged(nextOrObserver, error, completed) {
        return this.auth.onAuthStateChanged(nextOrObserver, error, completed);
    }

    authStateReady() {
        return this.auth.authStateReady();
    }

    sendPasswordResetEmail(email) {
        return sendPasswordResetEmail(this.auth, email);
    }

    sendSignInLinkToEmail(email) {
        return sendSignInLinkToEmail(this.auth, email);
    }

    confirmPasswordReset(code, newPassword) {
        return confirmPasswordReset(this.auth, code, newPassword);
    }

    checkActionCode(code) {
        return checkActionCode(this.auth, code);
    }

    updatePassword(user, newPassword) {
        return updatePassword(user, newPassword);
    }

}

class NoopAuthAdapter {

    get currentUser() {
        return null;
    }

    signInWithEmailAndPassword() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }

    signInWithProvider() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }

    createUserWithEmailAndPassword() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }

    signOut() {
        return Promise.resolve();
    }

    onAuthStateChanged(nextOrObserver) {
        if (typeof nextOrObserver === 'function') {
            nextOrObserver(null);
        } else if (nextOrObserver?.next) {
            nextOrObserver.next(null);
        }
        return () => {};
    }

    authStateReady() {
        return Promise.resolve();
    }

    sendPasswordResetEmail() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }

    sendSignInLinkToEmail() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }

    confirmPasswordReset() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }

    checkActionCode() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }

    updatePassword() {
        return Promise.reject(new Error('Firebase auth is not configured.'));
    }
}

export const auth = firebaseConfigured ? new AuthAdapter(getAuth(app)) : new NoopAuthAdapter();

if (firebaseConfigured) logThirdPartyStatus('Firebase Auth', 'initialized');
