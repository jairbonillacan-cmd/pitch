import React from 'react';

import './fonts.css';
import './generic.css';
import HtmlHeaders from './html-headers';

const countries = {
  "United States": {
    "National Problem Gambling Helpline": "1-800-522-4700",
    "Pennsylvania, West Virginia & New Jersey": "1-800-GAMBLER (426-2537)"
  },
  "Canada": {
    "Alberta Problem Gambling Resources Network":"1-866-461-1259",
    "British Columbia Problem Gambling Help Line":"1-888-795-6111",
    "Quebec Gambling: Help and Referral":"1-800-461-0140",
    "Manitoba Addictions Help Line – Problem Gambling":"1-800-463-1554",
    "Newfoundland Problem Gambling Help Line":"1-888-899-4357",
    "New Brunswick Gambling Information Line":"1-800-461-1234",
    "Northwest Territories General Help Line":"1-800-661-0844",
    "Nova Scotia Problem Gambling Help Line":"1-888-347-8888",
    "Nunavut Kamatsiaqtut Help Line":"1-800-265-3333",
    "Ontario ConnexOntario Help Line":"1-866-531-2600",
    "Prince Edward Island Problem Gambling Help Line":"1-855-255-4255",
    "Saskatchewan Problem Gambling Helpline":"1-800-306-6789",
    "Yukon Mental Wellness and Substance Use Services":"1-866-456-3838"
  }
};

const websites = {
  "Responsible Gambling": {
    url: "https://www.responsiblegambling.org",
    description: "Is an independent non-profit organization dedicated to problem gambling prevention."
  },
  "Gamblers Anonymous": {
    url: "https://www.gamblersanonymous.org",
    description: "Is fellowship of men and women who share their experience, strength and hope with each other that they may solve their common problem and help others to recover from a gambling problem."
  },
  "Gam-Anon": {
    url: "https://www.gam-anon.org",
    description: "Is a self-help organization for the spouse, family or close friends of compulsive gamblers."
  },
  "GamTalk": {
    url: "https://www.gamtalk.org",
    description: "Is a 24/7 moderated online peer support forum."
  }
};

class ResponsibleGamblingPage extends React.Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    document.title = 'Responsible Gambling - Linemate';
  }

  render() {
    return(
      <div class="content-container">
        <HtmlHeaders canonicalRef="https://www.linemate.io/responsible-gambling"/>
        <div class="text-style-h-1-medium color-fig-default">Responsible Gambling &amp; Disclaimers</div>
        <div class="text-style-h-3-medium color-fig-subtle" style={{marginTop: '12px'}}>Last updated: July 29, 2021</div>
        <div class="text-style-h-5-medium color-fig-default" style={{marginTop: '24px', marginBottom: '16px'}}>
          All information found on our website is for entertainment and research purposes only.
          You must be 21+ in the United States and 18+ in Canada to place a bet at any third party website link available on our site. 
          Linemate is not a sportsbook, nor does it not offer any wagers or paid contests. 
          The information displayed on our website does not constitute any recommendation, suggestion or counseling on which you may rely, specifically in the context of sports betting. 
          We do not warrant the accuracy, completeness, or usefulness of our information. 
          Any reliance you place on our information is at your own risk. 
          We disclaim all liability and responsibility arising from any reliance placed on our website’s content by you or any other visitor to the Website, or by anyone who may be informed of any of its contents. 
          <br/><br/>
          If you or someone you know is seeking help due to a gambling problem, here are state/province specific helplines you can call and websites you can visit:
        </div>
        {
          Object.keys(countries).map((country) => 
            <>
              <div class="text-style-h-3-medium color-fig-default" style={{marginBottom: '12px'}}>{country}</div>
              <ul class="text-style-h-6-medium color-fig-default">
                {
                  Object.keys(countries[country]).map((territory) =>
                    <li>
                      {territory}
                      <ul>
                        <li>{countries[country][territory]}</li>
                      </ul>
                    </li>
                  )
                }
              </ul>
            </>
          )
        }
        <div class="text-style-h-3-medium color-fig-default" style={{marginTop: '24px'}}>Websites</div>
        <ul style={{marginBottom: '80px', color: "var(--color-fig-default)"}}>
          {
            Object.keys(websites).map((website) =>
              <li>
                <a class="text-style-h-6-medium" style={{color: "var(--color-fig-positive)"}} href={websites[website].url}>{website}</a>
                <ul>
                  <li class="text-style-h-6-medium color-fig-default">{websites[website].description}</li>
                </ul>
              </li>
            )
          }
        </ul>
      </div>
    );
  }
}

export default ResponsibleGamblingPage;
