import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import main

KEY = 'https://disk.yandex.ru/d/folder'

class IncompleteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = main.connect_db(Path(self.temp.name)/'db.sqlite')
        self.addCleanup(self.db.close)

    def run_import(self, row, retry=False):
        with patch('main.read_yandex_txts', return_value=[row]):
            return main.run_once(self.db, 'yandex-test', 'txt', 'model', 'http://localhost', yandex_url=KEY, retry_incomplete=retry)

    def saved(self):
        return self.db.execute('SELECT * FROM annotations').fetchone()

    def test_missing_fields_and_ollama_failure_saved_and_skipped(self):
        row = main.parse_annotation_txt('Аннотация: Содержательный текст.', 'a.txt', KEY+'#/a.txt')
        with patch('main.publisher_metadata') as publisher, patch('main.read_article') as read, patch('main.ask_ollama', side_effect=RuntimeError('offline')) as ai:
            self.assertEqual(self.run_import(row), (1,0,0))
            self.assertEqual(self.run_import(row), (0,1,0))
            publisher.assert_not_called(); read.assert_not_called(); ai.assert_called_once()
        saved = self.saved()
        self.assertEqual(saved['annotation_text'], row.annotation_text)
        self.assertEqual(saved['annotation_author'], 'Неизвестно')
        self.assertEqual(saved['topic'], 'Неизвестно')
        self.assertEqual(saved['annotation_date'], '')
        self.assertEqual(saved['article_url'], '')
        self.assertEqual(json.loads(saved['article_authors_json']), ['Неизвестно'])
        self.assertEqual(json.loads(saved['keywords_json']), ['Неизвестно'])

    def test_invalid_url_and_date_keep_annotation_and_hash(self):
        row = main.parse_annotation_txt('Автор: А\nСсылка: (не найдена — уточнить)\nДата: 67.67.2067\nТема: Тема\nАннотация: Текст', 'a.txt', KEY+'#/a.txt')
        with patch('main.crossref_metadata_by_title', side_effect=ValueError('not found')), patch('main.ask_ollama',return_value={'keywords':['слово']}), patch('main.read_article') as read:
            self.assertEqual(self.run_import(row), (1,0,0))
            self.assertEqual(self.run_import(row), (0,1,0))
            read.assert_not_called()
        self.assertEqual(self.saved()['topic'], 'Тема')
        self.assertEqual(self.saved()['source_hash'], main.source_hash(row))

    def test_fallback_and_retry_no_duplicate(self):
        row = main.parse_annotation_txt('Автор: А\nСсылка: https://example.org/article\nТема: Тема\nАннотация: Текст', 'a.txt', KEY+'#/a.txt')
        meta = {'topic':'Тема','article_authors':[],'metadata_source':'publisher'}
        with patch('main.read_article',return_value='short bad page'), patch('main.resolve_article_metadata',return_value=meta), patch('main.ask_ollama',side_effect=[ValueError('no keywords'),{'keywords':['слово']}]) as ai:
            self.assertEqual(self.run_import(row),(1,0,0))
            self.assertEqual(ai.call_args_list[1].args[0],row.annotation_text)
        meta['article_authors']=['A. Smith']
        with patch('main.read_article',side_effect=RuntimeError('blocked')), patch('main.resolve_article_metadata',return_value=meta), patch('main.ask_ollama',side_effect=RuntimeError('offline')):
            self.assertEqual(self.run_import(row,retry=True),(1,0,0))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM annotations').fetchone()[0],1)
        self.assertEqual(json.loads(self.saved()['article_authors_json']),['A. Smith'])
        self.assertEqual(json.loads(self.saved()['keywords_json']),['слово'])

    def test_empty_annotation_still_invalid(self):
        with self.assertRaisesRegex(ValueError,'Аннотация'):
            main.parse_annotation_txt('Автор: А\nАннотация:', 'a.txt', KEY+'#/a.txt')
