"""Flask-сайт публикаций поверх annotations.db (Google Таблица → Ollama → SQLite)."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, render_template, request

from main import connect_db  # переиспользуем создание схемы из main.py

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

app = Flask(__name__)


# ---------- утилиты ----------

def _db_path() -> Path:
    path = Path(os.getenv("DB_PATH", "annotations.db"))
    if not path.is_absolute():
        path = ROOT / path
    return path


def db_file_exists() -> bool:
    return _db_path().exists()


def get_db() -> sqlite3.Connection:
    db = connect_db(_db_path())
    db.create_function("unicode_fold", 1, lambda value: (value or "").casefold())
    return db


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    data = dict(row)
    data["sheet_row"] = str(data["sheet_row"])
    import json
    
    # Безопасный парсинг JSON на случай битых данных в БД
    try:
        data["article_authors"] = json.loads(data.pop("article_authors_json", "[]") or "[]")
    except (json.JSONDecodeError, TypeError):
        data["article_authors"] = []
        
    try:
        data["keywords"] = json.loads(data.pop("keywords_json", "[]") or "[]")
    except (json.JSONDecodeError, TypeError):
        data["keywords"] = []
        
    return data


def fetch_articles(q: str = "", author: str = "", date_from: str = "", date_to: str = "", sort: str = "date_desc") -> list[dict]:
    sql = "SELECT * FROM annotations"
    clauses: list[str] = []
    params: list = []
    if q:
        like = f"%{q.casefold()}%"
        clauses.append(
            "(unicode_fold(topic) LIKE ? OR unicode_fold(annotation_text) LIKE ? "
            "OR unicode_fold(article_authors_json) LIKE ? OR unicode_fold(keywords_json) LIKE ?)"
        )
        params += [like, like, like, like]
    if author:
        clauses.append("annotation_author = ?")
        params.append(author)
    if date_from:
        clauses.append("annotation_date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("annotation_date <= ?")
        params.append(date_to)
        
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    order = {
        "date_desc": "annotation_date DESC, sheet_row ASC",
        "date_asc":  "annotation_date ASC,  sheet_row ASC",
        "author":    "annotation_author COLLATE NOCASE ASC, annotation_date DESC",
    }.get(sort, "annotation_date DESC, sheet_row ASC")
    sql += " ORDER BY " + order

    db = get_db()
    try:
        rows = db.execute(sql, params).fetchall()
        return [row_to_dict(r) for r in rows if r is not None]
    finally:
        db.close()


def fetch_article(row_number: int) -> dict | None:
    db = get_db()
    try:
        row = db.execute(
            "SELECT * FROM annotations WHERE sheet_row = ? "
            "ORDER BY extracted_at DESC LIMIT 1",
            (row_number,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        db.close()


def fetch_authors() -> list[str]:
    db = get_db()
    try:
        rows = db.execute(
            "SELECT DISTINCT annotation_author FROM annotations "
            "WHERE annotation_author <> '' "
            "ORDER BY annotation_author COLLATE NOCASE"
        ).fetchall()
        return [r["annotation_author"] for r in rows]
    finally:
        db.close()


@app.template_filter("ru_date")
def ru_date(value: str) -> str:
    try:
        d = datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return value or ""
    months = ["января", "февраля", "марта", "апреля", "мая", "июня",
              "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    return f"{d.day} {months[d.month - 1]} {d.year}"


# ---------- маршруты ----------

@app.route("/")
def index():
    if not db_file_exists():
        return render_template("no_db.html")
    return render_template("index.html", authors=fetch_authors())


@app.route("/article/<int:row>")
def article_detail(row: int):
    article = fetch_article(row)
    if not article:
        abort(404)
    return render_template("article.html", article=article)


@app.route("/api/articles")
def api_articles():
    q = (request.args.get("q") or "").strip()
    author = (request.args.get("author") or "").strip()
    date_from = (request.args.get("date_from") or "").strip()
    date_to = (request.args.get("date_to") or "").strip()
    sort = request.args.get("sort", "date_desc")
    items = fetch_articles(q=q, author=author, date_from=date_from, date_to=date_to, sort=sort)
    return jsonify({"items": items, "count": len(items)})


@app.route("/api/articles/<int:row>")
def api_article(row: int):
    article = fetch_article(row)
    if not article:
        abort(404)
    return jsonify(article)


@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404

@app.route("/notes")
def notes():
    return render_template("notes.html")

@app.route("/reminders")
def reminders():
    return render_template("reminders.html")
@app.route("/posts")
def posts():
    return render_template("posts.html")


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
