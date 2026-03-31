"""Chat router — WebSocket for streaming + REST for sending messages."""

import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException

from app.database import get_db
from app.auth import decode_token, get_current_user
from app.services.claude_service import stream_chat

router = APIRouter()


@router.websocket("/ws/{session_id}")
async def chat_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming chat.
    Client sends: {"token": "...", "content": "user message"}
    Server sends: streaming events from Claude
    """
    await websocket.accept()

    try:
        # First message must contain auth token
        init_data = await websocket.receive_json()
        token = init_data.get("token", "")
        user_content = init_data.get("content", "")

        if not token:
            await websocket.send_json({"type": "error", "content": "Missing auth token"})
            await websocket.close()
            return

        # Verify token
        try:
            payload = decode_token(token)
            user_id = payload["sub"]
        except Exception:
            await websocket.send_json({"type": "error", "content": "Invalid token"})
            await websocket.close()
            return

        # Verify session belongs to user
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
                (session_id, user_id),
            )
            if not await cursor.fetchone():
                await websocket.send_json({"type": "error", "content": "Session not found"})
                await websocket.close()
                return

            # Get user config
            cursor = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = await cursor.fetchone()
            if not user:
                await websocket.send_json({"type": "error", "content": "User not found"})
                await websocket.close()
                return

            api_key = user["api_key"]
            if not api_key:
                await websocket.send_json({"type": "error", "content": "Please configure your API key in Settings first"})
                await websocket.close()
                return

            base_url = user["base_url"] or ""
            model = user["model"] or "claude-sonnet-4-20250514"
            system_prompt = user["system_prompt"] or ""
            work_dir = f"/data/workspaces/{user_id}"

            # Load conversation history
            cursor = await db.execute(
                "SELECT role, content, tool_calls, tool_results FROM messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            )
            history_rows = await cursor.fetchall()
            history = [
                {
                    "role": r["role"],
                    "content": r["content"],
                    "tool_calls": r["tool_calls"],
                    "tool_results": r["tool_results"],
                }
                for r in history_rows
            ]
        finally:
            await db.close()

        # Process the user message if provided in the initial connect
        if user_content:
            await _process_message(websocket, session_id, user_id, user_content, history, api_key, model, system_prompt, work_dir, base_url)

        # Keep WebSocket open for additional messages
        while True:
            data = await websocket.receive_json()
            content = data.get("content", "")
            if content:
                # Reload history (may have been updated)
                db = await get_db()
                try:
                    cursor = await db.execute(
                        "SELECT role, content, tool_calls, tool_results FROM messages WHERE session_id = ? ORDER BY created_at ASC",
                        (session_id,),
                    )
                    rows = await cursor.fetchall()
                    history = [
                        {
                            "role": r["role"],
                            "content": r["content"],
                            "tool_calls": r["tool_calls"],
                            "tool_results": r["tool_results"],
                        }
                        for r in rows
                    ]
                finally:
                    await db.close()

                await _process_message(websocket, session_id, user_id, content, history, api_key, model, system_prompt, work_dir, base_url)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
        except Exception:
            pass


async def _process_message(
    websocket: WebSocket,
    session_id: str,
    user_id: str,
    content: str,
    history: list[dict],
    api_key: str,
    model: str,
    system_prompt: str,
    work_dir: str,
    base_url: str = "",
):
    """Process a user message: save it, stream Claude's response, save the result."""
    # Save user message
    user_msg_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)",
            (user_msg_id, session_id, content),
        )
        # Auto-title: if session title is still "New Chat", generate from first message
        cursor = await db.execute(
            "SELECT title FROM sessions WHERE id = ?", (session_id,)
        )
        session_row = await cursor.fetchone()
        if session_row and session_row["title"] == "New Chat":
            auto_title = content.strip().replace("\n", " ")[:50]
            if len(content.strip()) > 50:
                auto_title += "..."
            await db.execute(
                "UPDATE sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (auto_title, session_id),
            )
            # Notify client about the title change
            try:
                await websocket.send_json({"type": "session_title", "title": auto_title})
            except Exception:
                pass
        else:
            await db.execute(
                "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id,),
            )
        await db.commit()
    finally:
        await db.close()

    # Add user message to history for API call
    history.append({"role": "user", "content": content})

    # Stream Claude's response
    full_text = ""
    all_tool_calls = []
    all_tool_results = []
    thinking_text = ""

    async for event in stream_chat(
        messages=history,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        work_dir=work_dir,
        base_url=base_url,
    ):
        event_type = event.get("type")

        if event_type == "text_delta":
            full_text += event["content"]
            await websocket.send_json(event)

        elif event_type == "thinking":
            thinking_text += event["content"]
            await websocket.send_json(event)

        elif event_type == "tool_use_start":
            all_tool_calls.append({
                "id": event["tool_id"],
                "name": event["tool_name"],
                "input": event["input"],
            })
            await websocket.send_json(event)

        elif event_type == "tool_output":
            # Real-time streaming output from bash commands
            await websocket.send_json(event)

        elif event_type == "tool_result":
            all_tool_results.append({
                "tool_id": event["tool_id"],
                "tool_name": event["tool_name"],
                "output": event["output"],
            })
            await websocket.send_json(event)

        elif event_type == "message_complete":
            full_text = event.get("content", full_text)
            await websocket.send_json(event)

        elif event_type == "error":
            await websocket.send_json(event)

        elif event_type == "done":
            await websocket.send_json(event)

    # Save assistant message
    assistant_msg_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO messages (id, session_id, role, content, tool_calls, tool_results, thinking) VALUES (?, ?, 'assistant', ?, ?, ?, ?)",
            (
                assistant_msg_id,
                session_id,
                full_text,
                json.dumps(all_tool_calls) if all_tool_calls else None,
                json.dumps(all_tool_results) if all_tool_results else None,
                thinking_text if thinking_text else None,
            ),
        )
        await db.execute(
            "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (session_id,),
        )
        await db.commit()
    finally:
        await db.close()


