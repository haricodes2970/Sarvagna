import httpx
import asyncio

BASE = "http://localhost:8000"

async def test():
    async with httpx.AsyncClient() as client:
        # health
        r = await client.get(f"{BASE}/health")
        print("HEALTH:", r.json())

        # register
        r = await client.post(f"{BASE}/auth/register", json={
            "email": "test@vtu.ac.in",
            "password": "test1234",
            "name": "Test Student",
            "branch": "CS",
            "semester": 5
        })
        print("REGISTER:", r.status_code, r.json())

        # login
        r = await client.post(f"{BASE}/auth/login", json={
            "email": "test@vtu.ac.in",
            "password": "test1234"
        })
        token = r.json().get("access_token")
        print("LOGIN:", r.status_code, "token received:", bool(token))

        headers = {"Authorization": f"Bearer {token}"}

        # me
        r = await client.get(f"{BASE}/auth/me", headers=headers)
        print("ME:", r.json())

        # progress
        r = await client.get(f"{BASE}/progress", headers=headers)
        print("PROGRESS:", r.json())

        # add subject
        r = await client.post(f"{BASE}/subjects", headers=headers, json={
            "code": "BCS501",
            "name": "DAA",
            "branch": "CS",
            "semester": 5
        })
        print("ADD SUBJECT:", r.status_code, r.json())

        # list subjects
        r = await client.get(f"{BASE}/subjects", headers=headers)
        print("SUBJECTS:", r.json())

asyncio.run(test())
