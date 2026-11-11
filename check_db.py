"""Read-only database check.

Connects using your .env settings and lists every table with its row count.
It only runs SELECT statements. It never creates, changes, or deletes anything,
and it never prints your password.

Run:  python check_db.py
"""

import os
import sys

from sqlalchemy import inspect, text


def main():
    try:
        from app import create_app, db
        app = create_app()
    except RuntimeError as err:
        print("SETTINGS PROBLEM:", err)
        sys.exit(1)

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            tables = sorted(inspector.get_table_names())
            print("Connected to database:", db.engine.url.database)
            print(f"Found {len(tables)} table(s):")
            with db.engine.connect() as conn:
                for table in tables:
                    safe_name = table.replace("`", "")
                    count = conn.execute(
                        text(f"SELECT COUNT(*) FROM `{safe_name}`")
                    ).scalar()
                    print(f"  - {table}: {count} row(s)")
            print("OK: read-only check finished. Nothing was changed.")
        except Exception as err:  # noqa: BLE001
            message = str(err)
            secret = os.getenv("DB_PASSWORD")
            if secret:
                message = message.replace(secret, "********")
            print("CONNECTION PROBLEM:", type(err).__name__)
            print(message.splitlines()[0] if message else "")
            sys.exit(1)


if __name__ == "__main__":
    main()
