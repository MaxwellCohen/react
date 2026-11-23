# python3 analyze-final.py <metrics dir>  -> markdown tables (off vs on)
import json, sys, statistics
d = sys.argv[1]
R = json.load(open(d + '/scenarios.json'))['rows']
pages = sorted({r['scenario'] for r in R})
g = lambda p, v: next(r for r in R if r['scenario'] == p and r['variant'] == v)
NEW = {'client-aschild-slot', 'client-children-inspect', 'client-suspends-in-ssr', 'tiny-stubs-many'}
K = ['gzip', 'html', 'flight', 'brotli']
f = lambda n: f'{n:,}'
def table(ps, title):
    print(f'\n## {title} ({len(ps)} pages)\n')
    print('| build | gzip | raw HTML | inlined Flight | brotli |\n|---|---|---|---|---|')
    o = [sum(g(p, 'off')[k] for p in ps) for k in K]
    a = [sum(g(p, 'all')[k] for p in ps) for k in K]
    print('| off | ' + ' | '.join(map(f, o)) + ' |')
    print('| on | ' + ' | '.join(f'{f(x)} ({100*(x/y-1):+.1f}%)' for x, y in zip(a, o)) + ' |')
    print(f'\nstubs: {f(sum(g(p, "all")["stubs"] for p in ps))}')
    big = [(p, g(p, 'all')['gzip'] - g(p, 'off')['gzip']) for p in ps if g(p, 'all')['gzip'] > g(p, 'off')['gzip']]
    print('pages larger than off (gzip): ' + (', '.join(f'{p} (+{x} B; off {g(p,"off")["gzip"]})' for p, x in big) or 'none'))
    sav = {p: g(p, 'off')['gzip'] - g(p, 'all')['gzip'] for p in ps}
    pct = [100 * sav[p] / g(p, 'off')['gzip'] for p in ps]
    print(f'median page gzip saving: {statistics.median(pct):.1f}% ({statistics.median(sav.values()):,.0f} B)')
    tot = sum(sav.values())
    top = sorted(ps, key=lambda p: -sav[p])[:5]
    print('\n| top-5 gzip saving | saved B | share |\n|---|---|---|')
    for p in top: print(f'| {p} | {f(sav[p])} | {100*sav[p]/tot:.1f}% |')
    print(f'| top 5 together | {f(sum(sav[p] for p in top))} | {100*sum(sav[p] for p in top)/tot:.1f}% |')
table([p for p in pages if p not in NEW], 'Totals, original')
table(pages, 'Totals, all')
