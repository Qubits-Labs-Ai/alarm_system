import sqlite3
import os

db_path = 'alerts.db'
print(f'DB exists: {os.path.exists(db_path)}')
print(f'DB size: {os.path.getsize(db_path) / (1024*1024):.2f} MB')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
print(f'Tables: {cursor.fetchall()}')

try:
    cursor.execute('SELECT COUNT(*) FROM alerts')
    print(f'Total rows: {cursor.fetchone()[0]}')
    
    cursor.execute('SELECT COUNT(DISTINCT Source) FROM alerts')
    print(f'Unique sources: {cursor.fetchone()[0]}')
    
    cursor.execute('SELECT MIN("Event Time"), MAX("Event Time") FROM alerts')
    times = cursor.fetchone()
    print(f'Date range: {times[0]} to {times[1]}')

    # Action distribution and blanks
    cursor.execute("""
        SELECT COALESCE(TRIM(Action), '') as ActionVal, COUNT(*) as cnt
        FROM alerts
        GROUP BY ActionVal
        ORDER BY cnt DESC
        LIMIT 15
    """)
    print('Top Action values:', cursor.fetchall())

    cursor.execute("SELECT COUNT(*) FROM alerts WHERE Action IS NULL OR TRIM(Action) = ''")
    print('Blank/NULL Action rows:', cursor.fetchone()[0])

    # Sample with blank actions
    cursor.execute("""
        SELECT "Event Time", Source, Action, Condition, Priority
        FROM alerts
        WHERE Action IS NULL OR TRIM(Action) = ''
        ORDER BY "Event Time" DESC
        LIMIT 5
    """)
    print('Sample blank-Action rows:', cursor.fetchall())

    # Pick a source that has blanks and show a short sequence
    cursor.execute("""
        SELECT Source
        FROM alerts
        WHERE Action IS NULL OR TRIM(Action) = ''
        GROUP BY Source
        ORDER BY COUNT(*) DESC
        LIMIT 1
    """)
    row = cursor.fetchone()
    if row:
        src = row[0]
        print('Sample sequence for source with blanks:', src)
        cursor.execute("""
            SELECT "Event Time", Source, Action
            FROM alerts
            WHERE Source = ?
            ORDER BY "Event Time" DESC
            LIMIT 10
        """, (src,))
        print(cursor.fetchall())
except Exception as e:
    print(f'Error: {e}')

conn.close()
