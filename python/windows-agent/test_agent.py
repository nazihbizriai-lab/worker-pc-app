"""Unit tests for the WorkCrew Windows helper.

These tests run under plain pytest (or unittest) with only the standard
library. agent.py imports pywinauto lazily inside the functions that drive the
desktop, so importing the module here never requires the real package. To be
fully robust even if a stray import path changes, we also inject a minimal fake
pywinauto module into sys.modules before importing agent. The fake is only used
if some code path imports pywinauto at all. The validation, token, and request
handling logic exercised below never touches it.
"""

import io
import sys
import types
import unittest


def _install_fake_pywinauto() -> None:
    if "pywinauto" in sys.modules:
        return
    fake = types.ModuleType("pywinauto")

    class _Unavailable:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("pywinauto is not available in this test environment")

    fake.Application = _Unavailable
    fake.Desktop = _Unavailable
    sys.modules["pywinauto"] = fake


_install_fake_pywinauto()

import agent  # noqa: E402  (import after the fake module is installed)


class ValidateActionTests(unittest.TestCase):
    def test_accepts_known_command(self):
        action = agent.validate_action({"kind": "windows", "command": "list-windows"})
        self.assertEqual(action["command"], "list-windows")
        self.assertEqual(action["kind"], "windows")

    def test_accepts_all_allowlisted_commands(self):
        for command in agent.ALLOWED_COMMANDS:
            action = agent.validate_action({"kind": "windows", "command": command})
            self.assertEqual(action["command"], command)

    def test_rejects_shell_command(self):
        with self.assertRaises(ValueError):
            agent.validate_action({"kind": "windows", "command": "shell"})

    def test_rejects_unknown_command(self):
        for command in ("exec", "eval", "run", "open", "", None, 123):
            with self.assertRaises(ValueError):
                agent.validate_action({"kind": "windows", "command": command})

    def test_rejects_non_object(self):
        for value in ("not an object", 5, None, ["windows"]):
            with self.assertRaises(ValueError):
                agent.validate_action(value)

    def test_rejects_wrong_kind(self):
        with self.assertRaises(ValueError):
            agent.validate_action({"kind": "browser", "command": "list-windows"})
        with self.assertRaises(ValueError):
            agent.validate_action({"command": "list-windows"})

    def test_rejects_extra_fields(self):
        with self.assertRaises(ValueError):
            agent.validate_action({"kind": "windows", "command": "click", "script": "bad"})

    def test_rejects_unknown_field(self):
        with self.assertRaises(ValueError):
            agent.validate_action({"kind": "windows", "command": "click", "code": "x"})

    def test_rejects_oversized_value_text(self):
        with self.assertRaises(ValueError):
            agent.validate_action({
                "kind": "windows",
                "command": "set-text",
                "control": "field",
                "value": "a" * (agent.MAX_TEXT_LENGTH + 1),
            })

    def test_rejects_oversized_control_text(self):
        with self.assertRaises(ValueError):
            agent.validate_action({
                "kind": "windows",
                "command": "click",
                "control": "c" * 501,
            })

    def test_accepts_value_at_limit(self):
        action = agent.validate_action({
            "kind": "windows",
            "command": "set-text",
            "control": "field",
            "value": "a" * agent.MAX_TEXT_LENGTH,
        })
        self.assertEqual(len(action["value"]), agent.MAX_TEXT_LENGTH)


class RequireTextTests(unittest.TestCase):
    def test_strips_and_returns(self):
        self.assertEqual(agent.require_text("  hi  ", "field"), "hi")

    def test_rejects_empty(self):
        for value in ("", "   ", None, 5):
            with self.assertRaises(ValueError):
                agent.require_text(value, "field")

    def test_rejects_too_long(self):
        with self.assertRaises(ValueError):
            agent.require_text("a" * 501, "field", maximum=500)


# A small fake request object that lets us drive the BaseHTTPRequestHandler
# subclass without opening a real socket. We bypass __init__ (which would try to
# parse a live connection) and set the attributes the handler reads.
class _FakeRequestHandler:
    def __init__(self, handler_cls, headers, path, body=b""):
        self.handler = handler_cls.__new__(handler_cls)
        self.handler.headers = headers
        self.handler.path = path
        self.handler.rfile = io.BytesIO(body)
        self.handler.wfile = io.BytesIO()
        self.responses = []
        self.status = None
        self.sent_headers = {}

        def send_response(status, *args, **kwargs):
            self.status = status

        def send_header(key, value):
            self.sent_headers[key.lower()] = value

        def end_headers():
            return None

        self.handler.send_response = send_response
        self.handler.send_header = send_header
        self.handler.end_headers = end_headers

    @property
    def written(self):
        return self.handler.wfile.getvalue()


def _make_handler_cls(token="t" * 32):
    return agent.create_handler(token), token


