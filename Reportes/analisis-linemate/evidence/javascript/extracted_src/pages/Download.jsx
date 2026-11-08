import React from 'react';

import './Download.scss'
import '../components/App.scss'
import { ANDROID_DOWNLOAD_URL, IOS_DOWNLOAD_URL } from '../react-web-constants';
import HtmlHeaders from '../html-headers';
import { getTheme } from '../react-web-utils';
import Button from '../components/Button';
import { withTranslation } from 'react-i18next';

class Download extends React.Component {

    constructor(props) {
        super(props);

        if (/iPhone/.test(window.navigator.userAgent)) {
            window.location.href = IOS_DOWNLOAD_URL;
        }
        else if (/Android/.test(window.navigator.userAgent)) {
            window.location.href = ANDROID_DOWNLOAD_URL;
        }
    }

    componentDidMount() {        
        document.title = `${this.props.t('web.download.title')} - Linemate`;
    }

    render() {
        const { t } = this.props;
        return (
            <div className='download-page-container'>
                <HtmlHeaders canonicalRef="https://www.linemate.io/download"/>
                <div className='download-page-content'>
                    <img src={`assets/download-icon-${getTheme()}.png`} alt="logo"/>
                    <p className='color-fig-default'>{t('web.download.title')}</p>
                    <p className='text-style-h-3-medium color-fig-subtle'>{t('web.download.subtitle')}</p>
                    <div className='download-page-content-buttons'>
                        <div className='download-page-content-ios-button-wrapper'>
                            <Button text={t('web.download.ios')} typography="xl" type="secondary" enabled={true} onClick={() => window.location.href = IOS_DOWNLOAD_URL}/>
                        </div>
                        <div className='download-page-content-android-button-wrapper'>
                            <Button text={t('web.download.android')} typography="xl" type="secondary" enabled={true} onClick={() => window.location.href = ANDROID_DOWNLOAD_URL}/>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

}

export default withTranslation()(Download);