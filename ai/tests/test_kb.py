"""Offline tests: no FastAPI / LangChain / network needed."""
from pathlib import Path

from app.services.kb_loader import TfidfRetriever, load_chunks
from app.services.policy_rules import extract_facts

KB = Path(__file__).resolve().parents[1] / "data" / "knowledge"
retriever = TfidfRetriever(load_chunks(KB))


def top(q):
    return retriever.search(q, 1)[0]


def test_retrieval_hits_right_sections():
    assert "Grading" in top("grade point for A+")[0].section
    assert "Seating" in top("how does seating allocation work")[0].section
    assert "Placement" in top("what CGPA is needed for placements")[0].section
    assert "Escalation" in top("escalation if application pending")[0].text


def test_out_of_scope_scores_near_zero():
    assert top("what is the capital of France")[1] < 0.08


def test_policy_facts():
    assert "condonation" in extract_facts("my attendance is 70%")[0].lower()
    assert "barred" in extract_facts("attendance 60 percent")[0]
    assert "below the 6.50" in extract_facts("cgpa 6.2 placement")[0]


# ---- self-argument, sessions, small talk (also offline) ----------------------
import json  # noqa: E402

from app.services.chat_sessions import SessionStore  # noqa: E402
from app.services.self_check import argue_and_revise, verify  # noqa: E402
from app.services.smalltalk import detect_intent  # noqa: E402

EVIDENCE = [c.text for c, _ in retriever.search("minimum attendance condonation band", 3)]


def test_verify_flags_wrong_number():
    good = verify("The mandatory minimum attendance is 75% for each course.", EVIDENCE)
    bad = verify("The mandatory minimum attendance is 85% for each course.", EVIDENCE)
    assert good.verdict == "SUPPORTED"
    assert bad.verdict == "UNSUPPORTED" and not bad.claims[0].supported


def test_verify_allows_numbers_echoed_from_question():
    r = verify("At 70% attendance you are below the mandatory 75% minimum.", EVIDENCE, question="my attendance is 70%")
    assert r.verdict == "SUPPORTED"


class FakeLLM:
    def __init__(self, replies):
        self.replies = list(replies)

    def invoke(self, _prompt):
        class R:
            content = self.replies.pop(0)
        return R()


def test_argue_and_revise_corrects_draft():
    llm = FakeLLM([json.dumps({"arguments_against": ["85% is not in the context"],
                               "final_answer": "The minimum attendance is 75%.", "changed": True})])
    final, args, rounds, changed = argue_and_revise(llm, "min attendance?", "ctx", "The minimum is 85%.", rounds=2)
    assert final == "The minimum attendance is 75%." and changed and rounds == 1 and args


def test_argue_and_revise_survives_garbage():
    final, args, rounds, changed = argue_and_revise(FakeLLM(["not json"]), "q", "ctx", "draft", rounds=1)
    assert final == "draft" and not changed and rounds == 0


def test_sessions_ttl_and_trim():
    s = SessionStore(ttl_seconds=3600, max_turns=4)
    for i in range(6):
        s.append("a", "user", f"m{i}")
    assert [t["content"] for t in s.get("a")] == ["m2", "m3", "m4", "m5"]
    assert s.delete("a") and not s.exists("a")


def test_smalltalk_intent():
    assert detect_intent("hello") == "greeting"
    assert detect_intent("thanks!") == "thanks"
    assert detect_intent("what can you do?") == "identity"
    assert detect_intent("hi, what is the minimum attendance?") is None
    assert detect_intent("thanks, what about hostel timings?") is None


# ---- mentor / guidance layer ---------------------------------------------------
import json as _json  # noqa: E402

from app.services import guidance  # noqa: E402
from app.services.wellbeing import is_crisis  # noqa: E402

CATS = guidance.load_catalogs(str(KB.parent))


def test_catalog_urls_are_https_and_complete():
    events, resources = CATS
    for e in events:
        assert e["how_to_join"] and e["min_semester"] >= 1 and (e["url"] is None or e["url"].startswith("https://"))
    for r in resources:
        assert r["url"].startswith("https://") and r["why"] and r["tags"]


def test_guidance_intent_routing():
    gi = guidance.guidance_intent
    assert gi("Which hackathons should I join?") == "events"
    assert gi("suggest free courses to learn python") == "resources"
    assert gi("I feel demotivated and can't focus") == "motivation"
    # policy questions must still reach the knowledge base
    assert gi("Can attendance lost at a sports event be condoned?") is None
    assert gi("what is the minimum attendance required?") is None
    assert gi("Can I get another job offer after placement?") is None


def test_events_matched_to_interests_and_semester():
    p = guidance.Profile(semester=1, interests=["robotics", "python"])
    names = [e.name for e in guidance.pick_events("", None, p, CATS, k=3)]
    assert "Google Summer of Code" not in names  # min semester 3
    late = guidance.pick_events("machine learning", None, guidance.Profile(semester=5), CATS, k=1)[0]
    assert late.name == "Kaggle Competitions"


def test_resources_topic_matching_and_wellbeing_gate():
    r = guidance.pick_resources("resources for dsa interview prep", None, guidance.Profile(), CATS, k=3)
    assert {"LeetCode", "GeeksforGeeks"} & {x.title for x in r}
    assert all("Tele-MANAS" not in x.title for x in guidance.pick_resources("learn python", None, guidance.Profile(), CATS, k=6))


def test_coaching_for_attendance_bands():
    low = guidance.build_coaching("my attendance is 60%", "regulations", guidance.Profile(), "s", CATS)
    mid = guidance.build_coaching("my attendance is 70%", "regulations", guidance.Profile(), "s", CATS)
    assert "Faculty Advisor" in low.next_steps[0] and not low.events
    assert "condonation form" in mid.next_steps[0]


def test_motivation_reply_mentions_support_only_when_stressed():
    t1, _ = guidance.motivation_reply("I feel lazy today", guidance.Profile(), "s", CATS)
    t2, c2 = guidance.motivation_reply("I am so stressed and overwhelmed", guidance.Profile(), "s", CATS)
    assert "Tele-MANAS" not in t1 and "Tele-MANAS" in t2 and c2.events


def test_crisis_detection():
    assert is_crisis("I want to die") and is_crisis("thinking of suicide")
    assert not is_crisis("this exam is killing me lol") and not is_crisis("what is the passing criterion")
