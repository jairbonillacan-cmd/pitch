"""Verificación de OPPONENT_RANK con positionalStats (defensa vs posición)."""
import json, collections
from engine import BASE, load_trends

rank = json.load(open(BASE + '/api/nfl_rankings_all.json'))
trends = load_trends('nfl_trends_player.json', 'nfl_trends_signals.json', 'nfl_trending.json')

# métrica defensiva por mercado (del registro client-side del bundle)
MKT = {
    'RUSHING_ATTEMPTS': ['rushingAttempts'], 'RUSHING_YARDS': ['rushingYards'],
    'RECEPTIONS': ['receptions'], 'RECEIVING_YARDS': ['receivingYards'],
    'PASSING_ATTEMPTS': ['passingAttempts'], 'PASSING_YARDS': ['passingYards'],
    'PASSING_COMPLETIONS': ['passingCompletions'],
    'RUSHING_PLUS_RECEIVING_YARDS': ['rushingYards', 'receivingYards'],
    'ANYTIME_TOUCHDOWN': ['totalTouchdowns'],
    'RECEIVING_TOUCHDOWNS': ['receivingTouchdowns'], 'RUSHING_TOUCHDOWNS': ['rushingTouchdowns'],
}
POS_FOR = {'RUSHING_ATTEMPTS': 'RB', 'RUSHING_YARDS': 'RB', 'RECEPTIONS': 'TE',
           'RECEIVING_YARDS': 'TE', 'PASSING_ATTEMPTS': 'QB', 'PASSING_YARDS': 'QB',
           'PASSING_COMPLETIONS': 'QB', 'ANYTIME_TOUCHDOWN': 'RB'}

def get_def(t, code_metric, pos):
    """valor defensivo del equipo t para la métrica; usa positionalStats de la posición."""
    m = code_metric[0]
    if pos:
        v = t['positionalStats'].get(pos, {}).get('average', {}).get('defensive', {}).get(m)
        if v is not None:
            return v
    return t['averageStats']['defensive'].get(m)

def rank_of(code, metric, pos, order='asc'):
    vals = []
    for t in rank:
        v = get_def(t, [metric], pos)
        if v is None:
            continue
        vals.append((v, t['code']))
    vals.sort(key=lambda x: x[0], reverse=(order == 'desc'))
    codes = [c for _, c in vals]
    if code not in codes:
        return None
    return codes.index(code) + 1

def suffix(r):
    if r % 100 in (11, 12, 13):
        return 'th'
    return {1: 'st', 2: 'nd', 3: 'rd'}.get(r % 10, 'th')

ok = bad = 0
for tr in trends:
    if not tr.get('player'):
        continue
    opp = (tr.get('opposingTeam') or {}).get('code')
    pos = (tr.get('player') or {}).get('position')
    mkt = tr['market']['name'].upper()
    for sig in tr.get('signals') or []:
        if sig.get('type') != 'OPPONENT_RANK':
            continue
        ann = sig.get('rankDescription')
        if not ann:
            continue
        metrics = MKT.get(mkt)
        if not metrics:
            continue
        pos_try = [POS_FOR.get(mkt), pos, None]
        matched = None
        for p in pos_try:
            if not p and p is not None:
                continue
            for m in metrics:
                for order in ('asc', 'desc'):
                    r = rank_of(opp, m, p, order)
                    if r and f'{r}{suffix(r)}' == ann:
                        matched = (p, m, order, r)
                        break
                if matched: break
            if matched: break
        if matched:
            ok += 1
        else:
            bad += 1
            if bad <= 12:
                print('no-match:', opp, pos, mkt, 'API', ann)
print(f'OPPONENT_RANK positional: {ok} ok, {bad} sin match')
