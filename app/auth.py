
"""Authentication routes for MOODIFY."""

import re

from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_user, logout_user, current_user
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash

from . import db
from .models import User


auth_bp = Blueprint('auth', __name__, template_folder='templates')


def _wants_json():
    # The sign-in pop-up posts in the background and asks for JSON instead of a redirect.
    return request.headers.get('X-Moodify') == 'json'


def _safe_next(value):
    if value and value.startswith('/') and not value.startswith('//') and '\\' not in value:
        return value
    return None


def _fail(message, endpoint):
    if _wants_json():
        return jsonify(ok=False, error=message), 400
    flash(message)
    return redirect(url_for(endpoint, next=_safe_next(request.form.get('next'))))


def _done(default_endpoint, flash_message):
    flash(flash_message)
    target = _safe_next(request.form.get('next')) if default_endpoint == 'main.index' else None
    target = target or url_for(default_endpoint)
    if _wants_json():
        return jsonify(ok=True, redirect=target)
    return redirect(target)


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():

    if request.method == 'POST':

        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        mobile = request.form.get('mobile', '').strip()
        password = request.form.get('password', '')

        if not all([username, email, mobile, password]):
            return _fail('Please complete all registration fields.', 'auth.register')

        if not re.fullmatch(r'\+?[0-9]{10,15}', mobile):
            return _fail('Please enter a valid mobile number.', 'auth.register')

        if len(password) < 8:
            return _fail('Password must contain at least 8 characters.', 'auth.register')

        if User.query.filter_by(username=username).first():
            return _fail('This username is already taken.', 'auth.register')

        if User.query.filter_by(email=email).first():
            return _fail('An account with this email already exists.', 'auth.register')

        if User.query.filter_by(mobile=mobile).first():
            return _fail('An account with this mobile number already exists.', 'auth.register')

        new_user = User(
            username=username,
            email=email,
            mobile=mobile,
            password=generate_password_hash(password)
        )

        try:
            db.session.add(new_user)
            db.session.commit()

        except IntegrityError:
            db.session.rollback()
            return _fail('These account details are already registered.', 'auth.register')

        login_user(new_user)

        return _done('main.setup', 'Account created successfully! Now personalise your MOODIFY.')

    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    return render_template('auth.html', mode='register', next_url=_safe_next(request.args.get('next')))


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():

    if request.method == 'POST':

        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        user = User.query.filter_by(email=email).first()

        if user and check_password_hash(user.password, password):

            login_user(user)

            if not all([
                user.preferred_language,
                user.preferred_mood,
                user.favorite_singer
            ]):
                return _done('main.setup', 'Logged in successfully!')

            return _done('main.index', 'Logged in successfully!')

        return _fail('Invalid email or password.', 'auth.login')

    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    return render_template('auth.html', mode='login', next_url=_safe_next(request.args.get('next')))


@auth_bp.route('/logout')
def logout():

    logout_user()

    flash('You have been logged out.')

    return redirect(url_for('main.index'))
