import io
import json
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import post_research
import main


class ResearchTests(unittest.TestCase):
    def test_search_uses_real_doi_and_abstract(self):
        data = {'message': {'items': [
            {'DOI': '10.1234/example', 'title': ['Study'], 'abstract': '<jats:p>Measured results.</jats:p>'},
            {'DOI': '10.1234/example', 'title': ['Duplicate'], 'abstract': 'duplicate'},
            {'DOI': 'invalid', 'title': ['Bad'], 'abstract': 'bad'},
            {'DOI': '10.1234/empty', 'title': ['Empty']},
        ]}}
        with patch('post_research.urlopen', return_value=io.BytesIO(json.dumps(data).encode())) as request:
            result = post_research.search_sources('robot dialogue')
        self.assertEqual(result, [{'id': 1, 'title': 'Study', 'abstract': 'Measured results.', 'url': 'https://doi.org/10.1234/example'}])
        url = urlsplit(request.call_args.args[0].full_url)
        self.assertEqual(url.hostname, 'api.crossref.org')
        self.assertEqual(parse_qs(url.query)['query.bibliographic'], ['robot dialogue'])
        self.assertEqual(request.call_args.kwargs['timeout'], 10)
        text, count = post_research.attach_sources('Результат [1].', result)
        self.assertEqual(count, 1)
        self.assertIn('https://doi.org/10.1234/example', text)
        self.assertEqual(post_research.attach_sources('Только заметки', result), ('Только заметки', 0))
        with self.assertRaises(ValueError):
            post_research.attach_sources('Выдумка [99]', result)

    def test_import_preserves_exact_actual_txt(self):
        key = 'https://disk.yandex.ru/d/folder'
        item = {'name': 'тест.txt', 'path': '/тест.txt', 'type': 'file'}
        raw = ('Автор: Автор\nСсылка: https://example.org/paper\n'
               'Ссылка на аннотацию: ' + key + '\nАннотация: Текст').encode()
        with patch('main.yandex_api', side_effect=[{'type': 'dir'}, {'_embedded': {'items': [item], 'total': 1}}, {'href': 'https://example.org/download'}]), patch('main.get_bytes', return_value=(raw, 'text/plain')):
            rows = main.read_yandex_txts(key)
        self.assertEqual(rows[0].annotation_url, key + '#/%D1%82%D0%B5%D1%81%D1%82.txt')
        self.assertEqual(rows[0].annotation_text, 'Текст')
