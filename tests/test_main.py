from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main


SHEET_CSV = (
    "Номер,Фамилия Имя,Другое,Список,Пусто\n" + ",,,,\n" * 42 +
    "Аннотации,Ссылка,Статья,Дата,Автор\n" +
    "https://docs.google.com/document/d/a123/edit,https://ieeexplore.ieee.org/document/11364698,https://example.com/article.pdf,67.67.2067,Бабаев Эмиль\n" +
    ",,,,\n"
)


class SheetTests(unittest.TestCase):
    def test_sheet_and_gid(self):
        self.assertEqual(main.parse_sheet_url(main.DEFAULT_SHEET),
                         ("1J2wP27I4sVo7MZBbiYdAOHe-s_VhSOfP5eWhN8DcnNQ", "0"))

    def test_find_bottom_headers(self):
        rows = main.parse_rows(SHEET_CSV)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].number, 45)
        self.assertEqual(rows[0].annotation_author, "Бабаев Эмиль")

    def test_invalid_date(self):
        with self.assertRaisesRegex(ValueError, "Неверная дата"):
            main.parse_date("67.67.2067")
        self.assertEqual(main.parse_date("19.11.2026"), "2026-11-19")

    def test_url_validation(self):
        with self.assertRaises(ValueError):
            main.validate_url("file:///C:/private.txt")
        with self.assertRaises(ValueError):
            main.validate_url("http://127.0.0.1/config")
        self.assertEqual(main.validate_url("https://arxiv.org/abs/2605.10093"),
                         "https://arxiv.org/abs/2605.10093")

    def test_html_metadata(self):
        source = b"""<html><head><meta name="citation_title" content="Paper title">
        <meta name="citation_author" content="A. Smith"><meta name="citation_author" content="B. Lee">
        </head><body><main>Full abstract about speech recognition and robots.</main></body></html>"""
        value = main.load_html(source)
        self.assertIn("Paper title", value)
        self.assertIn("A. Smith; B. Lee", value)
        self.assertIn("speech recognition", value)

    def test_llm_validation(self):
        good = {"keywords": ["один", "два", "три", "четыре", "пять"]}
        self.assertEqual(len(main.normalize_llm(good)["keywords"]), 5)
        good["keywords"] = ["one"]
        with self.assertRaises(ValueError):
            main.normalize_llm(good)

    def test_bad_date_does_not_call_network(self):
        with tempfile.TemporaryDirectory() as temp:
            db = main.connect_db(Path(temp) / "data.db")
            with patch.object(main, "download_document") as download:
                result = main.run_once(db, "sheet1", "0", "model", "http://localhost", public_csv=SHEET_CSV)
            self.assertEqual(result, (0, 0, 1))
            download.assert_not_called()
            error = db.execute("SELECT error FROM extraction_errors").fetchone()[0]
            self.assertIn("Неверная дата", error)
            db.close()

    def test_run_and_skip_unchanged(self):
        text = SHEET_CSV.replace("67.67.2067", "19.11.2026")
        with tempfile.TemporaryDirectory() as temp:
            db = main.connect_db(Path(temp) / "data.db")
            extracted = {"keywords": ["a", "b", "c", "d", "e"]}
            metadata = {"topic": "Тема", "article_authors": ["А", "Б"], "metadata_source": "publisher"}
            with patch.object(main, "download_document", return_value="Настоящая аннотация." * 5) as download, \
                 patch.object(main, "read_article", return_value="Article text, Author A" * 6), \
                 patch.object(main, "resolve_article_metadata", return_value=metadata), \
                 patch.object(main, "ask_ollama", return_value=extracted) as model:
                first = main.run_once(db, "sheet1", "0", "model", "http://localhost", public_csv=text)
                second = main.run_once(db, "sheet1", "0", "model", "http://localhost", public_csv=text)
            self.assertEqual(first, (1, 0, 0))
            self.assertEqual(second, (0, 1, 0))
            self.assertEqual(download.call_count, 1)
            model.assert_called_once()
            saved = db.execute("SELECT * FROM annotations").fetchone()
            self.assertEqual(saved["annotation_author"], "Бабаев Эмиль")
            self.assertEqual(saved["topic"], "Тема")
            self.assertEqual(saved["annotation_date"], "2026-11-19")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM extraction_errors").fetchone()[0], 0)
            db.close()


if __name__ == "__main__":
    unittest.main()
    unittest.main()
