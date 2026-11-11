"""Application entry point"""

from app import create_app, db

app = create_app()

# Create DB tables if they don't exist
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    # Run in debug mode for development (auto reload)
    app.run(host='127.0.0.1', port=5000, debug=True)
