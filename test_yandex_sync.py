import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, call

import main


KEY = 'https://disk.yandex.ru/d/folder'
RAW = 'Автор: Автор\nСсылка: https://example.org/paper\nАннотация: Текст'.encode()


class YandexSyncTests(unittest.TestCase):
    def test_missing_yandex_never_falls_back_to_google(self):
        with patch.dict(os.environ, {'GOOGLE_SHEET_URL': main.DEFAULT_SHEET}, clear=True):
            with self.assertRaisesRegex(ValueError, 'YANDEX_PUBLIC_URL'):
                main.configured_source()
        with patch.dict(os.environ, {'IMPORT_SOURCE':'google', 'GOOGLE_SHEET_URL':main.DEFAULT_SHEET}, clear=True):
            self.assertEqual(main.configured_source()[:2], main.parse_sheet_url(main.DEFAULT_SHEET))
        with patch.dict(os.environ, {'YANDEX_PUBLIC_URL':KEY}, clear=True):
            self.assertEqual(main.configured_source()[1:], ('txt',KEY))

    def test_nested_files_and_pages_keep_root_id(self):
        root = {'type':'file','name':'a.txt','path':'/a.txt'}
        folder = {'type':'dir','name':'nested','path':'/nested'}
        nested = {'type':'file','name':'a.txt','path':'/nested/a.txt'}
        page = lambda items,total: {'_embedded':{'items':items,'total':total}}
        with patch('main.yandex_api', side_effect=[{'type':'dir'},page([root],2),page([folder],2),page([nested],1),{'href':'https://example.org/a'},{'href':'https://example.org/b'}]) as api, patch('main.get_bytes', return_value=(RAW,'text/plain')):
            rows = main.read_yandex_txts(KEY)
        self.assertEqual({r.number for r in rows},{main.yandex_record_id('a.txt'),main.yandex_record_id('nested/a.txt')})
        self.assertEqual({r.annotation_url for r in rows},{KEY+'#/a.txt',KEY+'#/nested/a.txt'})
        self.assertIn(call(KEY,limit=100,offset=1),api.call_args_list)
        self.assertIn(call(KEY,limit=100,offset=0,path='/nested'),api.call_args_list)

    def test_new_files_import_unchanged_skip_and_old_sources_retained(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'YANDEX_PUBLIC_URL':KEY}, clear=True):
            db = main.connect_db(Path(temp)/'db.sqlite')
            source,gid,_ = main.configured_source()
            old = main.parse_annotation_txt(RAW.decode(),'old.txt',KEY+'#/old.txt')
            new = main.parse_annotation_txt(RAW.decode(),'new.txt',KEY+'#/new.txt')
            meta = {'article_authors':['A'],'topic':'Topic','metadata_source':'publisher'}
            main.save_success(db,'google_old','0',old,'model','2027-12-12',old.annotation_text,meta,['x'])
            main.save_success(db,source,gid,old,'model','',old.annotation_text,meta,['x'])
            with patch('main.read_yandex_txts',return_value=[old,new]), patch('main.read_public_sheet') as google, patch('main.read_article',return_value='text'), patch('main.resolve_article_metadata',return_value=meta), patch('main.ask_ollama',return_value={'keywords':['x']}) as ollama:
                self.assertEqual(main.run_once(db,source,gid,'model','http://localhost',yandex_url=KEY),(1,1,0))
                google.assert_not_called()
                ollama.assert_called_once()
            self.assertEqual(db.execute('SELECT COUNT(*) FROM annotations').fetchone()[0],3)
            db.close()
