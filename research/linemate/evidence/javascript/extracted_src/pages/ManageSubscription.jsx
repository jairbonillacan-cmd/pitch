import React from 'react';

import './Download.scss'
import '../components/App.scss'
import GlobalContext from '../components/GlobalContext';
import {
    API_HOST,
    ANDROID_SUBSCRIPTION_MANAGEMENT_INTENT_URL,
    ANDROID_SUBSCRIPTION_MANAGEMENT_URL,
    IOS_SUBSCRIPTION_MANAGEMENT_DEEP_LINK,
    IOS_SUBSCRIPTION_MANAGEMENT_URL
} from '../react-web-constants';
import HtmlHeaders from '../html-headers';
import { getTheme, openStripeBillingPortal } from '../react-web-utils';
import Button from '../components/Button';
import { withTranslation } from 'react-i18next';

function navigateToUrl(primaryUrl, fallbackUrl, shouldFallback = true) {
    window.location.href = primaryUrl;

    if (fallbackUrl && shouldFallback) {
        window.setTimeout(() => {
            if (!document.hidden) {
                window.location.href = fallbackUrl;
            }
        }, 1200);
    }
}

function getSubscriptionManagementTarget() {
    const userAgent = window.navigator.userAgent || '';

    if (/iPad|iPhone|iPod/.test(userAgent)) {
        return {
            primaryUrl: IOS_SUBSCRIPTION_MANAGEMENT_DEEP_LINK,
            fallbackUrl: IOS_SUBSCRIPTION_MANAGEMENT_URL,
            shouldFallback: true,
            shouldAutoRedirect: true
        };
    }

    if (/Android/.test(userAgent)) {
        return {
            primaryUrl: ANDROID_SUBSCRIPTION_MANAGEMENT_INTENT_URL,
            fallbackUrl: ANDROID_SUBSCRIPTION_MANAGEMENT_URL,
            shouldFallback: true,
            shouldAutoRedirect: true
        };
    }

    return null;
}

class ManageSubscription extends React.Component {
    static contextType = GlobalContext;

    componentDidMount() {
        document.title = `${this.props.t('web.manageSubscription.title')} - Linemate`;

        const redirectTarget = getSubscriptionManagementTarget();

        if (redirectTarget?.shouldAutoRedirect) {
            navigateToUrl(redirectTarget.primaryUrl, redirectTarget.fallbackUrl, redirectTarget.shouldFallback);
        }
    }

    openStripePortal() {
        this.context.user.getIdToken().then((token) => openStripeBillingPortal(API_HOST, token));
    }

    render() {
        const { t } = this.props;
        return (
            <div className='download-page-container'>
                <HtmlHeaders canonicalRef="https://www.linemate.io/manage-subscription"/>
                <div className='download-page-content'>
                    <img src={`assets/download-icon-${getTheme()}.png`} alt="logo"/>
                    <p className='color-fig-default'>{t('web.manageSubscription.title')}</p>
                    <div className='download-page-content-buttons'>
                        {
                            this.context.user && (
                                <div className='download-page-content-ios-button-wrapper'>
                                    <Button text={t('web.manageSubscription.web')} typography="xl" type="secondary" enabled={!!this.context?.user} onClick={() => this.openStripePortal()}/>
                                </div>
                            )
                        }
                        <div className='download-page-content-ios-button-wrapper'>
                            <Button text={t('web.manageSubscription.ios')} typography="xl" type="secondary" enabled={true} onClick={() => navigateToUrl(IOS_SUBSCRIPTION_MANAGEMENT_DEEP_LINK, IOS_SUBSCRIPTION_MANAGEMENT_URL)}/>
                        </div>
                        <div className='download-page-content-android-button-wrapper'>
                            <Button text={t('web.manageSubscription.android')} typography="xl" type="secondary" enabled={true} onClick={() => navigateToUrl(ANDROID_SUBSCRIPTION_MANAGEMENT_INTENT_URL, ANDROID_SUBSCRIPTION_MANAGEMENT_URL, true)}/>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

}

export default withTranslation()(ManageSubscription);
