"""Reproducción de parlays v2: cada señal exige que CADA leg cumpla X de N en su
propia ventana (RECENT_FORM / HEAD_TO_HEAD / SPLITS según sede del leg)."""
import re, collections
from engine import BASE, load_trends, load_logs, nfl_stat_fn, classify, window_games

parlays = load_trends('nfl_parlays_sgp.json')
plogs = load_logs('api/players')

def leg_spec(leg):
    if not leg.get('player'):
        return None
    g = plogs.get(leg['player']['playerId'])
    fn = nfl_stat_fn(leg['market']['name'])
    if not g or fn is None:
        return None
    return (g, fn, leg['line'], leg['outcome'], leg['opposingTeam']['code'],
            leg['home'])

checked = exact = 0
for pr in parlays:
    specs = [s for s in (leg_spec(l) for l in (pr.get('legs') or [])) if s]
    if not specs or len(specs) < len(pr.get('legs') or []):
        print('SKIP (logs faltantes):', pr['gameId'])
        continue
    for sig in pr.get('signals') or []:
        desc = sig.get('description') or ''
        m = (re.search(r'at least (\d+) of last (\d+)', desc)
             or re.search(r'[Hh]it in (\d+) of last (\d+)', desc))
        if not m:
            continue
        target, N = int(m.group(1)), int(m.group(2))
        st = sig.get('type')
        rates = []
        for (g, fn, line, outcome, opp, home) in specs:
            if st == 'RECENT_FORM':
                w = window_games(g, 'RECENT_FORM', None, N)
            elif st == 'HEAD_TO_HEAD':
                w = window_games(g, 'HEAD_TO_HEAD', opp, N)
            elif st == 'SPLITS':
                w = window_games(g, 'HOME_SPLIT' if home else 'AWAY_SPLIT', None, N)
            else:
                w = []
            hits = sum(1 for gi in w if classify(fn(gi['averageStats']), line, outcome) == 'hit')
            rates.append((hits, len(w)))
        all_ok = all(h >= target for h, n in rates)
        minrate = min(h / n * 100 for h, n in rates if n) if all(n for _, n in rates) else None
        ann = sig.get('annotation')
        ann_ok = (minrate is not None and ann and abs(minrate - float(ann[:-1])) < 1.5)
        checked += 1
        ok = all_ok and (ann_ok if ann else True)
        if ok:
            exact += 1
        print(('OK  ' if ok else 'DIFF'), pr['gameId'], st, f'>={target}/{N}',
              'legs:', rates, f'api={ann}', '|', desc[:52])
print(f'[PARLAY v2] {exact}/{checked} consistentes')
