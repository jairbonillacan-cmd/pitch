import json, subprocess, time, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('api/players', exist_ok=True); os.makedirs('api/teams', exist_ok=True); os.makedirs('app', exist_ok=True)
H=['-H','Origin: https://linemate.io','-H','Referer: https://linemate.io/','-H','Accept: application/json','-H','linemate-client-platform: web','-H','linemate-client-locale: en']
def get(url, out):
    if os.path.exists(out) and os.path.getsize(out)>500: return 'cached'
    for attempt in range(3):
        r=subprocess.run(['curl','-s','--max-time','40']+H+[url], capture_output=True)
        if r.stdout and len(r.stdout)>2:
            open(out,'wb').write(r.stdout); return f'{len(r.stdout)}b'
        time.sleep(1.0)
    return 'FAIL'
files=[
 ('/api/nfl/v1/trends/straights?limit=20&preferredProviders=&lineTypes=MAIN&trendTypes=PLAYER','api/nfl_trends_player.json'),
 ('/api/nfl/v1/trends/straights?limit=10&preferredProviders=&lineTypes=MAIN&trendTypes=TEAM','api/nfl_trends_team.json'),
 ('/api/nfl/v1/trends/straights?limit=6&preferredProviders=&signals=INJURY_IMPACT&preview=true','api/nfl_trends_signals.json'),
 ('/api/nfl/v1/trends/parlays?limit=5&preferredProviders=&parlayType=SAME_GAME&lineTypes=MAIN','api/nfl_parlays_sgp.json'),
 ('/api/nfl/v1/trends/parlays?limit=5&preferredProviders=&parlayType=CROSS_GAME&lineTypes=MAIN','api/nfl_parlays_cross.json'),
 ('/api/nfl/v1/trends/straights/trending?preferredProviders=','api/nfl_trending.json'),
 ('/api/nfl/v1/discovery/preview/straights?preferredProviders=&limit=8&groups=SAFE,RISKY','api/nfl_discovery.json'),
 ('/api/nfl/v3/games/current?recordType=REGULAR&format=daily','api/nfl_games_current.json'),
 ('/api/nfl/v3/teams/rankings','api/nfl_rankings_all.json'),
 ('/api/nfl/v3/teams/injuries','api/nfl_injuries_all.json'),
 ('/api/configuration/v3?platform=web','app/config-v3.json'),
 ('/api/nba/v1/trends/straights?limit=15&preferredProviders=&lineTypes=MAIN&trendTypes=PLAYER','api/nba_trends_player.json'),
 ('/api/nba/v1/trends/straights?limit=8&preferredProviders=&lineTypes=MAIN&trendTypes=TEAM','api/nba_trends_team.json'),
 ('/api/epl/v1/trends/straights?limit=15&preferredProviders=&lineTypes=MAIN&trendTypes=PLAYER','api/epl_trends_player.json'),
 ('/api/nhl/v1/trends/straights?limit=15&preferredProviders=&lineTypes=MAIN&trendTypes=PLAYER','api/nhl_trends_player.json'),
 ('/api/nfl/v1/trends/straights/88e6147e04e9cbfd333863bf85fcaf8f3aa0b961fa1b62529c1e1ab2083d6115','api/trend_by_id.json'),
]
print('--- static files ---')
for p,o in files: print(o, get('https://api.linemate.io'+p, o))
players={"2e67ce26-0651-466f-86d5-064956d24118":"Javonte Williams","b0037ad6-d94b-40c6-9041-344a95143525":"Tory Horton","70f67d57-e2d3-4796-94b4-ba216bb87412":"Chuba Hubbard","333f0b66-4c50-4ed6-8f05-c947bd5d50bc":"Troy Franklin","32299f70-4542-4183-8d91-462f751d1d0c":"Kenny Gainwell","7c208b24-4b1d-4c22-9c11-28018e05cb67":"Joe Milton","71180306-0efd-490a-aae1-e889c1655981":"Tyler Allgeier","6a34c0f6-2efd-4b2b-87ba-4d6e9d4fbc4c":"Noah Fant","2e0813e6-a05c-49d8-83b0-1e9fad56dbe9":"Quentin Johnston","106727b5-54b1-4613-8bc8-02d809c19974":"Devin Singletary","a547e3d0-dd0f-4d41-873b-a25f8fb79942":"Van Jefferson","b4056279-1d8b-486d-b844-7aaea523bf2f":"Kenneth Walker","106b5127-f37d-4951-beab-76e852f49400":"Bo Nix","10f5b1c8-4666-46f4-b45c-92f353afcad7":"Keaton Mitchell","1799666c-f8be-452e-8c01-e6f89a78b79f":"Rachaad White","d59ea9f3-c733-4664-bdc3-3b5b3a20eb18":"Bryce Young","40733896-17bf-49e1-a49f-a7510aa557c9":"Daniel Jones","e8b0ecf6-939e-4126-a128-2b299b4b7107":"Austin Hooper","a1ef2613-58e4-4e75-a20a-5fdb2927ad14":"Oronde Gadsden","757eb667-2828-4868-b2a9-1d98ba4c9898":"Christian McCaffrey","e9495cac-1709-48e2-a634-a176397d7cd2":"Jaxon Smith-Njigba","b28a5872-0ebe-44e5-a0f8-32db7d62041e":"Mike Washington","ce34ea3a-ea56-4183-8088-cadf5edf883e":"Ashton Jeanty","f832325b-852c-4969-a70e-8df81cc48fa5":"Bijan Robinson","f6c4744c-d355-473c-9225-20903eba5528":"Joe Burrow","f0796eef-159f-4f91-b7a0-441b2021a005":"Ja'Marr Chase","d8d949e5-1c6e-401f-adc7-6e70d10f13b4":"Riley Leonard","95e82f16-74a0-4e2c-807c-4bac4985d93f":"Alec Pierce","bd312b07-3111-4b9e-ba1c-e6b75db37330":"Jack Strand","591af8b6-b1b8-45e3-9122-6dcf5caade2e":"Jonathon Brooks","d49ff541-3921-4d22-b79e-6fb20acf5933":"Xavier Legette","44fb5d2a-bada-4aee-b95d-70a8329d0f7f":"Trey Lance","135327c3-9d81-486c-9cba-8141f9769641":"Alec Ingold","7a41fb17-b769-49d5-8b7d-d0c7d74981f6":"David Njoku","b242df5e-1162-4773-8806-d3374b66ae2f":"Brenen Thompson","07cbdc00-4ee8-4d47-9ad4-bd9771ddac12":"Jake Tonges","bed7abca-d9ff-420c-b10f-9d2d5eff5a8f":"Deebo Samuel"}
json.dump(players, open('api/players_index.json','w'))
print('--- players ---')
bad=[]
for pid,name in players.items():
    r=get(f'https://api.linemate.io/api/nfl/v4/players/{pid}/games?sortingOrder=DESC&timeframe=RANGE_2024_2026', f'api/players/{pid}.json')
    if r=='FAIL': bad.append(name)
print('players done, fails:', bad)
try:
    rank=json.load(open('api/nfl_rankings_all.json'))
except Exception:
    rank=[]
print('--- teams ---')
for t in rank:
    get(f"https://api.linemate.io/api/nfl/v4/teams/{t['teamId']}/games?sortingOrder=DESC&timeframe=RANGE_2024_2026", f"api/teams/{t['code']}.json")
print('teams done:', len(os.listdir('api/teams')))
print('--- bundle ---')
print(get('https://linemate.io/static/js/main.1f0201a8.js','app/main.1f0201a8.js'))
