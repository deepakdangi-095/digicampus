"""In-memory conversation store with TTL + bounded size.

Single-process only. For multiple workers/instances, swap this class for a Redis-backed one exposing
the same four methods (get / append / delete / exists)."""
import threading
import time


class SessionStore:
    def __init__(self, ttl_seconds: int = 7200, max_turns: int = 20, max_sessions: int = 5000) -> None:
        self.ttl, self.max_turns, self.max_sessions = ttl_seconds, max_turns, max_sessions
        self._data: dict[str, dict] = {}
        self._lock = threading.Lock()

    def _evict(self) -> None:
        now = time.monotonic()
        for sid in [s for s, v in self._data.items() if now - v["ts"] > self.ttl]:
            del self._data[sid]
        while len(self._data) > self.max_sessions:
            del self._data[min(self._data, key=lambda s: self._data[s]["ts"])]

    def get(self, sid: str) -> list[dict]:
        with self._lock:
            self._evict()
            s = self._data.get(sid)
            return list(s["turns"]) if s else []

    def exists(self, sid: str) -> bool:
        with self._lock:
            self._evict()
            return sid in self._data

    def append(self, sid: str, role: str, content: str) -> None:
        with self._lock:
            s = self._data.setdefault(sid, {"turns": [], "ts": time.monotonic()})
            s["turns"].append({"role": role, "content": content})
            s["turns"] = s["turns"][-self.max_turns:]
            s["ts"] = time.monotonic()
            self._evict()

    def delete(self, sid: str) -> bool:
        with self._lock:
            return self._data.pop(sid, None) is not None
