"""Validación del motor independiente contra los trends observados en la API."""
import os, collections
from engine import (BASE, load_trends, load_logs, player_trend_records,
                    nfl_stat_fn, classify, window_games, compute_hit_record)

def validate_player_trends():
    trends = load_trends('nfl_trends_player.json', 'nfl_trends_signals.json', 'nfl_trending.json')
    logs = load_logs('api/players')
    res = collections.Counter(); mismatches = []
    for tr in trends:
        for st, N, rec in player_trend_records(tr, logs):
            api_sig = next((s for s in tr.get('signals') or []
                            if s.get('type') == st and (s.get('hitRecord') or {}).get('games') == N), None)
            if not api_sig:
                continue
            hr = api_sig['hitRecord']
            ok = all(hr.get(k) == rec[k] for k in ('games', 'hits', 'pushes', 'misses'))
            avg_ok = abs((hr.get('average') or 0) - rec['average']) < 1e-6
            if ok and avg_ok:
                res['exact_full'] += 1
            elif ok:
                res['exact_counts_avg_diff'] += 1
                mismatches.append((tr['player']['fullName'], tr['market']['name'], st, N,
                                   'average', round(rec['average'], 2), hr.get('average')))
            else:
                res['count_mismatch'] += 1
                mismatches.append((tr['player']['fullName'], tr['market']['name'], st, N,
                                   'counts', (rec['games'], rec['hits'], rec['pushes'], rec['misses']),
                                   (hr.get('games'), hr.get('hits'), hr.get('pushes'), hr.get('misses'))))
    print(f"[PLAYER] señales verificadas: {sum(res.values())}")
    print(f"  exactos (counts+average): {res['exact_full']}")
    print(f"  counts exactos, average divergente: {res['exact_counts_avg_diff']}")
    print(f"  counts divergentes: {res['count_mismatch']}")
    for m in mismatches[:10]:
        print('   diff:', m)

def validate_injury_impact():
    trends = load_trends('nfl_trends_player.json', 'nfl_trends_signals.json', 'nfl_trending.json')
    logs = load_logs('api/players')
    exact = checked = 0
    for tr in trends:
        if not tr.get('player'):
            continue
        g = logs.get(tr['player']['playerId'])
        fn = nfl_stat_fn(tr['market']['name'])
        if not g or fn is None:
            continue
        line, outcome = tr['line'], tr['outcome']
        for sig in tr.get('signals') or []:
            if sig.get('type') != 'INJURY_IMPACT':
                continue
            ir = sig.get('injuryReport') or {}
            tg = logs.get(ir.get('playerId'))
            if not tg:
                continue
            tset = {x['gameID'] for x in tg}
            N = sig['hitRecord']['games']
            w = [x for x in g if x['gameID'] not in tset][:N]
            rec = compute_hit_record(w, fn, line, outcome)
            checked += 1
            hr = sig['hitRecord']
            if all(hr.get(k) == rec[k] for k in ('games', 'hits', 'pushes', 'misses')):
                exact += 1
            else:
                print('  diff:', tr['player']['fullName'], 'sin', ir.get('fullName'),
                      (rec['games'], rec['hits']), (hr.get('games'), hr.get('hits')))
    print(f"[INJURY_IMPACT] {exact}/{checked} exactos")

def validate_team_trends():
    teamtrends = load_trends('nfl_trends_team.json')
    logs = load_logs('api/teams')
    idx = {}
    for code, lg in logs.items():
        for gi in lg:
            off = gi['averageStats']['offensive']
            idx.setdefault(gi['gameID'], {})[gi['currentTeam']] = (
                off['points'], off.get('points1q', 0) + off.get('points2q', 0), off.get('points1q', 0))
    exact = checked = 0
    for tr in teamtrends:
        code, opp = tr['team']['code'], tr['opposingTeam']['code']
        g = logs.get(code.upper())
        if not g:
            continue
        mk = tr['market']['name'].upper(); line = tr['line']; outcome = tr['outcome']
        for sig in tr.get('signals') or []:
            st = sig['type']; hr = sig['hitRecord']; N = hr['games']
            w = window_games(g, st, opp, N)
            c = collections.Counter()
            for gi in w:
                off = gi['averageStats']['offensive']
                if 'MONEY_LINE' in mk:
                    if mk == 'MONEY_LINE':
                        c['hit' if gi['win'] == 1 else 'miss'] += 1
                    else:
                        o = idx.get(gi['gameID'], {}).get(gi['opposingTeam'])
                        if o is None: continue
                        c['hit' if (off['points1q'] + off['points2q']) > o[1] else 'miss'] += 1
                elif 'SPREAD' in mk:
                    sp = (gi.get('odds') or {}).get('spread', 0) or 0
                    deff = gi['averageStats']['defensive']
                    if mk == 'SPREAD_1H':
                        o = idx.get(gi['gameID'], {}).get(gi['opposingTeam'])
                        if o is None: continue
                        c['hit' if ((off['points1q'] + off['points2q']) - o[1] + line) > 0 else 'miss'] += 1
                    else:
                        c['hit' if (off['points'] - deff['points'] + sp) > 0 else 'miss'] += 1
                else:
                    stat = off['points'] if mk == 'TEAM_TOTAL' else (
                        off['points1q'] + off['points2q'] if mk == 'TEAM_TOTAL_1H' else off['points1q'])
                    c[classify(stat, line, outcome)] += 1
            got = {'games': c['hit'] + c['push'] + c['miss'], 'hits': c['hit'],
                   'pushes': c['push'], 'misses': c['miss']}
            checked += 1
            if all(hr.get(k) == got[k] for k in ('games', 'hits', 'pushes', 'misses')):
                exact += 1
            else:
                print('  diff:', code, mk, line, outcome, st, N, got,
                      {k: hr.get(k) for k in ('games', 'hits', 'pushes', 'misses')})
    print(f"[TEAM] {exact}/{checked} exactos")

if __name__ == '__main__':
    validate_player_trends()
    validate_injury_impact()
    validate_team_trends()
