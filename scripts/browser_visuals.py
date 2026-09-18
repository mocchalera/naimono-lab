"""Additional visual UI tests. Jev and storage are explicit mocks, not live AI.
Uses the same model fixtures as browser_smoke.py without executing that script.
"""
from pathlib import Path
import ast
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'
OUT.mkdir(exist_ok=True)
HTML=(ROOT/'dist/naimono.html').read_text()
TREE=ast.parse((ROOT/'scripts/browser_smoke.py').read_text())
def literal(name):
    for node in ast.walk(TREE):
        if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in node.targets):
            return ast.literal_eval(node.value)
    raise RuntimeError('Missing fixture '+name)
LIVE_SETUP=literal('live_setup')
STORAGE_SETUP=literal('storage_setup')
LIVE_HTML=HTML.replace('globalThis.NAIMONO_STANDALONE = true;','globalThis.NAIMONO_STANDALONE = false;')
checks=[]
errors=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
    print('PASS',name,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    def page_for(width=1360,seed=None,stopped=False):
        page=browser.new_page(viewport={'width':width,'height':980})
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.evaluate(f'() => {{ ({LIVE_SETUP})(); ({STORAGE_SETUP})(); }}')
        # Count the single native observer and its observed targets, without replacing behavior.
        page.evaluate('''() => {
          const Native=window.IntersectionObserver;
          window.visualObservers=[];
          window.IntersectionObserver=class extends Native {
            constructor(...args){super(...args);this.targets=new Set();window.visualObservers.push(this);}
            observe(el){this.targets.add(el);return super.observe(el);}
            unobserve(el){this.targets.delete(el);return super.unobserve(el);}
            disconnect(){this.targets.clear();return super.disconnect();}
          };
        }''')
        if seed is not None: page.evaluate('(seed)=>localStorage.setItem("naimono.collection.v1",JSON.stringify(seed))',seed)
        if stopped: page.evaluate('localStorage.setItem("naimono.stopMotion","true")')
        page.set_content(LIVE_HTML,wait_until='load')
        expect(page.locator('#start-button')).to_be_enabled()
        return page
    def start(page):
        page.locator('input[name="time"][value="0"]').check(force=True)
        page.locator('#start-button').click()
    def answer(page,word='もにゅらっぴ',extra=None):
        page.evaluate('(extra)=>{window.mockExtra=extra||{}}',extra or {})
        page.locator('#word-input').fill(word)
        page.locator('#submit-button').click()
        expect(page.locator('#verdict-stage')).to_be_visible()
    def geometry(svg):
        return svg.locator('.nm-life > g').inner_html()
    def animation(svg):
        return svg.locator('.nm-life').evaluate('(el)=>getComputedStyle(el).animationName')
    hint={'shape':'blob','material':'mochi','expression':'sleepy','detail':'antenna'}
    for width in [320,390,1360]:
        page=page_for(width)
        check(f'Motion control fits home at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        start(page)
        answer(page,extra={'visual':hint})
        svg=page.locator('#verdict-stage .nm-visual')
        expect(svg).to_be_visible()
        check(f'Safe result has a word-specific accessible SVG at {width}px',svg.get_attribute('role')=='button' and svg.get_attribute('tabindex')=='0')
        check(f'Safe circle is above the illustration at {width}px',page.locator('.outcome-badge').bounding_box()['y']<svg.bounding_box()['y'])
        check(f'Illustration does not overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check(f'Actual Jev art attribution is shown at {width}px','Jevの語感スケッチ' in page.locator('.referee-bubble').inner_text())
        if width==390:
            page.screenshot(path=str(OUT/'word-visuals-discovery-mobile.png'),full_page=True,animations='disabled')
        original=geometry(svg)
        page.locator('[data-verdict="next"]').click()
        saved=page.evaluate('JSON.parse(localStorage.getItem("naimono.collection.v1"))[0]')
        check(f'Complete recipe is saved without changing classification at {width}px',saved['visual']['origin']=='jev' and saved['category']=='animal' and saved['source']=='jev')
        page.locator('#gallery-button').click()
        gallery=page.locator('.discovery-card .nm-visual')
        check(f'Gallery retains the discovery geometry at {width}px',geometry(gallery)==original)
        calls=page.evaluate('window.mockCalls.length')
        page.locator('#gallery-dialog [data-close]').click()
        page.locator('#gallery-button').click()
        check(f'Reopening the gallery has no extra model calls at {width}px',page.evaluate('window.mockCalls.length')==calls)
        page.set_content(LIVE_HTML,wait_until='load')
        page.locator('#gallery-button').click()
        check(f'Reloading keeps the exact saved geometry at {width}px',geometry(page.locator('.discovery-card .nm-visual'))==original)
        page.close()

    page=page_for(1360)
    start(page);answer(page,extra={'visual':hint})
    svg=page.locator('#verdict-stage .nm-visual')
    svg.scroll_into_view_if_needed();page.wait_for_timeout(100)
    check('A visible sketch has an active idle animation',animation(svg)!='none')
    svg.focus();page.keyboard.press('Enter')
    check('Enter triggers a one-shot reaction','nm-reacting' in svg.get_attribute('class'))
    page.wait_for_timeout(500)
    check('The one-shot reaction is cleaned up','nm-reacting' not in svg.get_attribute('class'))
    svg.focus();page.keyboard.press('Space')
    check('Space also triggers a reaction','nm-reacting' in svg.get_attribute('class'))
    page.locator('#motion-button').click()
    check('Manual stop disables idle and reactive animation',animation(svg)=='none')
    svg.click()
    check('Tapping a stopped sketch does not restart it','nm-reacting' not in svg.get_attribute('class') and animation(svg)=='none')
    page.locator('#motion-button').click()
    check('Manual resume restores the same sketch animation',animation(svg)!='none')
    page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(60);svg.click()
    check('Reduced motion disables animation and tap motion',animation(svg)=='none' and 'nm-reacting' not in svg.get_attribute('class'))
    page.emulate_media(reduced_motion='no-preference')
    for _ in range(5):
        page.locator('[data-verdict="appeal"]').click()
        page.locator('[data-verdict="safe"]').click()
    check('Redraws reuse one observer and retain no detached SVGs',page.evaluate('visualObservers.length===1 && [...visualObservers[0].targets].every(el=>el.isConnected)'))
    check('Manual correction stays manual in the actual verdict','みんなで' in page.locator('.verdict-message').inner_text())
    page.locator('[data-verdict="next"]').click()
    saved=page.evaluate('JSON.parse(localStorage.getItem("naimono.collection.v1"))[0]')
    check('Manual correction does not get saved as a helper verdict',saved['source']=='manual' and saved['decisionBy']=='manual')
    check('Manual sketch is attributed to local imagination',saved['visual']['origin']=='local-rule')
    page.close()

    page=page_for(stopped=True)
    start(page);answer(page,extra={'visual':hint})
    svg=page.locator('#verdict-stage .nm-visual')
    check('A stored stop preference is respected for new sketches',animation(svg)=='none')
    page.locator('#motion-button').click()
    check('A sketch created while stopped can resume without rerendering',animation(svg)!='none')
    page.close()

    names=['もにゅらっぴ','ごるだむ','ぴりきゅる','ぬるぉーん','ふわるね','かぽねった','りょりら','ぽむぴっこ']
    seed=[{'word':n,'reading':'','source':'jev','avatar':'green','date':'2026-09-18','category':None,'flavor':None} for n in names]
    seed[0]['visual']={'version':'future','word':'wrong','shape':'<script>'}
    page=page_for(seed=seed)
    before=page.evaluate('localStorage.getItem("naimono.collection.v1")')
    page.locator('#gallery-button').click()
    expect(page.locator('.discovery-card')).to_have_count(8)
    check('Old and malformed recipes all render without losing entries',page.locator('.discovery-card .nm-visual').count()==8)
    check('Old art is not misattributed to Jev',all(t=='語感からの仮スケッチ' for t in page.locator('.visual-origin-note').all_inner_texts()))
    check('Local drawing does not invent AI classification',page.locator('.discovery-card .category-badge').count()==0)
    check('Opening an old gallery does not rewrite its original data',page.evaluate('localStorage.getItem("naimono.collection.v1")')==before)
    families=page.locator('.discovery-card .nm-life').evaluate_all('(els)=>els.map(el=>[...el.classList].find(c=>c.startsWith("nm-shape-")))')
    check('Eight different outline families appear in the gallery',len(set(families))==8)
    page.screenshot(path=str(OUT/'word-visuals-gallery.png'),full_page=True,animations='disabled')
    page.locator('#gallery-dialog').evaluate('(el)=>{el.style.maxHeight="330px";el.scrollTop=0}')
    page.wait_for_timeout(150)
    check('Offscreen gallery illustrations are paused',page.locator('#gallery-dialog .nm-visual.nm-paused').count()>0)
    page.locator('#gallery-dialog [data-close]').click();page.wait_for_timeout(50)
    check('Closed gallery illustrations are all paused',page.locator('#gallery-dialog .nm-visual:not(.nm-paused)').count()==0)
    page.close()

    for has_helper_visual in [False,True]:
        page=page_for();start(page)
        extra={'decisionBy':'assistant','visual':hint,'fallback':{'state':'completed','answer':({'visual':{'shape':'ribbon'}} if has_helper_visual else {})}}
        answer(page,extra=extra)
        expected='助っ人の想像' if has_helper_visual else 'Jevの語感スケッチ'
        check(f'Helper art attribution follows actual supplied hints: {has_helper_visual}',expected in page.locator('.referee-bubble').inner_text())
        page.close()
    check('No uncaught visual UI errors',not errors)
    (OUT/'browser-visuals-report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'notes':['AI and Storage use explicit fixtures.','No live model latency or Japanese accuracy is claimed.']},ensure_ascii=False,indent=2))
    browser.close()
print(f'{len(checks)} visual checks passed.',flush=True)
