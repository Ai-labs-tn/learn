from fastapi.testclient import TestClient

from main import app


def test_health() -> None:
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_password_login() -> None:
    client = TestClient(app)
    response = client.post("/api/auth/login", json={"email": "user", "password": "User12345"})
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "user"