@router.post("/send/{session_id}")
async def send_message_rest(session_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """REST fallback for sending a message (non-streaming). Returns the full response."""
    content = data.get("content", "")
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    db = await get_db()
    try:
        # Verify session
        cursor = await db.execute(
            "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
            (session_id, current_user["id"]),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

        # Get user config
        cursor = await db.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],))
        user = await cursor.fetchone()
        api_key = user["api_key"]
        if not api_key:
            raise HTTPException(status_code=400, detail="API key not configured")

        base_url = user["base_url"] or ""
        model = user["model"] or "claude-sonnet-4-20250514"
        system_prompt = user["system_prompt"] or ""
        work_dir = f"/data/workspaces/{current_user['id']}"

        # Get history
        cursor = await db.execute(
            "SELECT role, content, tool_calls, tool_results FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        history = [
            {"role": r["role"], "content": r["content"], "tool_calls": r["tool_calls"], "tool_results": r["tool_results"]}
            for r in rows
        ]

        # Save user message
        user_msg_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)",
            (user_msg_id, session_id, content),
        )
        await db.commit()
    finally:
        await db.close()

    history.append({"role": "user", "content": content})

    # Collect full response
    full_text = ""
    all_tool_calls = []
    all_tool_results = []

    async for event in stream_chat(
        messages=history,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        work_dir=work_dir,
        base_url=base_url,
    ):
        if event["type"] == "text_delta":
            full_text += event["content"]
        elif event["type"] == "tool_use_start":
            all_tool_calls.append({"name": event["tool_name"], "input": event["input"]})
        elif event["type"] == "tool_result":
            all_tool_results.append({"tool_name": event["tool_name"], "output": event["output"]})
        elif event["type"] == "message_complete":
            full_text = event.get("content", full_text)

    # Save
    assistant_msg_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO messages (id, session_id, role, content, tool_calls, tool_results) VALUES (?, ?, 'assistant', ?, ?, ?)",
            (
                assistant_msg_id,
                session_id,
                full_text,
                json.dumps(all_tool_calls) if all_tool_calls else None,
                json.dumps(all_tool_results) if all_tool_results else None,
            ),
        )
        await db.commit()
    finally:
        await db.close()

    return {
        "content": full_text,
        "tool_calls": all_tool_calls,
        "tool_results": all_tool_results,
    }
