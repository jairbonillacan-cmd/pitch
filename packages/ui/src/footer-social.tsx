import React from "react";

const profiles = [
  ["Instagram", "https://instagram.com/pitchlab.mx", (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </>
  )],
  ["TikTok", "https://tiktok.com/@pitchlabmx", <path d="M14 3v13a4 4 0 1 1-4-4h1M14 3c0 4 2.5 6 6 6" />],
  ["X", "https://x.com/pitchlabmx", <path d="M4 4h4l12 16h-4L4 4Zm16 0-7 8m-2 1-7 7" />],
  ["YouTube", "https://youtube.com/@pitchlabmx", (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" />
    </>
  )],
  ["Facebook", "https://facebook.com/pitchlabmx", <path d="M14 21V10h4l.5-3H14V5.5A2.5 2.5 0 0 1 16.5 3H19M9 10h5" />],
  ["Threads", "https://threads.net/@pitchlab.mx", (
    <path d="M20 8c-1-4-4.5-5-8-5-5 0-8 3-8 9s3 9 8 9c4 0 7-2 7-5s-3-5-7-5c-2 0-3.5 1-3.5 2.5S10 16 12 16c2.5 0 4-2 4-5s-1.5-4-4-4c-1.5 0-2.5.5-3.5 1.5" />
  )],
  ["LinkedIn", "https://linkedin.com/company/pitchlabmx", (
    <path d="M5 10v10m0-16v.2M10 20V10m0 4a4 4 0 0 1 8 0v6" />
  )],
] as const;

export function FooterSocial(): React.JSX.Element {
  return (
    <ul className="footer-social" aria-label="Redes de PitchLab">
      {profiles.map(([name, href, glyph]) => (
        <li key={name}>
          <a href={href} rel="noopener" aria-label={name}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {glyph}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
