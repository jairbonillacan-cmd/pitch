import React, { useContext, useEffect } from 'react';
import '../components/App.scss';
import GlobalContext from '../components/GlobalContext';
import { monitorThirdPartyScript } from '../third-party-debug';

const APPS_FLYER_SMART_SCRIPT_SRC = 'https://onelinksmartscript.appsflyersdk.com/onelink-smart-script-latest.js';
const ONE_LINK_URL = 'https://linemate.onelink.me/gVdr';
const QR_CODE_DIV_ID = 'download-w2a-qr-code';

function isMobileDevice() {
  return /android|iphone|ipod/i.test(window.navigator.userAgent);
}

function buildAppsFlyerPayload() {
  return {
    oneLinkURL: ONE_LINK_URL,
    afParameters: {
      mediaSource: { keys: ['pid'], defaultValue: 'w2a_unattributed' },
      afSub1: { keys: ['fbclid'] },
      campaign: { keys: ['c'] },
      adSet: { keys: ['af_adset'] },
      ad: { keys: ['af_ad'] },
      afCustom: [
        { paramKey: 'af_c_id', keys: ['af_c_id'] },
        { paramKey: 'af_adset_id', keys: ['af_adset_id'] },
        { paramKey: 'af_ad_id', keys: ['af_ad_id'] },
        { paramKey: 'af_siteid', keys: ['af_siteid'] },
        { paramKey: 'af_ss_ui', defaultValue: 'true' }
      ],
      afSub2: { keys: ['ttclid'] },
      afSub3: { keys: ['gclid'] }
    }
  };
}

function redirectToOneLink() {
  if (!window.AF_SMART_SCRIPT?.generateOneLinkURL) {
    return;
  }

  const result = window.AF_SMART_SCRIPT.generateOneLinkURL(buildAppsFlyerPayload());

  if (result?.clickURL) {
    if (isMobileDevice()) {
      window.location.replace(result.clickURL);
    } else if (typeof window.AF_SMART_SCRIPT.displayQrCode === 'function') {
      window.AF_SMART_SCRIPT.displayQrCode(QR_CODE_DIV_ID);
    }

    if (typeof window.AF_SMART_SCRIPT.fireImpressionsLink === 'function') {
      window.AF_SMART_SCRIPT.fireImpressionsLink();
    }
  }
}

export default function DownloadW2A() {
  const { marketingConsentGranted } = useContext(GlobalContext);

  useEffect(() => {
    if (!marketingConsentGranted) {
      return undefined;
    }

    if (window.AF_SMART_SCRIPT?.generateOneLinkURL) {
      redirectToOneLink();
      return undefined;
    }

    const script = document.createElement('script');
    script.src = APPS_FLYER_SMART_SCRIPT_SRC;
    script.async = true;
    script.onload = redirectToOneLink;
    monitorThirdPartyScript(script, 'AppsFlyer Smart Script');
    document.head.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [marketingConsentGranted]);

  if (!marketingConsentGranted) {
    return (
      <div
        style={{
          margin: '40px auto',
          maxWidth: '480px',
          textAlign: 'center'
        }}
      >
        <p className='text-style-h-3-medium color-fig-default'>
          App-download attribution is disabled.
        </p>
        <p className='text-style-label-normal color-fig-default'>
          Enable Marketing and attribution in Privacy preferences if you want to continue with this tracked download link.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: '40px auto',
        textAlign: 'center'
      }}
    >
      <p
        className='text-style-h-3-medium color-fig-default'
        style={{
          margin: '0 0 16px',
        }}
      >
        Scan the QR code to continue on your mobile device.
      </p>
      <div
        id={QR_CODE_DIV_ID}
        style={{
          width: '200px',
          height: '200px',
          margin: '0 auto'
        }}
      />
    </div>
  );
}
