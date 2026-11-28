"""Bounded, opt-in scholarly search; only the explicit search phrase leaves the PC."""
import json
import re
from html.parser import HTMLParser
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class AbstractText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain_text(value):
    parser = AbstractText()
    parser.feed(str(value or ''))
    return ' '.join(' '.join(parser.parts).split())


def search_sources(query):
    params = urlencode({'query.bibliographic': query, 'filter': 'has-abstract:true',
                        'rows': 5, 'select': 'DOI,title,abstract'})
    req = Request('https://api.crossref.org/works?' + params,
                  headers={'Accept': 'application/json', 'User-Agent': 'LocalAnnotationSite/1.0'})
    with urlopen(req, timeout=10) as response:
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError('Слишком большой ответ Crossref')
    items = json.loads(raw)['message']['items']
    sources, seen = [], set()
    for item in items:
        doi = str(item.get('DOI', '')).strip()
        titles = item.get('title') or []
        title = plain_text(titles[0]) if titles else ''
        abstract = plain_text(item.get('abstract'))
        if not re.fullmatch(r'10\.\d{4,9}/[^\s]+', doi) or not title or not abstract or doi.casefold() in seen:
            continue
        seen.add(doi.casefold())
        sources.append({'id': len(sources) + 1, 'title': title[:300],
                        'abstract': abstract[:1600], 'url': 'https://doi.org/' + quote(doi, safe='/')})
        if len(sources) == 3:
            break
    return sources


def attach_sources(content, sources):
    """Append only actual DOI links for source numbers used by the model."""
    ids = set(re.findall(r'\[(\d+)\]', content))
    valid = {str(s['id']) for s in sources}
    if ids - valid:
        raise ValueError('Ollama сослалась на неизвестный источник. Повторите генерацию.')
    used = [s for s in sources if str(s['id']) in ids]
    if used:
        content += '\n\nИсточники:\n' + '\n'.join(f"[{s['id']}] {s['title']} — {s['url']}" for s in used)
    return content, len(used)
