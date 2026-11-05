"""Opt-in hosted smoke checks using private generated credentials; no secret output."""
from pathlib import Path
import json
import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
UI = 'https://learn-with-saravana.onrender.com'
API = 'https://learn-with-saravana-api.onrender.com'
values = dict(line.split('=', 1) for line in (ROOT / '.env.render').read_text(encoding='utf-8').splitlines() if '=' in line)
results = []


def check(name, condition):
    results.append({'check': name, 'passed': bool(condition)})
    if not condition:
        raise RuntimeError(name)


try:
    with httpx.Client(base_url=UI, timeout=120, follow_redirects=False) as client:
        check('Direct API health', client.get(API + '/api/health').status_code == 200)
        health = client.get('/api/health', params={'verify': 'hosted-phase1'})
        check('Static same-origin rewrite returns API JSON', health.status_code == 200 and health.json().get('ok') is True)
        check('Anonymous Studio denied', client.get('/api/studio/status').status_code == 401)
        headers = {'Origin': UI}
        for role, key in [('admin', 'BOOTSTRAP_ADMIN_PASSWORD'), ('guest', 'GUEST_PASSWORD')]:
            result = client.post('/api/auth/login', json={'username': role, 'password': values[key]}, headers=headers)
            check(role + ' POST login through static rewrite', result.status_code == 200)
            body = result.json()
            check(role + ' role from server', body['user']['role'] == role)
            cookie = next((c for c in client.cookies.jar if c.name == '__Host-learn_session'), None)
            check(role + ' host-only Secure session cookie', cookie is not None and cookie.secure and not cookie.domain_specified)
            raw = result.headers.get('set-cookie', '').lower()
            check(role + ' HttpOnly and SameSite cookie', 'httponly' in raw and 'samesite=lax' in raw)
            me = client.get('/api/auth/me')
            check(role + ' cookie survives proxied subsequent request', me.status_code == 200 and me.json()['user']['role'] == role)
            check(role + ' API is not cached', me.headers.get('cache-control') == 'no-store')
            studio = client.get('/api/studio/status')
            check(role + ' server Studio permissions', studio.status_code == (200 if role == 'admin' else 403))
            check(role + ' missing CSRF denied', client.post('/api/auth/logout', headers=headers).status_code == 403)
            check(role + ' foreign origin denied', client.post('/api/auth/logout', headers={'Origin': 'https://example.invalid', 'X-CSRF-Token': body['csrfToken']}).status_code == 403)
            old = cookie.value
            check(role + ' valid logout', client.post('/api/auth/logout', headers={**headers, 'X-CSRF-Token': body['csrfToken']}).status_code == 200)
            check(role + ' session revoked', client.get('/api/auth/me').status_code == 401)
            replay = client.get('/api/auth/me', headers={'Cookie': '__Host-learn_session=' + old})
            check(role + ' old cookie replay denied', replay.status_code == 401)
        check('Legacy demo OTP disabled', client.post('/api/auth/otp/request', json={'identifier': 'admin'}).status_code == 404)
    with psycopg.connect(values['DATABASE_URL'], connect_timeout=20) as connection:
        with connection.cursor() as cursor:
            cursor.execute('SELECT current_database(), current_user')
            check('Isolated Learn database and role', cursor.fetchone() == ('learn_studio', 'learn_studio_app'))
            cursor.execute('SELECT rolcreatedb, rolcreaterole, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user')
            check('App role has no administrative capabilities', not any(cursor.fetchone()))
            cursor.execute('SELECT version_num FROM alembic_version')
            check('Learn migrations persisted on PostgreSQL', cursor.fetchone() is not None)
except Exception as error:
    results.append({'error_type': type(error).__name__})
    status = 'FAILED'
else:
    status = 'PASSED'
report = {'status': status, 'ui': UI, 'api': API, 'checks': results}
out = ROOT / 'acceptance-tests' / 'phase-01' / 'hosted-api-results.json'
out.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
raise SystemExit(0 if status == 'PASSED' else 1)
