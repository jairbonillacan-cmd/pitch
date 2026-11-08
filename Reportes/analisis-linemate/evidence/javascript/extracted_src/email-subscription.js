import * as braze from '@braze/web-sdk';
import { auth } from './firebase';
import { API_HOST } from './react-web-constants';

const TTL = 60 * 60 * 1000;
const PREFIX = 'linemate-email-subscription:';
const memory = new Map();
const pending = new Map();

function keyFor(user, uuid) {
    return PREFIX + user.uid + ':' + uuid;
}

function writeCache(key, entry) {
    memory.set(key, entry);

    try {
        sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // Memory remains available if session storage is blocked.
    }
}

export function readEmailSubscription(user, uuid) {
    if (!user || !uuid) return null;

    const key = keyFor(user, uuid);
    let entry = memory.get(key);

    try {
        entry = entry || JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch {
        // Ignore unavailable or invalid session storage.
    }

    return entry && Number.isFinite(entry.checkedAt)
        && Date.now() - entry.checkedAt < TTL
        ? entry
        : null;
}

export function getEmailSubscription(user, uuid) {
    if (!user || !uuid || auth.currentUser?.uid !== user.uid) {
        return Promise.reject(new Error('Login required'));
    }

    const cached = readEmailSubscription(user, uuid);
    if (cached) return Promise.resolve(cached);

    const key = keyFor(user, uuid);
    if (pending.has(key)) return pending.get(key);

    const request = (async () => {
        const token = await user.getIdToken();
        const response = await fetch(
            API_HOST + '/api/users/v1/current/emailSubscriptionStatus',
            {
                cache: 'no-store',
                headers: { Authorization: 'Bearer ' + token }
            }
        );

        if (!response.ok) {
            throw new Error('Unable to check email subscription');
        }

        const entry = await response.json();
        if (!['subscribed', 'opted_in', 'unsubscribed', 'not_found', 'unknown']
                .includes(entry.status) || !Number.isFinite(entry.checkedAt)) {
            throw new Error('Invalid email subscription response');
        }

        // Do not overwrite a newer SDK subscription with an older lookup.
        const current = readEmailSubscription(user, uuid);
        const result = current && current.checkedAt >= entry.checkedAt
            ? current
            : entry;

        if (auth.currentUser?.uid === user.uid) writeCache(key, result);
        return result;
    })().finally(() => {
        pending.delete(key);
    });

    pending.set(key, request);
    return request;
}

export function subscribeAccountEmail(user, uuid, email) {
    if (!user || !uuid || !email || auth.currentUser?.uid !== user.uid) {
        throw new Error('Login required');
    }

    const brazeUser = braze.getUser();
    if (!brazeUser || brazeUser.getUserId() !== uuid) {
        throw new Error('Braze account is not ready');
    }

    if (!brazeUser.setEmail(email)
            || !brazeUser.setEmailNotificationSubscriptionType(
                braze.User.NotificationSubscriptionTypes.OPTED_IN
            )) {
        throw new Error('Unable to queue email subscription');
    }

    const entry = { status: 'opted_in', checkedAt: Date.now() };
    writeCache(keyFor(user, uuid), entry);
    braze.requestImmediateDataFlush();

    return entry;
}