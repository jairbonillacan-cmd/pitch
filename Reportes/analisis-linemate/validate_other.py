"""Validación multi-deporte del motor (NBA/EPL/NHL) contra trends del API."""
import os, collections
from engine import BASE, load_json, load_trends, classify, window_games, compute_hit_record

def stat_fn_factory(mkt, sport):
    n = mkt.upper(); q1 = n.endswith('_1Q')
    def g(s, k):
        if q1:
            return s.get(k + '1q', 0) or 0
        return s.get(k, 0) or 0
    def sum_fn(*ks):
        return lambda s: sum(g(s, k) for k in ks)
    NBA = {
        'POINTS': sum_fn('points'), 'REBOUNDS': sum_fn('rebounds'), 'ASSISTS': sum_fn('assists'),
        'STEALS': sum_fn('steals'), 'BLOCKS': sum_fn('blocks'),
        'STEALS_PLUS_BLOCKS': sum_fn('steals', 'blocks'), 'TURNOVERS': sum_fn('turnovers'),
        'THREE_POINTS_MADE': sum_fn('threePointsMade'),
        'POINTS_PLUS_REBOUNDS': sum_fn('points', 'rebounds'),
        'POINTS_PLUS_REBOUNDS_PLUS_ASSISTS': sum_fn('points', 'rebounds', 'assists'),
        'ASSISTS_1Q': sum_fn('assists'),
    }
    NHL = {
        'POINTS': sum_fn('points'), 'SHOTS_ON_GOAL': sum_fn('shotsOnGoal'),
        'GOALS': sum_fn('goals'), 'ASSISTS': sum_fn('assists'),
        'POWERPLAY_POINTS': sum_fn('powerplayPoints'), 'BLOCKED_SHOTS': sum_fn('defensiveBlocks'),
        'GOALS_ALLOWED': sum_fn('goalsAllowed'), 'SAVES': sum_fn('saves'), 'SHUTOUT': sum_fn('shutouts'),
        'ANYTIME_GOAL_SCORER': sum_fn('goals'),
    }
    EPL = {
        'SHOTS': sum_fn('totalShots'), 'SHOTS_ON_TARGET': sum_fn('shotsOnTarget'),
        'TACKLES': sum_fn('totalTackles'), 'GOALS': sum_fn('goals'), 'ASSISTS': sum_fn('assists'),
        'GOAL_OR_ASSIST': sum_fn('goals', 'assists'),
        'CARDS': lambda s: (s.get('yellowCards', 0) or 0) + (s.get('redCards', 0) or 0) + (s.get('yellowRedCards', 0) or 0),
        'CARDS_YELLOW_ONLY': sum_fn('yellowCards'),
    }
    table = {'nba': NBA, 'nhl': NHL, 'epl': EPL}.get(sport, {})
    return table.get(n)

def validate_sport(sport, trends_file, logs_dir):
    trends = load_trends(trends_file)
    logs = {}
    d = os.path.join(BASE, logs_dir)
    if os.path.isdir(d):
        for f in os.listdir(d):
            try:
                logs[f[:-5]] = load_json(logs_dir + '/' + f)
            except Exception:
                pass
        for lg in logs.values():
            if isinstance(lg, list):
                lg.sort(key=lambda x: x['timestamp'], reverse=True)
    res = collections.Counter(); unmapped = collections.Counter(); no_logs = set()
    for tr in trends:
        if not tr.get('player'):
            continue
        fn = stat_fn_factory(tr['market']['name'], sport)
        if fn is None:
            unmapped[tr['market']['name']] += 1
            continue
        g = logs.get(tr['player']['playerId'])
        if not g:
            no_logs.add(tr['player']['fullName'])
            continue
        line, outcome, opp = tr['line'], tr['outcome'], tr['opposingTeam']['code']
        for sig in tr.get('signals') or []:
            st = sig.get('type'); hr = sig.get('hitRecord') or {}; N = hr.get('games')
            if st not in ('RECENT_FORM', 'HOME_SPLIT', 'AWAY_SPLIT', 'HEAD_TO_HEAD') or not N:
                continue
            w = window_games(g, st, opp, N)
            rec = compute_hit_record(w, fn, line, outcome)
            if all(hr.get(k) == rec[k] for k in ('games', 'hits', 'pushes', 'misses')):
                res['exact'] += 1
            else:
                res['diff'] += 1
                if res['diff'] <= 8:
                    print('  diff:', sport, tr['player']['fullName'], tr['market']['name'],
                          line, outcome, st, N, (rec['games'], rec['hits'], rec['pushes'], rec['misses']),
                          (hr.get('games'), hr.get('hits'), hr.get('pushes'), hr.get('misses')))
    print(f"[{sport.upper()}] exact={res['exact']} diff={res['diff']} | mercados sin mapeo: {dict(unmapped)} | sin logs: {no_logs or 'ninguno'}")

if __name__ == '__main__':
    validate_sport('nba', 'nba_trends_player.json', 'api/players_nba')
    validate_sport('nhl', 'nhl_trends_player.json', 'api/players_nhl')
    validate_sport('epl', 'epl_trends_player.json', 'api/players_epl')
