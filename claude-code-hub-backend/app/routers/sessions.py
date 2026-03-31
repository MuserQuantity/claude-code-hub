import uuid
from fastapi import APIRouter, HTTPException, Depends

from app.database import get_db
from app.auth import get_current_user
from app.models import SessionCreate, SessionUpdate, SessionResponse

router = APIRouter()


@router.get("/")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT s.*,
                   (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
            FROM sessions s
            WHERE s.user_id = ?
            ORDER BY s.updated_at DESC
            """,
            (current_user["id"],),
        )
        rows = await cursor.fetchall()
        return [
            SessionResponse(
                id=r["id"],
                user_id=r["user_id"],
                title=r["title"],
                created_at=str(r["created_at"]),
                updated_at=str(r["updated_at"]),
                last_message=r["last_message"],
            )
            for r in rows
        ]
    finally:
        await db.close()


@router.post("/")
async def create_session(data: SessionCreate, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        session_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)",
            (session_id, current_user["id"], data.title),
        )
        await db.commit()
        return {"id": session_id, "title": data.title}
    finally:
        await db.close()


@router.patch("/{session_id}")
async def update_session(session_id: str, data: SessionUpdate, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
            (session_id, current_user["id"]),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

        await db.execute("UPDATE sessions SET title = ? WHERE id = ?", (data.title, session_id))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.delete("/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
            (session_id, current_user["id"]),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

        await db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.get("/{session_id}/messages")
async def get_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
            (session_id, current_user["id"]),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

        cursor = await db.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": r["id"],
                "session_id": r["session_id"],
                "role": r["role"],
                "content": r["content"],
                "tool_calls": r["tool_calls"],
                "tool_results": r["tool_results"],
                "thinking": r["thinking"],
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    finally:
        await db.close()
