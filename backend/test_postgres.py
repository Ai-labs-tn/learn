"""Optional real-PostgreSQL acceptance; CI uses a disposable service database only."""
import os
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.settings import Settings

URL = os.getenv('TEST_POSTGRES_URL')
pytestmark = pytest.mark.skipif(not URL, reason='Disposable PostgreSQL not configured locally')


def test_postgres_migrate_bootstrap_auth_and_restart(monkeypatch):
    assert URL is not None
    parsed = urlsplit(URL.replace('postgresql+psycopg://', 'postgresql://'))
    assert parsed.hostname in {'localhost', '127.0.0.1'}, 'Refusing a nonlocal test database'
    assert parsed.path.endswith('/learn_acceptance'), 'Use the disposable acceptance database only'
    monkeypatch.setenv('BOOTSTRAP_ADMIN_PASSWORD', 'LocalAdmin123!Only')
    monkeypatch.setenv('GUEST_PASSWORD', 'LocalGuest123!Only')
    settings = Settings(environment='test', database_url=URL, app_origin='http://localhost:5173', login_limit=200)
    headers = {'Origin': settings.app_origin}
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/health').status_code == 200
        result = client.post('/api/auth/login', json={'username': 'guest', 'password': 'LocalGuest123!Only'}, headers=headers)
        assert result.status_code == 200
        cookie = client.cookies.get('learn_session')
        csrf = result.json()['csrfToken']
        assert client.get('/api/studio/status').status_code == 403
        assert client.post('/api/auth/logout', headers=headers).status_code == 403
    # Re-running migrations/bootstrap must preserve the session and both account hashes.
    with TestClient(create_app(settings)) as restarted:
        restarted.cookies.set('learn_session', cookie)
        assert restarted.get('/api/auth/me').status_code == 200
        assert restarted.post('/api/auth/logout', headers={**headers, 'X-CSRF-Token': csrf}).status_code == 200
        restarted.cookies.set('learn_session', cookie)
        assert restarted.get('/api/auth/me').status_code == 401
        result = restarted.post('/api/auth/login', json={'username': 'admin', 'password': 'LocalAdmin123!Only'}, headers=headers)
        assert result.status_code == 200
        assert restarted.get('/api/studio/status').status_code == 200
        # Exercise concurrent independent username buckets plus the shared client-IP bucket.
        from concurrent.futures import ThreadPoolExecutor
        def failed_attempt(index):
            return restarted.post('/api/auth/login', json={
                'username': f'unknown{index}', 'password': 'DisposableWrong123!'
            }, headers=headers).status_code
        with ThreadPoolExecutor(max_workers=4) as pool:
            assert list(pool.map(failed_attempt, range(8))) == [401] * 8
