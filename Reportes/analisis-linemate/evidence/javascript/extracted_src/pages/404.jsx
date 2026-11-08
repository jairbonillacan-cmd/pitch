import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_ACTIVE_LEAGUE } from '../linemate-react-common/src/constants.js';
import GlobalContext from '../components/GlobalContext.jsx';
import Button from '../components/Button.jsx';
import './404.scss';

export default function NotFound() {
  const { t } = useTranslation();
  const context = useContext(GlobalContext);
  const league = context?.league || DEFAULT_ACTIVE_LEAGUE;

  return (
    <div className="status-page">
      <div className="status-page-card">

        <div className="status-page-content">
          <p className="text-style-h-1-medium color-fig-default status-page-title">
            {t('web.status.notFoundTitle')}
          </p>

          <p className="text-style-h-3-medium color-fig-subtle status-page-description">
            {t('web.status.notFoundDescription')}
          </p>

          <div className="status-page-actions">
            <div className="status-page-button-wrapper">
              <Button
                text={t('web.status.goHome')}
                typography="md"
                type="primary"
                enabled={true}
                href={`/${league}`}
              />
            </div>

            <div className="status-page-button-wrapper">
              <Button
                text={t('web.status.exploreTrends')}
                typography="md"
                type="secondary"
                enabled={true}
                href={`/${league}/trends`}
              />
            </div>

            <div className="status-page-button-wrapper">
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
    </div>
  );
}