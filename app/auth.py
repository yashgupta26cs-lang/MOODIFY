
"""Authentication routes for MOODIFY."""

import re

from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash

from . import db
from .models import User


auth_bp = Blueprint('auth', __name__, template_folder='templates')


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():

    if request.method == 'POST':

        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        mobile = request.form.get('mobile', '').strip()
        password = request.form.get('password', '')

        if not all([username, email, mobile, password]):
            flash('Please complete all registration fields.')
            return redirect(url_for('auth.register'))

        if not re.fullmatch(r'\+?[0-9]{10,15}', mobile):
            flash('Please enter a valid mobile number.')
            return redirect(url_for('auth.register'))

        if len(password) < 8:
            flash('Password must contain at least 8 characters.')
            return redirect(url_for('auth.register'))

        if User.query.filter_by(username=username).first():
            flash('This username is already taken.')
            return redirect(url_for('auth.register'))

        if User.query.filter_by(email=email).first():
            flash('An account with this email already exists.')
            return redirect(url_for('auth.register'))

        if User.query.filter_by(mobile=mobile).first():
            flash('An account with this mobile number already exists.')
            return redirect(url_for('auth.register'))

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
            flash('These account details are already registered.')
            return redirect(url_for('auth.register'))

        login_user(new_user)

        flash('Account created successfully! Now personalise your MOODIFY.')

        return redirect(url_for('main.setup'))

    return render_template('register.html')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():

    if request.method == 'POST':

        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        user = User.query.filter_by(email=email).first()

        if user and check_password_hash(user.password, password):

            login_user(user)

            flash('Logged in successfully!')

            if not all([
                user.preferred_language,
                user.preferred_mood,
                user.favorite_singer
            ]):
                return redirect(url_for('main.setup'))

            return redirect(url_for('main.home'))

        flash('Invalid email or password.')
        return redirect(url_for('auth.login'))

    return render_template('login.html')


@auth_bp.route('/logout')
@login_required
def logout():

    logout_user()

    flash('You have been logged out.')

    return redirect(url_for('auth.login'))
