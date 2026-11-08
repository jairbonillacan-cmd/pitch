import { useContext, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';
import GlobalContext from '../GlobalContext';
import Button from '../Button';
import {
    getEmailSubscription,
    readEmailSubscription,
    subscribeAccountEmail
} from '../../email-subscription';
import './HomeSidebarNewsletter.scss';

// Survives responsive remounts, but not navigation or page refresh.
let lastConfirmation = null;

export default function HomeSidebarNewsletter() {
    const context = useContext(GlobalContext);
    const { t } = useTranslation();
    const history = useHistory();
    const location = useLocation();

    const user = context.user;
    const uuid = context.userAttributes?.uuid;
    const email = user?.email || context.userAttributes?.email || '';
    const accountKey = `${user?.uid || ''}|${uuid || ''}`;
    const pageKey = `${accountKey}|${location.pathname}|${location.search}|${location.hash}|${location.key || ''}`;

    const [status, setStatus] = useState(null);
    const [confirmation, setConfirmation] = useState(lastConfirmation);
    const [error, setError] = useState(false);

    useEffect(() => history.listen(() => {
        lastConfirmation = null;
        setConfirmation(null);
    }), [history]);

    useEffect(() => {
        let active = true;

        if (lastConfirmation?.pageKey !== pageKey) {
            lastConfirmation = null;
        }

        setConfirmation(lastConfirmation);
        setError(false);
        setStatus({
            accountKey,
            entry: readEmailSubscription(user, uuid)
        });

        if (!user || !uuid || !email) {
            return () => { active = false; };
        }

        function refresh() {
            if (document.visibilityState === 'hidden') return;

            getEmailSubscription(user, uuid)
                .then((entry) => {
                    if (active && lastConfirmation?.pageKey !== pageKey) {
                        setStatus({ accountKey, entry });
                    }
                })
                .catch((failure) => {
                    console.error('Unable to check email subscription', failure);
                    if (active) setStatus(null);
                });
        }

        refresh();
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);

        return () => {
            active = false;
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [user, uuid, email, accountKey, pageKey]);

    function subscribe() {
        if (lastConfirmation?.pageKey === pageKey) return;

        setError(false);

        try {
            const entry = subscribeAccountEmail(user, uuid, email);
            lastConfirmation = { pageKey };
            setStatus({ accountKey, entry });
            setConfirmation(lastConfirmation);
        } catch (failure) {
            console.error('Unable to subscribe account email', failure);
            setError(true);
        }
    }

    if (!user || !uuid || !email) return null;

    if (confirmation?.pageKey === pageKey) {
        return (
            <section className="home-sidebar-newsletter home-sidebar-newsletter-confirmed">
                <div className="home-sidebar-newsletter-copy">
                    <p className="text-style-label-semibold color-fig-default">
                        <img src="/assets/check-circle.svg" alt="" />
                        {t('home.sidebar.newsletter.subscribedTitle')}
                    </p>
                    <p className="text-style-label-normal color-fig-subtle">
                        {t('home.sidebar.newsletter.subscribedBody')}
                    </p>
                </div>
            </section>
        );
    }

    const entry = status?.accountKey === accountKey ? status.entry : null;

    if (!entry || !['unsubscribed', 'not_found'].includes(entry.status)) {
        return null;
    }

    return (
        <section className="home-sidebar-newsletter">
            <div className="home-sidebar-newsletter-copy">
                <p className="text-style-label-semibold color-fig-default">
                    <img src="/assets/email.svg" alt="" />
                    {t('home.sidebar.newsletter.title')}
                </p>
                <p className="text-style-label-normal color-fig-subtle">
                    <Trans
                        i18nKey="home.sidebar.newsletter.description"
                        components={{ strong: <strong /> }}
                    />
                </p>
            </div>

            {error && (
                <p className="text-style-label-normal color-fig-subtle" role="alert">
                    {t('common.errors.genericTryAgainLater')}
                </p>
            )}

            <Button
                text={t('home.sidebar.newsletter.subscribe')}
                typography="md"
                type="secondary"
                enabled
                onClick={subscribe}
            />
        </section>
    );
}