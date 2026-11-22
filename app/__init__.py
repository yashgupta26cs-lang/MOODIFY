"""Flask application factory and extensions"""

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_migrate import Migrate

# extensions
db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
migrate = Migrate()

def create_app():
    """Create and configure the Flask application instance."""
    app = Flask(__name__)
    app.config.from_object('config.Config')

    # initialise extensions
    db.init_app(app)
    login_manager.init_app(app)
    migrate.init_app(app, db)

    # make sure the models are registered (needed by Flask-Migrate)
    from . import models  # noqa: F401

    # Create only the additive catalogue-playlist table when it is first needed.
    # Existing tables are left untouched; this keeps current user data safe.
    with app.app_context():
        db.create_all()

    # register blueprints
    from .auth import auth_bp
    from .main import main_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)

    return app