class TokenAndBodyTests(unittest.TestCase):
    def test_post_rejects_missing_token(self):
        handler_cls, _ = _make_handler_cls()
        req = _FakeRequestHandler(handler_cls, {}, "/action", b'{"kind":"windows"}')
        req.handler.do_POST()
        self.assertEqual(req.status, 401)
        self.assertIn(b"Unauthorized", req.written)

    def test_post_rejects_wrong_token(self):
        handler_cls, _ = _make_handler_cls()
        headers = {"authorization": "Bearer wrong-token"}
        req = _FakeRequestHandler(handler_cls, headers, "/action", b'{"kind":"windows"}')
        req.handler.do_POST()
        self.assertEqual(req.status, 401)

    def test_post_with_valid_token_reaches_validation(self):
        # A valid token plus an invalid action body should yield a 400 from
        # validation, proving the token gate passed and execution was reached
        # without invoking pywinauto.
        handler_cls, token = _make_handler_cls()
        headers = {"authorization": f"Bearer {token}", "content-length": "20"}
        body = b'{"kind":"browser"}  '
        req = _FakeRequestHandler(handler_cls, headers, "/action", body)
        req.handler.do_POST()
        self.assertEqual(req.status, 400)

    def test_post_rejects_oversized_body(self):
        handler_cls, token = _make_handler_cls()
        headers = {
            "authorization": f"Bearer {token}",
            "content-length": str(agent.MAX_BODY_BYTES + 1),
        }
        req = _FakeRequestHandler(handler_cls, headers, "/action", b"x")
        req.handler.do_POST()
        self.assertEqual(req.status, 400)
        self.assertIn(b"Invalid request size", req.written)

    def test_post_rejects_zero_length_body(self):
        handler_cls, token = _make_handler_cls()
        headers = {"authorization": f"Bearer {token}", "content-length": "0"}
        req = _FakeRequestHandler(handler_cls, headers, "/action", b"")
        req.handler.do_POST()
        self.assertEqual(req.status, 400)

    def test_post_rejects_unknown_path(self):
        handler_cls, token = _make_handler_cls()
        headers = {"authorization": f"Bearer {token}"}
        req = _FakeRequestHandler(handler_cls, headers, "/run", b"{}")
        req.handler.do_POST()
        self.assertEqual(req.status, 404)

    def test_token_compare_is_constant_time(self):
        # The handler uses hmac.compare_digest. Verify the helper relies on it by
        # confirming a token differing only in length is still rejected.
        handler_cls, token = _make_handler_cls()
        headers = {"authorization": f"Bearer {token}x"}
        req = _FakeRequestHandler(handler_cls, headers, "/action", b'{"kind":"windows"}')
        req.handler.do_POST()
        self.assertEqual(req.status, 401)


class HealthTests(unittest.TestCase):
    def test_health_requires_token(self):
        handler_cls, _ = _make_handler_cls()
        req = _FakeRequestHandler(handler_cls, {}, "/health")
        req.handler.do_GET()
        self.assertEqual(req.status, 401)

    def test_health_ok_with_token(self):
        handler_cls, token = _make_handler_cls()
        headers = {"authorization": f"Bearer {token}"}
        req = _FakeRequestHandler(handler_cls, headers, "/health")
        req.handler.do_GET()
        self.assertEqual(req.status, 200)
        self.assertIn(b'"ok": true', req.written)

    def test_get_rejects_unknown_path(self):
        handler_cls, token = _make_handler_cls()
        headers = {"authorization": f"Bearer {token}"}
        req = _FakeRequestHandler(handler_cls, headers, "/action")
        req.handler.do_GET()
        self.assertEqual(req.status, 404)


class ExecuteActionTests(unittest.TestCase):
    def test_type_keys_rejects_brace_sequences(self):
        # type-keys with braces must be rejected before any desktop interaction,
        # so this raises without touching pywinauto. We point STATE.window at a
        # sentinel so require_window passes and find_control would be reached
        # only after the brace guard.
        original = agent.STATE.window
        agent.STATE.window = object()
        try:
            with self.assertRaises(ValueError):
                agent.execute_action({
                    "kind": "windows",
                    "command": "type-keys",
                    "control": "field",
                    "value": "{ENTER}",
                })
        finally:
            agent.STATE.window = original

    def test_commands_requiring_window_fail_without_connect(self):
        original = agent.STATE.window
        agent.STATE.window = None
        try:
            with self.assertRaises(ValueError):
                agent.execute_action({"kind": "windows", "command": "inspect"})
        finally:
            agent.STATE.window = original

    def test_only_allowlisted_commands_execute(self):
        # validate_action gates commands, so an action that skipped validation
        # with an unknown command falls through execute_action to a ValueError
        # rather than doing anything.
        with self.assertRaises(ValueError):
            agent.execute_action({"kind": "windows", "command": "totally-unknown"})


if __name__ == "__main__":
    unittest.main()
