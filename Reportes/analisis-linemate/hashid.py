"""Intento de reconstrucción del hash trendId (sha256 de 64 hex).
Known pairs:
  A) trend 00031fb15a64...  : gameId=20261108-DAL-IND, pid=2e67ce26..., market=RUSHING_PLUS_RECEIVING_YARDS,
     line=86.5, outcome=under, home=False, alternate=False, RECENT_FORM window N=10
  B) parlay leg trendId 88e6147e...: gameId=20261108-DAL-IND, pid=40733896... (Daniel Jones),
     market=RUSHING_ATTEMPTS, line=2.5, outcome=over, home=True, alternate=False, book=underdog, N=7
"""
import hashlib, itertools, json

A = dict(id='00031fb15a64b63e3078169fa9e530381b4453c746bcfd41cef4eaa55d3ea8ef',
         gameId='20261108-DAL-IND', pid='2e67ce26-0651-466f-86d5-064956d24118',
         market='RUSHING_PLUS_RECEIVING_YARDS', line='86.5', outcome='under',
         home='false', alt='false', N='10', sport='nfl')
B = dict(id='88e6147e04e9cbfd333863bf85fcaf8f3aa0b961fa1b62529c1e1ab2083d6115',
         gameId='20261108-DAL-IND', pid='40733896-17bf-49e1-a49f-a7510aa557c9',
         market='RUSHING_ATTEMPTS', line='2.5', outcome='over',
         home='true', alt='false', N='7', sport='nfl')

def h(s):
    return hashlib.sha256(s.encode()).hexdigest()

seps = ['|', ':', '/', '-', '_', '', '.', ',']
orders = [
    ['gameId', 'pid', 'market', 'line', 'outcome'],
    ['pid', 'market', 'line', 'outcome'],
    ['gameId', 'pid', 'market', 'line', 'outcome', 'home'],
    ['gameId', 'pid', 'market', 'line', 'outcome', 'N'],
    ['gameId', 'pid', 'market', 'line', 'outcome', 'home', 'alt'],
    ['sport', 'gameId', 'pid', 'market', 'line', 'outcome'],
    ['gameId', 'pid', 'market', 'line', 'outcome', 'N', 'home'],
]
variants = ['line', 'linestr', 'noline']
linemap = {'line': {}, 'linestr': {}, 'noline': {}}
found = []
for case, d in (('A', A), ('B', B)):
    for v in variants:
        for sep in seps:
            for order in orders:
                fields = []
                for k in order:
                    if k == 'line':
                        if v == 'noline':
                            continue
                        fields.append(d['line'] if v == 'linestr' else d['line'])
                    else:
                        fields.append(d[k])
                s = sep.join(fields)
                if h(s) == d['id']:
                    found.append((case, v, sep, order, s))
# JSON serialization candidates
for case, d in (('A', A), ('B', B)):
    for extra in ([], ['home', 'alt', 'N']):
        keys = ['gameId', 'pid', 'market', 'line', 'outcome'] + extra
        obj = {k: d[k] for k in keys}
        for js in (json.dumps(obj), json.dumps(obj, separators=(',', ':'))):
            if h(js) == d['id']:
                found.append((case, 'json', keys, js))
print('found:', found if found else 'NINGUNO de', 2 * len(seps) * len(orders) * 3 + 8, 'candidatos')
