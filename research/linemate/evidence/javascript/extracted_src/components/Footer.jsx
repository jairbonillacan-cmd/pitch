import React from 'react';
import { withTranslation } from 'react-i18next';
import PrivacyPreferencesLink from './PrivacyPreferencesLink';
import './Footer.scss';
import './App.scss';

class Footer extends React.Component {
  render() {
    const { t } = this.props;
    const isPageFooter = !!this.props.pageFooter;

    return (
      <div className={`footer-shell ${isPageFooter ? 'footer-shell-page' : ''}`}>
        <div className={`footer-container ${isPageFooter ? 'footer-container-page' : ''}`}>
          {/* Info and socials */}
          <div className='footer-information'>
            <div>
              <a className="footer-wordmark" href="/">
                <img src="assets/logomark.svg" alt="Linemate"/>
              </a>
              <p className='footer-copyright text-style-caption-normal'>©2026, {t('web.footer.copyright')}</p>
            </div>
            <div className='footer-socials'>
              <a href="https://www.twitter.com/yourlinemate" target="_blank" rel="noopener noreferrer">
                <img src='assets/twitter.svg' alt="X"/>
              </a>
              <a href="https://www.tiktok.com/@linemate" target="_blank" rel="noopener noreferrer">
                <img src='assets/tiktok.svg' alt="TikTok"/>
              </a>
              <a href="https://www.instagram.com/yourlinemate" target="_blank" rel="noopener noreferrer">
                <img src='assets/instagram.svg' alt="Instagram"/>
              </a>
              <a href="https://www.youtube.com/channel/UCcLsCIwyO2CAzbOynsabLGQ" target="_blank" rel="noopener noreferrer">
                <img src='assets/youtube.svg' alt="Youtube"/>
              </a>
            </div>
          </div>

          {/* Product */}
          <div className='footer-product'>
            <p className='text-style-label-medium'>{t('web.footer.product')}</p>
            <div className='footer-column-row-group'>
              <a className='text-style-label-normal' href='/'>{t('preferences.sections.about')}</a>
              <a className='text-style-label-normal' href='/download'>{t('web.footer.download')}</a>
              <a className='text-style-label-normal' href='/pricing'>{t('web.footer.pricing')}</a>
            </div>
          </div>

          {/* Company */}
          <div className='footer-company'>
            <p className='text-style-label-medium'>{t('web.footer.company')}</p>
            <div className='footer-column-row-group'>
              <a className='text-style-label-normal' href='/privacy'>{t('preferences.about.privacy')}</a>
              <PrivacyPreferencesLink className='text-style-label-normal'>{t('web.footer.privacyChoices', { defaultValue: 'Your Privacy Choices' })}</PrivacyPreferencesLink>
              <a className='text-style-label-normal' href='/terms'>{t('preferences.about.terms')}</a>
              {/* TODO: ontario/alberta text */}
              {/* <a className='text-style-label-normal' href='/bonuses'>{t('web.footer.bonuses')}</a> */}
            </div>
          </div>

          {/* Support */}
          <div className='footer-support'>
            <p className='text-style-label-medium'>{t('preferences.sections.support')}</p>
            <div className='footer-column-row-group'>
              <a className='text-style-label-normal' href="mailto:support@linemate.io">{t('preferences.items.contactSupport')} <img src="assets/arrow-outward.svg" alt=""/></a>
              <a className='text-style-label-normal' href='/responsible-gambling'>{t('preferences.about.responsibleGambling')}</a>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default withTranslation()(Footer);
