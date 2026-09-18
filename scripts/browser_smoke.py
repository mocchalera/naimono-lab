"""Offline artifact UI tests. Requires Python Playwright + an installed Chromium.
No public deployment or browser localhost access is required. Jev and microphone
branches use explicit mocks; this script does not verify live credentials/ASR.
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'dist/naimono.html').read_text()
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
checks = []
errors = []

def check(name, condition=True):
    assert condition, name
    checks.append(name)
    print('PASS', name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])

    def new_page(width=1360, height=980, html=HTML, setup=None):
        page = browser.new_page(viewport={'width':width,'height':height})
        page.on('pageerror',lambda error: errors.append(str(error)))
        if setup: page.evaluate(setup)
        page.set_content(html,wait_until='load')
        expect(page.locator('#start-button')).to_be_enabled()
        return page

    def start(page, shiri=False, unlimited=True):
        if shiri: page.locator('input[name="mode"][value="shiritori"]').check(force=True)
        if unlimited: page.locator('input[name="time"][value="0"]').check(force=True)
        page.locator('#start-button').click()

    def answer(page, word):
        page.locator('#word-input').fill(word)
        page.locator('#submit-button').click()
        expect(page.locator('#verdict-stage')).to_be_visible()

    def accept_unknown(page):
        page.locator('[data-verdict="safe"]').click()
        page.locator('[data-verdict="next"]').click()

    page = new_page()
    requests = []
    page.on('request',lambda req: requests.append(req.url))
    page.screenshot(path=str(OUT/'home-desktop.png'),full_page=True,animations='disabled')
    check('Standalone mode clearly says Jev is not connected', 'Jev未接続' in page.locator('#judge-label').inner_text())
    start(page)
    page.screenshot(path=str(OUT/'game-desktop.png'),full_page=True,animations='disabled')
    answer(page,'もにゅらっぴ')
    check('Unknown demo words require a family decision', page.locator('[data-verdict="safe"]').count()==1)
    page.locator('[data-verdict="safe"]').click()
    page.screenshot(path=str(OUT/'safe-desktop.png'),full_page=True,animations='disabled')
    page.locator('[data-verdict="next"]').click()
    check('Safe result passes turn and records one discovery',page.locator('#turn-title').inner_text()=='ももさんの ばん！' and page.locator('#collection-count').inner_text()=='01')
    answer(page,'りんご')
    check('Known dictionary words show an explanation','くだもの' in page.locator('.meaning-box').inner_text())
    page.locator('[data-verdict="next"]').click()
    check('Two-player round ends with the correct winner',page.locator('#finish-title').inner_text()=='あおさん、ナイモノ名人！')
    page.screenshot(path=str(OUT/'finish-desktop.png'),full_page=True,animations='disabled')
    check('Offline gameplay makes no network requests',not requests)
    page.close()

    page = new_page()
    start(page,shiri=True)
    answer(page,'もにゅらっぴ'); accept_unknown(page)
    check('Shiritori carries the actual final kana',page.locator('.required-kana').inner_text()=='ぴ')
    answer(page,'ぐにょも')
    check('Wrong first kana is a rule loss, not an AI result','「ぴ」' in page.locator('.verdict-message').inner_text())
    page.locator('[data-verdict="edit"]').click()
    answer(page,'ぴょこなも'); accept_unknown(page)
    check('Correction preserves the turn and moves to the next required kana',page.locator('.required-kana').inner_text()=='も')
    answer(page,'もにゅらっぴ')
    check('Repeated word is rejected','もう出た' in page.locator('.verdict-title').inner_text())
    page.close()

    page = new_page()
    start(page,shiri=True)
    answer(page,'もちゃぺろん')
    check('Final n really loses in shiritori','「ん」で' in page.locator('.verdict-title').inner_text())
    page.close()

    page = new_page()
    start(page,shiri=True)
    page.locator('#word-input').fill('空想生物')
    page.locator('#submit-button').click()
    check('Kanji asks for a reading without eliminating anyone',page.locator('#reading-wrap').is_visible() and page.locator('#form-error').is_visible() and not page.locator('#verdict-stage').is_visible())
    page.locator('#reading-input').fill('くうそうせいぶつ')
    page.locator('#submit-button').click(); expect(page.locator('[data-verdict="safe"]')).to_be_visible()
    accept_unknown(page)
    check('Provided kana reading controls the next turn',page.locator('.required-kana').inner_text()=='つ')
    page.close()

    page = new_page(width=390,height=844)
    page.screenshot(path=str(OUT/'home-mobile.png'),full_page=True,animations='disabled')
    page.locator('#players-plus').click(); page.locator('#players-plus').click()
    start(page)
    check('Four participants render on a phone',page.locator('.player-chip').count()==4)
    answer(page,'ねこ'); page.locator('[data-verdict="next"]').click()
    answer(page,'いぬ'); page.locator('[data-verdict="next"]').click()
    answer(page,'ぞう'); page.locator('[data-verdict="next"]').click()
    check('Four-player elimination chooses last survivor',page.locator('#finish-title').inner_text()=='みどりさん、ナイモノ名人！')
    page.close()

    for width in [320,390,768,1360]:
        page = new_page(width=width,height=844)
        check(f'Home has no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        start(page)
        check(f'Game has no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        if width==390: page.screenshot(path=str(OUT/'game-mobile.png'),full_page=True,animations='disabled')
        page.close()

    page = new_page()
    page.clock.install()
    start(page,unlimited=False)
    page.locator('#word-input').fill('もにゅらっぴ')
    page.clock.fast_forward(11000)
    check('Time expiry with typed text waits for confirmation',page.locator('#input-stage').is_visible() and page.locator('#timer-value').inner_text()=='0')
    page.locator('#submit-button').click()
    page.clock.fast_forward(500)
    check('Confirming after timeout still submits the captured word',page.locator('[data-verdict="safe"]').is_visible())
    page.close()

    page = new_page()
    page.clock.install()
    start(page,unlimited=False)
    page.locator('#word-input').fill('あ'); page.locator('#word-input').fill('')
    page.clock.fast_forward(11000)
    check('Empty input at timeout becomes a rules result','じかん' in page.locator('.verdict-title').inner_text())
    page.close()

    # Explicit in-memory Storage mock tests save/load and clear behavior without
    # claiming native persistence on about:blank / an opaque origin.
    storage_setup = """() => {
      window.testStorage = {};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>window.testStorage[k]??null,
        setItem:(k,v)=>{window.testStorage[k]=String(v)},
        removeItem:k=>{delete window.testStorage[k]}
      }});
    }"""
    page = new_page(setup=storage_setup)
    start(page); answer(page,'もにゅらっぴ'); accept_unknown(page)
    check('Discovery serializes into localStorage (Storage mock)',bool(page.evaluate("window.testStorage['naimono.collection.v1']")))
    page.set_content(HTML,wait_until='load')
    check('Discovery reloads from storage',page.locator('#collection-count').inner_text()=='01')
    page.locator('#gallery-button').click()
    check('Gallery displays the saved invented word',page.locator('.discovery-card h3').inner_text()=='もにゅらっぴ')
    page.locator('#clear-collection').click(); page.locator('#confirm-yes').click()
    check('Clearing collection requires confirmation and removes saved entries',page.locator('#collection-count').inner_text()=='00')
    page.close()

    live_setup = """() => {
      window.mockCalls = []; window.mockStatus = 'safe'; window.mockCategory = 'animal'; window.mockSounds = null; window.mockFlavor = 'soft'; window.mockAssessment = null;
      window.fetch = async (url,opts={}) => {
        if (url==='/api/config') return {ok:true,json:async()=>({judge:'jev',configured:true,model:'jev-1.13.0'})};
        window.mockCalls.push(JSON.parse(opts.body));
        if(window.mockStatus==='error') return {ok:false,json:async()=>({error:'テスト用の接続エラー。負けにはなりません。'})};
        const defaultScores = {exists:window.mockStatus==='safe'?0.1:window.mockStatus==='out'?0.97:0.5,everyday:.01,names:.02,culture:.03,places_products:.01,specialist:.02,variants:.01};
        const supplied = {compoundRisk:.01,sentenceRisk:.01,...(window.mockAssessment || {scores:defaultScores,nameRisk:.1})};
        const assessment = NaimonoCore.assessExistence(supplied.scores,supplied.nameRisk,supplied.compoundRisk,supplied.sentenceRisk);
        return {ok:true,json:async()=>({status:window.mockStatus,source:'jev',probability:assessment.score,assessment,message:'テスト用Jev回答',category:window.mockCategory,sounds:window.mockSounds,flavor:window.mockFlavor})};
      };
    }"""
    live_html = HTML.replace('globalThis.NAIMONO_STANDALONE = true;','globalThis.NAIMONO_STANDALONE = false;')
    page = new_page(html=live_html,setup=live_setup)
    start(page); answer(page,'もにゅらっぴ')
    check('Live-mode UI uses API response, with explicit fetch mock',page.locator('.verdict-title').inner_text()=='ナイモノ、はっけん！')
    check('Only word, reading and mode are sent, not player names',set(page.evaluate('window.mockCalls[0]').keys())=={'word','reading','mode'})
    check('The referee reacts to the Jev category and flavor beside the score','動物っぽい！' in page.locator('.referee-bubble').inner_text() and 'ふわふわの予感！' in page.locator('.referee-bubble').inner_text())
    check('The overall score is visible while all details start collapsed',page.locator('.judgment-total').is_visible() and page.locator('.judgment-total strong').inner_text()=='10' and not page.locator('.score-list').is_visible() and not page.locator('.name-caution').is_visible() and page.locator('.score-details').get_attribute('open') is None)
    page.locator('.score-details summary').focus(); page.keyboard.press('Enter')
    check('Keyboard opens seven recognition scores, compound, sentence and name caution',page.locator('.score-list .score-row').count()==9 and page.locator('.name-caution').is_visible())
    check('The actual decision thresholds are visible','85以上' in page.locator('.score-policy').inner_text() and '45未満' in page.locator('.score-policy').inner_text())
    page.keyboard.press('Space')
    check('Keyboard closes details without hiding the score',not page.locator('.score-list').is_visible() and page.locator('.judgment-total').is_visible())
    page.locator('[data-verdict="next"]').click()
    page.evaluate("window.mockStatus='error'")
    answer(page,'ごにょら')
    check('Provider error does not eliminate the player',page.locator('[data-verdict="retry"]').is_visible() and page.locator('.player-chip.eliminated').count()==0)
    check('Provider errors do not invent a score or Jev impression',page.locator('.judgment-panel').count()==0 and page.locator('.referee-reaction').count()==0)
    page.evaluate("window.mockStatus='review'")
    page.locator('[data-verdict="retry"]').click(); expect(page.locator('[data-verdict="safe"]')).to_be_visible()
    check('Uncertain live judgment goes to family review',page.locator('[data-verdict="safe"]').is_visible())
    check('Review results also show the referee impression',page.locator('.referee-bubble').is_visible() and '動物っぽい！' in page.locator('.referee-bubble').inner_text())
    page.close()

    speech_setup = """() => {
      window.SpeechRecognition = class {
        constructor(){window.mockSpeech=this;}
        start(){setTimeout(()=>this.onstart?.(),0);}
        stop(){this.onend?.();}
        abort(){}
      };
    }"""
    page = new_page(setup=speech_setup)
    start(page)
    page.locator('#mic-button').click(); page.locator('#mic-consent').click()
    page.evaluate("window.mockSpeech.onresult({results:[[{transcript:' モ ニュ　ラッピ。 '}]]}); window.mockSpeech.onend()")
    check('Speech spaces disappear and the result stays editable (ASR mock)',page.locator('#word-input').input_value()=='モニュラッピ' and not page.locator('#verdict-stage').is_visible())
    page.locator('#submit-button').click()
    expect(page.locator('[data-verdict="safe"]')).to_be_visible(); accept_unknown(page)
    check('Katakana from speech is submitted without retyping',page.locator('.history-entry strong').inner_text()=='モニュラッピ')
    page.locator('#mic-button').click()
    page.evaluate("window.mockSpeech.onerror({error:'not-allowed'})")
    check('Microphone refusal leaves text input usable without a loss',page.locator('#input-stage').is_visible() and '文字' in page.locator('#input-hint').inner_text())
    page.close()

    combined_setup = f'() => {{ ({live_setup})(); ({speech_setup})(); ({storage_setup})(); }}'
    page = new_page(html=live_html,setup=combined_setup)
    page.evaluate("window.mockCategory='food'; window.mockSounds={first:'く',last:'ち'}")
    start(page,shiri=True)
    page.locator('#mic-button').click(); page.locator('#mic-consent').click()
    page.evaluate("window.mockSpeech.onresult({results:[[{transcript:' 雲 ぷる　餅。 '}]]}); window.mockSpeech.onend()")
    check('Kanji speech does not demand a reading before submitting',page.locator('#word-input').input_value()=='雲ぷる餅' and not page.locator('#reading-wrap').is_visible())
    page.locator('#submit-button').click()
    expect(page.locator('[data-verdict="next"]')).to_be_visible()
    check('Kanji speech reaches Jev with spaces removed and kanji preserved',page.evaluate('window.mockCalls[0]')=={'word':'雲ぷる餅','reading':'','mode':'shiritori'})
    check('Jev sound choices are visible for correction','く → ち' in page.locator('.sound-note').inner_text())
    page.locator('[data-verdict="next"]').click()
    check('Kanji shiritori advances using the inferred last sound',page.locator('.required-kana').inner_text()=='ち')
    saved = page.evaluate("JSON.parse(window.testStorage['naimono.collection.v1'])")
    check('Discovery persists its original spelling and category',saved[0]['word']=='雲ぷる餅' and saved[0]['category']=='food')
    check('Sound personality persists with the discovery',saved[0]['flavor']=='soft')
    page.locator('#gallery-button').click()
    check('Category progress counts populated categories','1 / 7' in page.locator('#gallery-progress').inner_text())
    page.locator('[data-category="animal"]').click()
    check('Empty category remains browsable',page.locator('.discovery-card').count()==0 and 'まだ見つかっていない' in page.locator('.gallery-empty').inner_text())
    page.locator('[data-category="food"]').click()
    check('Category filters preserve focus and show matching discoveries',page.locator('.discovery-card h3').inner_text()=='雲ぷる餅' and page.locator('[data-category="food"]').evaluate('(el)=>el===document.activeElement'))
    page.locator('#gallery-dialog [data-close]').click()
    page.evaluate("window.mockSounds={first:'そ',last:'ふ'}")
    answer(page,'空色ぱふ')
    check('AI-supplied sounds still enforce the required opening','「ち」' in page.locator('.verdict-message').inner_text())
    page.set_content(live_html,wait_until='load')
    expect(page.locator('#start-button')).to_be_enabled()
    page.locator('#gallery-button').click()
    check('Category survives a storage reload',page.locator('[data-category="food"] b').inner_text()=='1' and page.locator('.discovery-card h3').inner_text()=='雲ぷる餅')
    check('Sound personality survives a storage reload','ふわふわ' in page.locator('.discovery-card .flavor-badge').inner_text())
    page.close()

    page = new_page(html=live_html,setup=combined_setup)
    start(page,shiri=True)
    page.locator('#word-input').fill('雲 ぷる　餅'); page.locator('#submit-button').click()
    expect(page.locator('#reading-wrap')).to_be_visible()
    check('Uncertain AI sounds request help without a loss',page.locator('.player-chip.eliminated').count()==0 and not page.locator('#verdict-stage').is_visible())
    page.locator('#reading-input').fill('クモ　プル モチ'); page.locator('#submit-button').click()
    expect(page.locator('[data-verdict="next"]')).to_be_visible(); page.locator('[data-verdict="next"]').click()
    check('Optional katakana reading recovers the same kanji word',page.locator('.required-kana').inner_text()=='ち' and page.locator('.history-entry strong').inner_text()=='雲ぷる餅')
    check('Typed word and optional reading are normalized before the API call',page.evaluate('window.mockCalls[1]')=={'word':'雲ぷる餅','reading':'くもぷるもち','mode':'shiritori'})
    page.close()

    page = new_page(html=live_html,setup=combined_setup)
    page.evaluate("window.mockSounds={first:'も',last:'ん'}")
    start(page,shiri=True); answer(page,'桃ぷる論')
    check('Kanji ending in n follows the same loss rule','「ん」で' in page.locator('.verdict-title').inner_text())
    page.close()

    page = new_page(html=live_html,setup=combined_setup)
    page.evaluate("window.mockSounds={first:'く',last:'ふ'}")
    start(page,shiri=True); answer(page,'雲ぷる餅')
    page.locator('[data-verdict="appeal"]').click(); page.locator('[data-verdict="edit"]').click()
    check('A player can correct an inferred reading without replacing kanji',page.locator('#reading-wrap').is_visible() and page.locator('#word-input').input_value()=='雲ぷる餅')
    page.locator('#reading-input').fill('くもぷるもち'); page.locator('#submit-button').click()
    expect(page.locator('[data-verdict="next"]')).to_be_visible(); page.locator('[data-verdict="next"]').click()
    check('The corrected reading overrides the AI sound choice',page.locator('.required-kana').inner_text()=='ち')
    page.close()

    page = new_page(html=live_html,setup=combined_setup)
    page.evaluate("window.mockStatus='error'")
    start(page,shiri=True); answer(page,'雲ぷる餅')
    page.locator('[data-verdict="manual"]').click(); page.locator('[data-verdict="safe"]').click()
    check('Manual fallback cannot silently skip unresolved shiritori sounds',page.locator('#reading-wrap').is_visible() and page.locator('#collection-count').inner_text()=='00')
    page.close()

    page = new_page(html=live_html,setup=combined_setup)
    page.evaluate("window.mockStatus='review'; window.mockCategory='person'")
    start(page); answer(page,'ぽよ山むぎ助'); accept_unknown(page)
    check('Family approval preserves Jev classification',page.evaluate("JSON.parse(window.testStorage['naimono.collection.v1'])[0].category")=='person')
    page.close()

    page = new_page(html=live_html,setup=combined_setup)
    page.evaluate("window.mockCategory='<img src=x onerror=alert(1)>'")
    start(page); answer(page,'もにゅらっぴ'); page.locator('[data-verdict="next"]').click()
    page.locator('#gallery-button').click()
    check('Invalid classification is unclassified without breaking safe discovery',page.locator('[data-category="unclassified"] b').inner_text()=='1' and page.locator('.discovery-card img').count()==0)
    page.close()

    band_assessment = "{scores:{exists:.03,everyday:.01,names:.94,culture:.2,places_products:.02,specialist:.01,variants:.18},nameRisk:.9}"
    for width in [320,390,768,1360]:
        page = new_page(width=width,height=844,html=live_html,setup=combined_setup)
        page.evaluate(f"window.mockStatus='out'; window.mockCategory='person'; window.mockFlavor='mysterious'; window.mockAssessment={band_assessment}")
        start(page); answer(page,'サカナクション')
        check(f'Collapsed results have no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth') and page.locator('.judgment-panel').evaluate('(el)=>el.scrollWidth<=el.clientWidth'))
        check(f'Out results include the referee impression and visible overall score at {width}px',page.locator('.referee-bubble').is_visible() and page.locator('.judgment-total').is_visible() and not page.locator('.score-list').is_visible())
        if width in [390,1360]: page.locator('#arena').screenshot(path=str(OUT/f'pop-out-{width}.png'),animations='disabled')
        page.locator('.score-details summary').click()
        check(f'Expanded score details have no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth') and page.locator('.judgment-panel').evaluate('(el)=>el.scrollWidth<=el.clientWidth'))
        check(f'A specific band clue remains visible despite a low broad score at {width}px',page.locator('.judgment-total strong').inner_text()=='94' and page.locator('[data-score="exists"] dd>span').inner_text()=='3' and page.locator('[data-score="names"] dd>span').inner_text()=='94')
        if width in [390,1360]: page.locator('#verdict-stage').screenshot(path=str(OUT/f'scores-{width}.png'),animations='disabled')
        page.locator('[data-verdict="appeal"]').click(); page.locator('[data-verdict="safe"]').click()
        check(f'Family override keeps original scores and explicitly labels the override at {width}px',page.locator('.judgment-total strong').inner_text()=='94' and page.locator('.manual-score-note').is_visible())
        page.close()

    page = new_page(html=live_html,setup=combined_setup)
    page.evaluate("window.mockStatus='review'; window.mockAssessment={scores:{exists:.84999,everyday:.01,names:.1,culture:.01,places_products:.01,specialist:.01,variants:.01},nameRisk:.44999}")
    start(page); answer(page,'もにゅらっぴ')
    page.locator('.score-details summary').click()
    check('Score rounding cannot falsely display a crossed decision threshold',page.locator('.judgment-total strong').inner_text()=='<85' and page.locator('[data-score="name_risk"] dd>span').inner_text()=='<45')
    page.close()

    for status,category,flavor,word in [('safe','animal','soft','フワミミペンギツネ'),('review','move','bold','もふもふ旋風脚')]:
        for width in [320,390,1360]:
            page = new_page(width=width,height=844,html=live_html,setup=combined_setup)
            page.evaluate(f"window.mockStatus='{status}'; window.mockCategory='{category}'; window.mockFlavor='{flavor}'")
            start(page); answer(page,word)
            check(f'{status} score and playful reaction fit at {width}px',page.locator('.referee-bubble').is_visible() and page.locator('.judgment-total').is_visible() and page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            if width in [390,1360]: page.locator('#arena').screenshot(path=str(OUT/f'pop-{status}-{width}.png'),animations='disabled')
            page.close()

    page = new_page(width=390,height=844,html=live_html,setup=combined_setup)
    page.emulate_media(reduced_motion='reduce')
    start(page); answer(page,'あいうえおかきくけこさしすせそたちつてとなにぬね')
    check('Long words wrap without overflowing the playful result',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    check('Reduced motion keeps reactions readable without confetti or bouncing',page.locator('.confetti').count()==0 and page.locator('.referee-bubble').is_visible() and page.locator('.referee-bubble').evaluate('(el)=>getComputedStyle(el).animationName')=='none' and page.locator('.judgment-total').evaluate('(el)=>getComputedStyle(el).animationName')=='none')
    page.locator('.score-details summary').click()
    check('Score accordion remains usable with reduced motion',page.locator('.score-list').is_visible())
    page.close()

    for kind,word,title,button in [('compound','宇宙バナナ','ことばの、つぎはぎ！','ことばのつぎはぎ！'),('sentence','ねこが空を飛ぶ','文章に、なってる！','文章になってる！')]:
        for width in [320,390,1360]:
            page = new_page(width=width,height=844,html=live_html,setup=combined_setup)
            page.evaluate(f"window.mockStatus='out'; window.mockAssessment={{scores:{{exists:.02,everyday:.01,names:.01,culture:.01,places_products:.01,specialist:.01,variants:.01}},nameRisk:.1,{kind}Risk:.96}}")
            start(page); answer(page,word)
            check(f'{kind} violation has its own title and overall score at {width}px',page.locator('.verdict-title').inner_text()==title and page.locator('.judgment-total strong').inner_text()=='96' and not page.locator('.score-list').is_visible())
            check(f'{kind} result fits at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            if width==390: page.locator('#arena').screenshot(path=str(OUT/f'{kind}-mobile.png'),animations='disabled')
            page.locator('.score-details summary').click()
            check(f'{kind} rule score is separate from recognition at {width}px',page.locator(f'[data-score="{kind}"] dd>span').inner_text()=='96' and page.locator('[data-score="exists"] dd>span').inner_text()=='2')
            page.locator('[data-verdict="appeal"]').click()
            check(f'{kind} appeal names the rule without claiming existence at {width}px',button in page.locator('[data-verdict="out"]').inner_text())
            page.locator('[data-verdict="safe"]').click()
            check(f'{kind} override preserves the original scores at {width}px',page.locator('.manual-score-note').is_visible() and page.locator('.judgment-total strong').inner_text()=='96')
            page.locator('[data-verdict="next"]').click()
            check(f'{kind} override can continue play at {width}px',page.locator('#collection-count').inner_text()=='01')
            page.close()

    samples = [
        {'word':'雲ぷる餅','category':'food'}, {'word':'しゅわ星ゼリー','category':'food'},
        {'word':'ふわみみペンギツネ','category':'animal'}, {'word':'もふもふ旋風脚','category':'move'},
        {'word':'ぽよ山むぎ助','category':'person'}, {'word':'虹巻きスプーナ','category':'tool'},
        {'word':'ねむねむ雲ヶ原','category':'place'}, {'word':'ぷるんの向こう','category':'other'},
        {'word':'まえからの発見'}
    ]
    sample_entries = [dict(word=item['word'],category=item.get('category'),avatar=['blue','pink','orange','green'][i%4],source='jev') for i,item in enumerate(samples)]
    sample_storage = json.dumps(sample_entries,ensure_ascii=False)
    gallery_setup = f"() => {{ ({storage_setup})(); window.testStorage['naimono.collection.v1'] = {json.dumps(sample_storage)}; }}"
    for width in [320,390,768,1360]:
        page = new_page(width=width,height=844,setup=gallery_setup)
        page.locator('#gallery-button').click()
        check(f'Gallery has no horizontal overflow at {width}px',page.locator('#gallery-dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth') and page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check(f'Gallery shows category groups and keeps legacy entries at {width}px',page.locator('.discovery-card').count()==9 and page.locator('[data-category="unclassified"] b').inner_text()=='1')
        page.locator('[data-category="food"]').click()
        check(f'Food filter shows exactly its two discoveries at {width}px',page.locator('.discovery-card').count()==2 and page.locator('[data-category="food"]').get_attribute('aria-pressed')=='true')
        if width in [390,1360]: page.screenshot(path=str(OUT/f'gallery-{width}.png'),full_page=True,animations='disabled')
        page.locator('[data-category="all"]').click()
        if width==1360: page.screenshot(path=str(OUT/'gallery-all-desktop.png'),full_page=True,animations='disabled')
        page.close()

    check('No uncaught browser JavaScript errors',not errors)
    (OUT/'browser-report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'notes':['Standalone HTML rendered directly, not localhost navigation.','Jev HTTP and microphone branches use explicit mocks.','Storage roundtrip uses an in-memory Storage mock.']},ensure_ascii=False,indent=2))
    browser.close()
    print(f'\n{len(checks)} checks passed.')
