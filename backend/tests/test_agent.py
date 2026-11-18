"""Regression tests for the WATTY agent JSON-action extraction fix."""

from __future__ import annotations

import app.ai.agent as agent


def test_extract_action_strips_json_block_from_reply() -> None:
    """The action JSON must be removed from the user-visible reply."""
    raw = 'Je peux le faire. {"action": {"type": "TOGGLE_ECO_MODE", "label": "Basculer"}}'

    action, clean_text = agent.extract_action(raw)

    assert action == {"type": "TOGGLE_ECO_MODE", "label": "Basculer"}
    assert clean_text == "Je peux le faire."
    assert "}" not in clean_text


def test_extract_action_strips_markdown_fence() -> None:
    """Markdown fences around the JSON block are also removed."""
    raw = 'Réponse utile. ```json\n{"action": {"type": "OPEN_SIMULATOR"}}\n```'

    action, clean_text = agent.extract_action(raw)

    assert action == {"type": "OPEN_SIMULATOR"}
    assert clean_text == "Réponse utile."
    assert "}" not in clean_text


def test_extract_action_without_action_returns_plain_text() -> None:
    """Plain text replies pass through unchanged."""
    action, clean_text = agent.extract_action("Bonjour, comment puis-je aider ?")

    assert action is None
    assert clean_text == "Bonjour, comment puis-je aider ?"


async def test_chat_with_watty_returns_clean_reply(monkeypatch) -> None:
    """chat_with_watty must unpack extract_action and never leak the JSON brace."""

    async def fake_context(device_id: str = "SALLE1") -> str:
        return "Appareil SALLE1. Mode Éco: DÉSACTIVÉ."

    async def fake_groq(messages, api_key=None, model=agent.GROQ_MODEL) -> str:
        return '{"action": {"type": "TOGGLE_ECO_MODE", "label": "Basculer le Mode Éco"}}'

    monkeypatch.setattr(agent, "get_current_context", fake_context)
    monkeypatch.setattr(agent, "query_groq", fake_groq)

    result = await agent.chat_with_watty(
        "Active le mode eco",
        device_id="SALLE1",
        groq_api_key="test-key",
    )

    assert result["action"] == {
        "type": "TOGGLE_ECO_MODE",
        "label": "Basculer le Mode Éco",
    }
    assert result["reply"]
    assert "}" not in result["reply"]
