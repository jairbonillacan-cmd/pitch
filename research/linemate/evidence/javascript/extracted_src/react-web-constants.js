export const API_HOST = process.env.REACT_APP_API_HOST || 'https://api.linemate.io';
export const LOGOS_ASSETS_BASE = 'assets/logos';
// Keep the legacy code-keyed logo tree above for external consumers. New web
// call sites resolve team marks from the ID-keyed, sport-based tree instead.
export const TEAM_LOGOS_ASSETS_BASE = 'assets/team-logos';

export const IOS_DOWNLOAD_URL = "https://apps.apple.com/us/app/linemate/id1635246793";
export const ANDROID_DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=com.linemate";
export const IOS_SUBSCRIPTION_MANAGEMENT_URL = "https://apps.apple.com/account/subscriptions";
export const ANDROID_SUBSCRIPTION_MANAGEMENT_URL = "https://play.google.com/store/account/subscriptions?package=com.linemate";
export const IOS_SUBSCRIPTION_MANAGEMENT_DEEP_LINK = "itms-apps://apps.apple.com/account/subscriptions";
export const ANDROID_SUBSCRIPTION_MANAGEMENT_INTENT_URL = "intent://play.google.com/store/account/subscriptions?package=com.linemate#Intent;scheme=https;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Faccount%2Fsubscriptions%3Fpackage%3Dcom.linemate;end";

export const DOWNLOAD_URLS = {
    ios: {
        default: IOS_DOWNLOAD_URL,
        'twitter-default': "https://apps.apple.com/app/apple-store/id1635246793?pt=125237472&ct=twitter-default&mt=8"
    },
    android: {
        default: ANDROID_DOWNLOAD_URL,
        'twitter-default': "https://play.google.com/store/apps/details?id=com.linemate&referrer=utm_source%3Dtwitter-default"
    }
}

export const TREND_ASSET_MAPPING = {
    HEAD_TO_HEAD: "head-to-head",
    RECENT_FORM: "form",
    AWAY_SPLIT: "away",
    HOME_SPLIT: "home",
    OPPONENT: "opponent-rank",
    INJURY_IMPACT: "injury",
    STARTER: "starting"
};

export const RESPONSIVE_BAR_THEME = {
    "grid": {
        "line": {
            "stroke": "var(--color-border-default)",
            "strokeWidth": 1
        }
    },
    "axis": {
        "ticks": {
            "line": {
                "strokeWidth": 0
            },
            "text": {
                "fontSize": 12,
                "fontFamily": "Inter",
                "fill": "var(--color-fig-subtle)"
            }
        }
    },
    "legends": {
        "text": {
            "fontSize": 12,
            "fontFamily": "Inter",
            "fill": "var(--color-fig-default)"
        }
    },
    "tooltip": {
        "wrapper": {},
        "container": {
            "background": "var(--color-surface-base)",
            "color": "var(--color-fig-subtle)",
            "fontSize": 12,
            "fontFamily": "Inter"
        },
        "basic": {},
        "chip": {},
        "table": {},
        "tableCell": {},
        "tableCellValue": {}
    }
}

// Need to statically define this here because we can't really iterate through the server assets directory 
//  to check what options we have so we need to know in advance
export const CHEATSHEET_STYLES = {
    "01": [
        "01",
        "03",
        "02",
        "05",
        "04",
        "05",
        "06",
        "07",
        "08"
    ],
    "50": [
        "01",
        "03",
        "02"
    ],
    "03": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "04": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "32": [
        "01",
        "03",
        "02"
    ],
    "35": [
        "01",
        "03",
        "02"
    ],
    "51": [
        "01",
        "02",
        "05"
    ],
    "34": [
        "01",
        "03",
        "02"
    ],
    "33": [
        "01",
        "02",
        "05"
    ],
    "05": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "02": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "20": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "18": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "11": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "29": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "16": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "42": [
        "01",
        "02",
        "05"
    ],
    "45": [
        "01",
        "02",
        "05"
    ],
    "28": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "17": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "10": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "19": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "26": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "21": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "44": [
        "01",
        "02",
        "05"
    ],
    "43": [
        "01",
        "03",
        "02"
    ],
    "07": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "38": [
        "01",
        "02",
        "05"
    ],
    "36": [
        "01",
        "03",
        "02"
    ],
    "09": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "31": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "30": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "37": [
        "01",
        "02",
        "05"
    ],
    "08": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "06": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "39": [
        "01",
        "03",
        "02"
    ],
    "46": [
        "01",
        "03",
        "02"
    ],
    "41": [
        "01",
        "03",
        "02"
    ],
    "48": [
        "01",
        "02",
        "05"
    ],
    "24": [
        "01",
        "03",
        "02",
        "04",
        "05",
    ],
    "24-betsfromdownunder": [
        "01",
        "03",
        "02",
        "04",
        "05",
    ],
    "23": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "15": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "12": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "49": [
        "01",
        "03",
        "02"
    ],
    "40": [
        "01",
        "02",
        "05"
    ],
    "47": [
        "01",
        "03",
        "02"
    ],
    "13": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "14": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "22": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "22-parlaytrends": [
        "01",
        "02",
        "03"
    ],
    "25": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "27": [
        "01",
        "03",
        "02",
        "05",
        "04"
    ],
    "52-1": [
        "01"
    ],
    "52-2": [
        "01"
    ],
    "52-3": [
        "01"
    ],
    "53-1": [
        "01"
    ],
    "53-2": [
        "01"
    ],
    "53-3": [
        "01"
    ],
    "note": [
        "01"
    ],
    "book": [
        "01"
    ],
    "board": [
        "01"
    ]
}
