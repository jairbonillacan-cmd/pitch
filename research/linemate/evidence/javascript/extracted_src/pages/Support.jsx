import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_ACTIVE_LEAGUE } from '../linemate-react-common/src/constants.js';
import HtmlHeaders from '../html-headers';
import GlobalContext from '../components/GlobalContext.jsx';
import Button from '../components/Button.jsx';
import './Support.scss';

export default function Support() {
  const { t } = useTranslation();
  const context = useContext(GlobalContext);
  const league = context?.league || DEFAULT_ACTIVE_LEAGUE;

  return (
    <>
      <HtmlHeaders canonicalRef="https://www.linemate.io/support" />

      <div className="support-page">
        <div className="support-page-card">
          <div className="support-page-header">
            <p className="text-style-h-1-medium color-fig-default support-page-title">
              {t('web.status.supportTitle')}
            </p>

            <p className="text-style-h-3-medium color-fig-subtle support-page-description">
              {t('web.status.supportDescription')}
            </p>
          </div>

          <div className="support-page-links">
            <div className="support-page-button-wrapper">
              <Button
                text={t('web.status.goHome')}
                typography="md"
                type="primary"
                enabled={true}
                href={`/${league}`}
              />
            </div>

            <div className="support-page-button-wrapper">
              <Button
                text={t('web.status.openTrends')}
                typography="md"
                type="secondary"
                enabled={true}
                href={`/${league}/trends`}
              />
            </div>

            <div className="support-page-button-wrapper">
              <Button
                text={t('web.status.contactSupport')}
                typography="md"
                type="secondary"
                enabled={true}
                href="mailto:support@linemate.io"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}