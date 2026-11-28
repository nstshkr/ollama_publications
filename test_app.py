from pathlib import Path
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main as main_module
import app as app_module


def create_test_db(path: Path) -> None:
    db = main_module.connect_db(path)
    db.execute(
        """INSERT INTO annotations (
            sheet_id, sheet_gid, sheet_row, annotation_url, article_url,
            article_file_url, annotation_date, annotation_author,
            article_authors_json, topic, metadata_source, annotation_text,
            keywords_json, source_hash, model, schema_version, extracted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "sheet1", "0", 45, "https://example.com/ann", "https://example.com/article",
            "", "2026-11-19", "Иванов Иван",
            json.dumps(["Smith A.", "Lee B."]), "Тестовая тема", "crossref",
            "Тестовая аннотация.", json.dumps(["a", "b"]), "hash",
            "qwen2.5:7b", "4", "2026-11-19T00:00:00+00:00",
        ),
    )
    db.commit()
    db.close()


class SiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "test.db"
        create_test_db(self.db_path)
        os.environ["DB_PATH"] = str(self.db_path)
        app_module.app.config.update(TESTING=True)
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def test_index_ok(self):
        self.assertEqual(self.client.get("/").status_code, 200)

    def test_api_list(self):
        data = self.client.get("/api/articles").get_json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["items"][0]["annotation_author"], "Иванов Иван")

    def test_api_search(self):
        self.assertEqual(self.client.get("/api/articles?q=тестов").get_json()["count"], 1)
        self.assertEqual(self.client.get("/api/articles?q=nomatch").get_json()["count"], 0)

    def test_article_detail(self):
        r = self.client.get("/article/45")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Тестовая аннотация", r.get_data(as_text=True))

    def test_404(self):
        self.assertEqual(self.client.get("/article/9999").status_code, 404)


if __name__ == "__main__":
    unittest.main()