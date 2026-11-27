import os
import io
import json
import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app


class WebWorkflows(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'DB_PATH': str(Path(self.tmp.name) / 'test.db')})
        self.env.start()
        self.client = app.app.test_client()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_generate_and_publish(self):
        with patch('app.generate_post', return_value={'title': 'Тема', 'content': 'Аннотация'}) as generate:
            response = self.client.post('/api/posts/generate', json={'notes': ['Заметка']})
            self.assertEqual(response.status_code, 200)
            generate.assert_called_once_with(['Заметка'])
        created = self.client.post('/api/posts', json=response.json)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.client.get('/api/posts').json['items'][0]['content'], 'Аннотация')
        self.assertEqual(self.client.delete('/api/posts/' + str(created.json['id'])).status_code, 200)
        self.assertEqual(self.client.get('/api/posts').json['items'], [])

    def test_disk_link(self):
        txt = 'https://disk.yandex.ru/d/test#/annotation.txt'
        pdf = 'https://disk.yandex.ru/i/example'
        data = {'article_url': 'https://example.com/article', 'annotation_url': txt, 'article_file_url': pdf}
        self.assertEqual(app.yandex_disk_source(data), (pdf, False))
        data['article_file_url'] = data['article_url']
        self.assertEqual(app.yandex_disk_source(data), (txt, True))
        data['annotation_url'] = 'https://disk.yandex.ru.evil.example/file'
        self.assertEqual(app.yandex_disk_source(data), ('', False))

    def test_upload_removed(self):
        self.assertEqual(self.client.post('/api/articles/upload').status_code, 404)
        self.assertNotIn('upload-annotation-btn', self.client.get('/').get_data(as_text=True))

    def test_invalid_input(self):
        self.assertEqual(self.client.post('/api/posts/generate', json={'notes': []}).status_code, 400)

    def test_edit_attachments_publish_unpublish(self):
        post = self.client.post('/api/posts', json={'title':'Черновик','content':'Первый текст'}).json['id']
        self.assertEqual(self.client.get('/api/articles').json['count'], 0)
        self.assertEqual(self.client.get(f'/publication/{post}').status_code, 404)
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=')
        edited = self.client.patch(f'/api/posts/{post}', data={'title':'Новая тема','content':'Новый текст','files':[(io.BytesIO(png),'рисунок.png'),(io.BytesIO(b'hello'),'data.txt')]})
        self.assertEqual(edited.status_code, 200)
        item = self.client.get('/api/posts').json['items'][0]
        self.assertEqual(item['title'], 'Новая тема')
        image, file = item['attachments']
        self.assertTrue(image['is_image'])
        self.assertFalse(file['is_image'])
        r = self.client.get(image['url'])
        self.assertEqual(r.mimetype, 'image/png')
        self.assertEqual(r.data, png)
        self.assertIn('attachment', self.client.get(file['url']).headers['Content-Disposition'])
        for _ in range(2):
            self.assertEqual(self.client.post(f'/api/posts/{post}/publish').status_code, 200)
        articles = self.client.get('/api/articles?q=новая').json
        self.assertEqual(articles['count'], 1)
        self.assertEqual(articles['items'][0]['kind'], 'post')
        self.assertEqual(articles['items'][0]['cover_url'], image['url'])
        self.assertIn('Новый текст', self.client.get(f'/publication/{post}').get_data(as_text=True))
        self.assertEqual(self.client.get('/api/articles?author=Мой пост').json['count'], 1)
        self.assertEqual(self.client.get('/api/articles?author=Другой').json['count'], 0)
        self.assertEqual(self.client.get('/api/articles?date_to=2000-01-01').json['count'], 0)
        self.assertEqual(self.client.patch(f'/api/posts/{post}', data={'title':'Исправлено','content':'Текст','remove_ids':str(file['id'])}).status_code, 200)
        self.assertEqual(self.client.get('/api/articles').json['items'][0]['topic'], 'Исправлено')
        self.assertEqual(self.client.get(file['url']).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/posts/{post}/publish').status_code, 200)
        self.assertEqual(self.client.get('/api/articles').json['count'], 0)
        self.assertEqual(self.client.get('/api/posts').json['items'][0]['title'], 'Исправлено')
        self.client.post(f'/api/posts/{post}/publish')
        self.assertEqual(self.client.delete(f'/api/posts/{post}').status_code, 200)
        self.assertEqual(self.client.get('/api/articles').json['count'], 0)
        self.assertEqual(self.client.get(image['url']).status_code, 404)

    def test_invalid_attachment_is_atomic(self):
        post = self.client.post('/api/posts', json={'title':'До','content':'Текст'}).json['id']
        r = self.client.patch(f'/api/posts/{post}', data={'title':'После','content':'Текст','files':(io.BytesIO(b'x'*(app.FILE_LIMIT+1)), 'large.bin')})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get('/api/posts').json['items'][0]['title'], 'До')
        r = self.client.patch(f'/api/posts/{post}', data={'title':'После','content':'Текст','remove_ids':'999'})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get('/api/posts').json['items'][0]['title'], 'До')
        r = self.client.patch(f'/api/posts/{post}', data={'title':'После','content':'Текст','files':(io.BytesIO(b'<script>alert(1)</script>'), 'unsafe.html')})
        self.assertEqual(r.status_code, 200)
        file = self.client.get('/api/posts').json['items'][0]['attachments'][0]
        response = self.client.get(file['url'])
        self.assertEqual(response.mimetype, 'application/octet-stream')
        self.assertIn('attachment', response.headers['Content-Disposition'])
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')

    def test_only_current_import_source_visible(self):
        import main
        key = 'https://disk.yandex.ru/d/folder'
        raw = 'Автор: Автор\nСсылка: https://example.org/paper\nАннотация: Текст'
        meta = {'article_authors': [], 'topic': 'Topic', 'metadata_source': 'publisher'}
        with patch.dict(os.environ, {'IMPORT_SOURCE':'yandex','YANDEX_PUBLIC_URL':key}):
            source, gid, _ = main.configured_source()
            db = app.get_db()
            for sid, g, name in [(source,gid,'real.txt'),('old_google','0','wrong.txt'),('yandex:other','txt','other.txt')]:
                row = main.parse_annotation_txt(raw,name,key+'#/'+name)
                main.save_success(db,sid,g,row,'model','',row.annotation_text,meta,[])
            db.close()
            items = self.client.get('/api/articles').json['items']
            self.assertEqual(len(items),1)
            self.assertTrue(items[0]['annotation_url'].endswith('real.txt'))
            self.assertEqual(self.client.get('/article/'+str(main.yandex_record_id('wrong.txt'))).status_code,404)
            db = app.get_db()
            self.assertEqual(db.execute('SELECT COUNT(*) FROM annotations').fetchone()[0],3)
            db.close()

    def test_exact_annotation_link(self):
        from unittest.mock import call
        key = 'https://disk.yandex.ru/d/folder'
        saved = key + '#/%D1%82%D0%B5%D1%81%D1%82.txt'
        href = 'https://downloader.disk.yandex.ru/disk/file?token=temporary'
        with patch('app.fetch_article', return_value={'annotation_url': saved}), patch('app.pipeline.yandex_api', side_effect=[{'type':'file'}, {'href':href}]) as api:
            r = self.client.get('/article/45/annotation')
            self.assertEqual(r.status_code, 302)
            self.assertEqual(r.headers['Location'], href)
            self.assertEqual(r.headers['Cache-Control'], 'no-store')
            self.assertEqual(api.call_args_list, [call(key, path='/тест.txt'), call(key, '/download', path='/тест.txt')])
        with patch('app.fetch_article', return_value={'annotation_url':key}), patch('app.pipeline.yandex_api', return_value={'type':'dir'}):
            self.assertEqual(self.client.get('/article/45/annotation').headers['Location'], '/article/45?disk_unavailable=1')
        with patch('app.fetch_article', return_value={'annotation_url':saved}), patch('app.pipeline.yandex_api', side_effect=RuntimeError('Offline')):
            self.assertEqual(self.client.get('/article/45/annotation').headers['Location'], '/article/45?disk_unavailable=1')
        self.assertIsNone(app.yandex_annotation_parts('https://disk.yandex.ru.evil.org/d/folder#/a.txt'))
        self.assertIsNone(app.yandex_annotation_parts(key + '#/../a.txt'))

    def test_research_optional_and_fallback(self):
        response = {'message':{'content':json.dumps({'title':'Тема','content':'Факт [1].'})}}
        source = {'id':1, 'title':'Paper', 'abstract':'Fact', 'url':'https://doi.org/10.1234/example'}
        with patch('app.search_sources', return_value=[source]) as search, patch('app.urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as ollama:
            result = self.client.post('/api/posts/generate', json={'notes':['Заметка'], 'research_query':'robotics'})
            self.assertEqual(result.status_code, 200)
            self.assertIn(source['url'], result.json['content'])
            search.assert_called_once_with('robotics')
            payload = json.loads(ollama.call_args.args[0].data)
            self.assertEqual(json.loads(payload['messages'][1]['content'])['sources'], [source])
        response['message']['content'] = json.dumps({'title':'Тема','content':'Только заметки.'})
        with patch('app.search_sources', side_effect=RuntimeError('offline')) as search, patch('app.urlopen', return_value=io.BytesIO(json.dumps(response).encode())):
            result = self.client.post('/api/posts/generate', json={'notes':['Заметка'], 'research_query':'robotics'})
            self.assertEqual(result.status_code, 200)
            self.assertIn('недоступен', result.json['research_status'])
        with patch('app.search_sources') as search, patch('app.urlopen', return_value=io.BytesIO(json.dumps(response).encode())):
            result = self.client.post('/api/posts/generate', json={'notes':['Заметка']})
            self.assertEqual(result.status_code, 200)
            search.assert_not_called()
