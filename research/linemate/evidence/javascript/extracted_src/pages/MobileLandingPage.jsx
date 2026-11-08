import React from 'react';
import { useTranslation } from 'react-i18next';
import { getTheme } from '../react-web-utils'

import './MobileLandingPage.scss';
import '../components/App.scss';

import Footer from '../components/Footer';
import _ from 'lodash';
import { SPORTSBOOKS_CONFIG, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants';
import Button from '../components/Button';

const sections = [
    {
        type: 'image',
        imageName: 'mobile-landing-animation',
        fileType: 'mp4',
        imageAltKey: 'mobileLanding.media.appPreview',
        hasBorder: true
    },
    {
        type: 'text',
        headingKey: 'mobileLanding.sections.research.heading',
        bodyKey: 'mobileLanding.sections.research.body',
    },
    {
        type: 'image',
        imageName: 'mobile-landing-leagues',
        fileType: 'png',
        imageAltKey: 'mobileLanding.media.leagues',
        style: {paddingTop: '24px'}
    },
    {
        type: 'text',
        bodyKey: 'mobileLanding.sections.leagues.body',
    },
    {
        type: 'image',
        imageName: 'mobile-landing-second',
        fileType: 'mp4',
        imageAltKey: 'mobileLanding.media.trendFlow',
        hasBorder: true,
        style: {marginTop: '24px'}
    },
    {
        type: 'text',
        bodyKey: 'mobileLanding.sections.trends.body',
    },
    {
        type: 'image',
        imageName: 'mobile-landing-trend-analysis',
        fileType: 'png',
        imageAltKey: 'mobileLanding.media.trendAnalysis',
        style: {paddingTop: '24px'}
    },
    {
        type: 'text',
        bodyKey: 'mobileLanding.sections.analysis.body',
    },
    {
        type: 'image',
        imageName: 'mobile-landing-mypicks',
        fileType: 'png',
        imageAltKey: 'mobileLanding.media.myPicks',
    },
    {
        type: 'textGroup',
        items: [
            {
                bodyKey: 'mobileLanding.sections.odds.body',
                style: {paddingBottom: '16px'},
                blurColor: () => _.get(SPORTSBOOKS_CONFIG, 'betmgm.backgroundColor'),
            },
            {
                bodyKey: 'mobileLanding.sections.checkout.body',
                style: {paddingTop: '16px'},
                blurColor: () => _.get(SUPPORTED_LEAGUES, `nba.teams.colors.${getTheme()}.lal`),
            },
        ],
        style: {paddingTop: '24px'}
    },
    {
        type: 'image',
        imageName: 'mobile-landing-checkout',
        fileType: 'png',
        imageAltKey: 'mobileLanding.media.checkout',
    },
];

function renderTextBlock(section, index, t) {
    return (
        <section key={index} className='mobile-landing-section mobile-landing-text-block'
            style={
                section.hasBorder
                    ? {
                        border: '1px solid var(--color-border-subtle)',
                    }
                    : undefined
            }
        >
            {section.headingKey ? (
                <p className='mobile-landing-heading text-style-h-1-semibold' style={{paddingBottom: '12px'}}>{t(section.headingKey)}</p>
            ) : null}

            {section.bodyKey ? (
                <p className={`${section.headingKey ? 'text-style-body-medium' : 'text-style-h-3-medium'}`} style={{
                    color: section.headingKey ? 'var(--color-fig-subtle)' : 'var(--color-fig-default)',
                    ...section.style,
                }}>{t(section.bodyKey)}</p>
            ) : null}
        </section>
    );
}

function renderSection(section, index, t) {
    if (section.type === 'image') {
        const fileType = section.fileType || 'png';
        const mediaSrc = `/assets/mobile-landing/${section.imageName}-${getTheme()}.${fileType}`;

        return (
            <section key={index} className='mobile-landing-section mobile-landing-section--media'
                style={{
                    ...(section.hasBorder
                        ? {
                            border: '1px solid var(--color-border-subtle)',
                            borderRadius: '16px'
                        }
                        : {}),
                    ...section.style
                }}
            >
                <div className='mobile-landing-media-frame'>
                    {fileType === 'mp4' ? (
                        <video
                            className='mobile-landing-media'
                            src={mediaSrc}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload='metadata'
                            aria-label={section.imageAltKey ? t(section.imageAltKey) : ''}
                        />
                    ) : (
                        <img
                            className='mobile-landing-media'
                            src={mediaSrc}
                            alt={section.imageAltKey ? t(section.imageAltKey) : ''}
                        />
                    )}
                </div>
            </section>
        );
    }

    if (section.type === 'text') {
        return renderTextBlock(section, index, t);
    }

    if (section.type === 'textGroup') {
        return (
            <section
                key={index}
                className='mobile-landing-section mobile-landing-text-group'
                style={section.style}
            >
                {section.items.map((item, itemIndex) => (
                    <div
                        key={itemIndex}
                        className={`mobile-landing-text-group-item ${
                            itemIndex === 0
                                ? 'mobile-landing-text-group-item--top'
                                : 'mobile-landing-text-group-item--bottom'
                        }`}
                    >
                        <div className='mobile-landing-text-group-blur-clip'>
                            <div
                                className='mobile-landing-text-group-blur'
                                style={{ background: item.blurColor() }}
                            />
                        </div>

                        {renderTextBlock(item, `${index}-${itemIndex}`, t)}
                    </div>
                ))}
            </section>
        );
    }

    return null;
}

function MobileLandingPage() {
    const { t } = useTranslation();
    React.useEffect(() => {
        document.title = 'Linemate';
    }, []);

    return (
        <div className='landing-page-container'>
            <main className='mobile-landing-content'>
                {sections.map((section, index) => renderSection(section, index, t))}
            </main>

            <div className='mobile-landing-bottom-cta'>
                <img
                    className='mobile-landing-bottom-cta-image'
                    src='/assets/mobile-landing/mobile-landing-cta.png'
                    alt={t('web.navigation.downloadLinemate')}
                />

                <p className='mobile-landing-bottom-cta-title text-style-h-1-semibold'>
                    {t('mobileLanding.cta.titleLineOne')} <br /> {t('mobileLanding.cta.titleLineTwo')}
                </p>

                <div className='mobile-landing-bottom-cta-button'>
                    <Button
                        text={t('web.navigation.downloadLinemate')}
                        typography='xl'
                        type='secondary'
                        enabled={true}
                        onClick={() => window.location.href = '/download'}
                        className='mobile-landing-cta-btn'
                    />
                </div>
            </div>

            <Footer />
        </div>
    );
}

export default MobileLandingPage;