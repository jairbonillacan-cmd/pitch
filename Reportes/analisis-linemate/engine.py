"""Motor independiente de tendencias Linemate (NFL) — reconstrucción observada.

Fórmulas CONFIRMADAS contra la API (ver validate.py):
- Regla de acierto: over => stat > line ; under => stat < line ; empate => push.
  yes => stat >= 1 ; no => stat == 0.
- Ventanas (N lo fija cada trend del API):
  RECENT_FORM   : últimos N partidos del jugador (cualquier sede/rival).
  HOME_SPLIT    : últimos N partidos en casa.
  AWAY_SPLIT    : últimos N partidos fuera.
  HEAD_TO_HEAD  : últimos N partidos contra el rival (por código de equipo).
  INJURY_IMPACT : últimos N partidos en los que el jugador actuó SIN el compañero
                  lesionado (ausencia del compañero en su propio game log).
- average = media del stat sobre la ventana (el API devuelve 0.0 en HEAD_TO_HEAD: bug).
- Team trends: TOTAL (puntos del equipo, full/1H/1Q), MONEY_LINE (win==1),
  SPREAD (margen + closing spread del juego > 0), variantes 1H/1Q con scores por cuarto.
"""
import json, os, collections

BASE = os.path.dirname(os.path.abspath(__file__))

def load_json(rel):
    with open(os.path.join(BASE, rel), encoding='utf-8') as f:
        return json.load(f)

def load_trends(*files):
    out = []
    for f in files:
        t = load_json('api/' + f)
        if isinstance(t, dict):
            for v in t.values():
                if isinstance(v, list):
                    out.extend(x for x in v if isinstance(x, dict))
        elif isinstance(t, list):
            out.extend(x for x in t if isinstance(x, dict))
    return out

# ---------- mapeo mercado -> stat (NFL) ----------
def nfl_stat_fn(market_name):
    n = market_name.upper()
    q1 = n.endswith('_1Q')
    def g(s, k, q1=False):
        if q1:
            k1 = k + '1q'
            return s.get(k1, 0) or 0
        return s.get(k, 0) or 0
    if n.startswith('RUSHING_PLUS_RECEIVING_YARDS'):
        return lambda s: g(s, 'rushingYards') + g(s, 'receivingYards')
    if n.startswith('RUSHING_YARDS'):
        return lambda s: g(s, 'rushingYards', q1)
    if n.startswith('RECEIVING_YARDS'):
        return lambda s: g(s, 'receivingYards', q1)
    if n.startswith('PASSING_YARDS'):
        return lambda s: g(s, 'passingYards', q1)
    if n.startswith('RECEPTIONS'):
        return lambda s: g(s, 'receptions')
    if n.startswith('RUSHING_ATTEMPTS'):
        return lambda s: g(s, 'rushingAttempts')
    if n.startswith('PASSING_ATTEMPTS'):
        return lambda s: g(s, 'passingAttempts')
    if n.startswith('RUSHING_TOUCHDOWNS'):
        return lambda s: g(s, 'rushingTouchdowns', q1)
    if n.startswith('RECEIVING_TOUCHDOWNS'):
        return lambda s: g(s, 'receivingTouchdowns', q1)
    if n.startswith('PASSING_TOUCHDOWNS'):
        return lambda s: g(s, 'passingTouchdowns', q1)
    if n.startswith('ANYTIME_TOUCHDOWN'):
        return lambda s: g(s, 'rushingTouchdowns') + g(s, 'receivingTouchdowns')
    if n.startswith('LONGEST_RECEPTION'):
        return lambda s: g(s, 'longestReception')
    if n.startswith('LONGEST_RUN'):
        return lambda s: g(s, 'longestRun')
    if n.startswith('PASSING_COMPLETIONS'):
        return lambda s: g(s, 'passingCompletions')
    if n.startswith('INTERCEPTIONS'):
        return lambda s: g(s, 'interceptions')
    return None

def classify(stat, line, outcome):
    if outcome == 'over':
        return 'hit' if stat > line else ('push' if stat == line else 'miss')
    if outcome == 'under':
        return 'hit' if stat < line else ('push' if stat == line else 'miss')
    if outcome == 'yes':
        return 'hit' if stat >= 1 else 'miss'
    if outcome == 'no':
        return 'hit' if stat == 0 else 'miss'
    return None

def window_games(games, signal_type, opp_code=None, n=None):
    g = sorted(games, key=lambda x: x['timestamp'], reverse=True)
    if signal_type == 'RECENT_FORM':
        w = g
    elif signal_type == 'HOME_SPLIT':
        w = [x for x in g if x['isHome']]
    elif signal_type == 'AWAY_SPLIT':
        w = [x for x in g if not x['isHome']]
    elif signal_type == 'HEAD_TO_HEAD':
        w = [x for x in g if x['opposingTeam'] == opp_code]
    else:
        w = g
    return w[:n] if n else w

def compute_hit_record(games, stat_fn, line, outcome):
    c = collections.Counter()
    total = 0.0
    for gi in games:
        r = classify(stat_fn(gi['averageStats']), line, outcome)
        if r is None:
            continue
        c[r] += 1
        total += stat_fn(gi['averageStats'])
    games_n = c['hit'] + c['push'] + c['miss']
    return {
        'games': games_n, 'hits': c['hit'], 'pushes': c['push'], 'misses': c['miss'],
        'hitRate': (c['hit'] / games_n * 100) if games_n else 0.0,
        'average': (total / games_n) if games_n else 0.0,
    }

def load_logs(dirpath):
    logs = {}
    for f in os.listdir(os.path.join(BASE, dirpath)):
        try:
            logs[f[:-5]] = load_json(dirpath + '/' + f)
        except Exception:
            pass
    for lg in logs.values():
        if isinstance(lg, list):
            lg.sort(key=lambda x: x['timestamp'], reverse=True)
    return logs

def player_trend_records(tr, player_logs):
    """Devuelve [(signal_type, N, computed_hit_record)] para un trend del API."""
    if not tr.get('player'):
        return []
    g = player_logs.get(tr['player']['playerId'])
    if not g:
        return []
    fn = nfl_stat_fn(tr['market']['name'])
    if fn is None:
        return []
    line, outcome = tr['line'], tr['outcome']
    opp = tr['opposingTeam']['code']
    res = []
    for sig in tr.get('signals') or []:
        st = sig.get('type'); hr = sig.get('hitRecord') or {}
        N = hr.get('games')
        if st not in ('RECENT_FORM', 'HOME_SPLIT', 'AWAY_SPLIT', 'HEAD_TO_HEAD') or not N:
            continue
        w = window_games(g, st, opp, N)
        res.append((st, N, compute_hit_record(w, fn, line, outcome)))
    return res
