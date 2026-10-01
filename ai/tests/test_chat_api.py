"""API-level chat tests (need FastAPI etc. installed; run: pytest)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def post(**body):
    r = client.post("/ai/chat", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_smalltalk_and_session_memory():
    a = post(query="hello")
    assert a["intent"] == "smalltalk" and a["session_id"]
    b = post(query="What happens if my attendance is below 65%?", session_id=a["session_id"])
    assert b["grounded"] and b["self_check"]["verdict"] in {"SUPPORTED", "PARTIAL"}
    c = post(query="what about between 65 and 75?", session_id=a["session_id"])
    assert c["rewritten_query"] and "attendance" in c["rewritten_query"].lower()
    hist = client.get(f"/ai/chat/sessions/{a['session_id']}").json()
    assert len(hist["turns"]) == 6
    assert client.delete(f"/ai/chat/sessions/{a['session_id']}").status_code == 204
    assert client.get(f"/ai/chat/sessions/{a['session_id']}").status_code == 404


def test_out_of_scope_and_numeric_facts():
    assert post(query="what is the capital of France")["mode"] == "out_of_scope"
    r = post(query="my attendance is 70%, what can I do?")
    assert "condonation" in r["answer"].lower()


def test_stream_emits_meta_tokens_done():
    with client.stream("POST", "/ai/chat/stream", json={"query": "how often does the QR pass refresh"}) as r:
        body = "".join(r.iter_text())
    assert "event: meta" in body and "event: token" in body and "event: done" in body


def test_guidance_intents_and_wellbeing():
    r = post(query="Which hackathons should I join?", student_profile={"semester": 3, "interests": ["python"]})
    assert r["mode"] == "guidance" and r["coaching"]["events"] and "http" in r["answer"]
    m = post(query="I feel so demotivated and can't focus")
    assert m["mode"] == "guidance" and m["coaching"]["next_steps"]
    c = post(query="I want to die")
    assert "14416" in c["answer"] and c["coaching"]["resources"][0]["url"].startswith("https://telemanas")


def test_kb_answer_carries_coaching_but_stays_verified():
    r = post(query="my attendance is 70%, what can I do?")
    assert "condonation" in r["coaching"]["next_steps"][0].lower()
    assert r["self_check"]["verdict"] == "SUPPORTED"
    assert post(query="what is the minimum attendance", coaching=False)["coaching"] is None


def test_guidance_endpoint():
    r = client.post("/ai/guidance", json={"student_profile": {"semester": 2, "interests": ["robotics"]}, "focus": "hardware"}).json()
    assert r["coaching"]["events"] and r["coaching"]["motivation"]
